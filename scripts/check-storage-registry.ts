import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, relative } from "path";
import { STORAGE_ENTRIES, TRACKERS, StorageEntry } from "../lib/storage-registry";

const root = join(__dirname, "..");
const rel = (p: string) => relative(root, p).split("\\").join("/");
const warnOnly = process.env.STORAGE_CHECK === "warn";

const problems: string[] = [];
const seen = { storage: 0, trackers: 0 };

function walk(dir: string, out: string[]) {
  if (!existsSync(dir)) return;
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(n)) out.push(p);
  }
}

const files: string[] = [];
for (const d of ["app", "components", "lib", "worker"]) walk(join(root, d), files);
for (const f of ["middleware.ts", "instrumentation.ts"]) if (existsSync(join(root, f))) files.push(join(root, f));
for (const n of readdirSync(root)) if (/^next\.config\./.test(n)) files.push(join(root, n));

const lineOf = (text: string, idx: number) => text.slice(0, idx).split("\n").length;
const snippet = (kind: StorageEntry["kind"], name: string, setIn: string, essential = true) =>
  `  { kind: "${kind}", name: "${name}", purpose: "TODO", duration: "TODO", essential: ${essential}, setIn: "${setIn}" },`;

/** Resolves a literal ('x', "x", `x`) or a same-file const identifier to a string; null if unresolved. */
export function resolveName(arg: string, text: string): string | null {
  const a = arg.trim();
  const lit = /^(['"`])([^'"`$]*)\1$/.exec(a);
  if (lit) return lit[2];
  if (/^[A-Za-z_$][\w$]*$/.test(a)) {
    const m = new RegExp(`const\\s+${a.replace(/\$/g, "\\$")}\\s*(?::[^=]+)?=\\s*(['"\`])([^'"\`$]*)\\1`).exec(text);
    if (m) return m[2];
  }
  return null;
}

const registered = (kind: string, name: string) => STORAGE_ENTRIES.some((e) => e.kind === kind && e.name === name);

type Found = { kind: StorageEntry["kind"]; name: string; file: string; line: number };
const found: Found[] = [];

for (const f of files) {
  const text = readFileSync(f, "utf8");
  const file = rel(f);
  if (file === "lib/storage-registry.ts") continue;

  // cookie writes (first argument)
  for (const m of text.matchAll(/(?:\bcookies\(\)\)|\bjar|\.cookies)\.(?:set|delete)\(\s*([^,)]+)/g)) {
    const name = resolveName(m[1], text);
    const line = lineOf(text, m.index!);
    if (!name) problems.push(`${file}:${line}  cookie name '${m[1].trim()}' can't be resolved; use a string literal or a const in the same file so it can be checked.`);
    else found.push({ kind: "cookie", name, file, line });
  }
  for (const m of text.matchAll(/document\.cookie\s*=\s*([`'"])([^=;`'"]+)/g)) found.push({ kind: "cookie", name: m[2].trim(), file, line: lineOf(text, m.index!) });
  for (const m of text.matchAll(/set-cookie/gi)) {
    const line = lineOf(text, m.index!);
    const ln = text.split("\n")[line - 1];
    const v = /set-cookie['"`]?\s*[,:]\s*[`'"]([^=;`'"]+)=/i.exec(ln);
    if (v) found.push({ kind: "cookie", name: v[1].trim(), file, line });
    else problems.push(`${file}:${line}  Set-Cookie header found but the cookie name can't be resolved; use a literal name.`);
  }

  // browser storage (also inside inline script strings)
  for (const m of text.matchAll(/(localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*\\?(['"`])([^'"`\\]+)\\?\2/g))
    found.push({ kind: m[1] as "localStorage" | "sessionStorage", name: m[3], file, line: lineOf(text, m.index!) });
  for (const m of text.matchAll(/(localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) {
    const name = resolveName(m[2], text);
    if (name) found.push({ kind: m[1] as "localStorage" | "sessionStorage", name, file, line: lineOf(text, m.index!) });
    else problems.push(`${file}:${lineOf(text, m.index!)}  ${m[1]} key '${m[2]}' can't be resolved; use a literal or same-file const.`);
  }

  // trackers in source
  const needles = [
    "next/script", "googletagmanager.com", "google-analytics.com", "gtag(", "fbq(", "connect.facebook.net", "hotjar",
    "clarity.ms", "plausible.io", "segment.com", "cdn.mxpnl.com", "static.cloudflareinsights.com",
  ];
  const hits: [string, number][] = [];
  for (const n of needles) { const i = text.indexOf(n); if (i >= 0) hits.push([n, i]); }
  for (const m of text.matchAll(/<(?:script|Script|iframe)\b[^>]*\bsrc=["'`{]*\s*["'`]?(https?:\/\/[^"'`\s}]+)/g)) hits.push([m[1], m.index!]);
  for (const [needle, idx] of hits) {
    if (!TRACKERS.some((t) => t.match.some((x) => needle.includes(x) || x.includes(needle)))) {
      problems.push(`${file}:${lineOf(text, idx)}  possible tracker/external script '${needle}' is not in TRACKERS (lib/storage-registry.ts).\n    Add: { name: "...", provider: "...", collects: "...", optOut: "...", match: ["${needle}"] }`);
    } else seen.trackers++;
  }
}

for (const f of found) {
  if (!registered(f.kind, f.name)) problems.push(`${f.file}:${f.line}  ${f.kind} '${f.name}' is used but not documented.\n    Add to STORAGE_ENTRIES:\n${snippet(f.kind, f.name, f.file)}`);
  else seen.storage++;
}

// package.json trackers
const DENY = [/^posthog/, /^@vercel\/analytics$/, /^@vercel\/speed-insights$/, /^@sentry\//, /^mixpanel/, /^amplitude/, /^@amplitude\//, /^@segment\//, /^analytics$/, /^react-ga/, /^@react-ga/, /^hotjar/, /^@microsoft\/clarity$/, /^plausible/, /^fathom/, /^logrocket/, /^fullstory/, /^@fullstory\//, /^intercom/, /^crisp/, /^@datadog\/browser-rum/];
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
for (const sect of ["dependencies", "devDependencies", "optionalDependencies"]) {
  for (const dep of Object.keys(pkg[sect] ?? {})) {
    if (!DENY.some((re) => re.test(dep))) continue;
    if (TRACKERS.some((t) => t.match.some((m) => dep === m || dep.startsWith(m)))) seen.trackers++;
    else problems.push(`package.json  tracker dependency '${dep}' is not in TRACKERS.\n    Add: { name: "${dep}", provider: "TODO", collects: "TODO", optOut: "TODO", match: ["${dep}"] }`);
  }
}

// stale entries + placeholders
for (const e of STORAGE_ENTRIES) {
  const p = join(root, e.setIn);
  if (!existsSync(p) || !readFileSync(p, "utf8").includes(e.name))
    problems.push(`lib/storage-registry.ts  ${e.kind} '${e.name}' is listed on the privacy page but no longer in ${e.setIn}. Remove it or fix setIn.`);
  if (e.purpose.trim() === "TODO" || e.duration.trim() === "TODO") problems.push(`lib/storage-registry.ts  '${e.name}' still has a TODO purpose/duration; fill it in before shipping.`);
}
for (const t of TRACKERS) if ([t.provider, t.collects, t.optOut].some((v) => v.trim() === "TODO")) problems.push(`lib/storage-registry.ts  tracker '${t.name}' still has TODO fields.`);

if (problems.length) {
  console.error("\nStorage registry check found problems:\n");
  for (const p of problems) console.error(" - " + p);
  if (warnOnly) {
    console.error("\n############################################################");
    console.error("# PRIVACY PAGE MAY BE INACCURATE: add the missing entries to lib/storage-registry.ts");
    console.error("############################################################\n");
    process.exit(0);
  }
  console.error("\nFix the above (or, for an emergency hotfix only, run with STORAGE_CHECK=warn).");
  process.exit(1);
}
console.log(`storage check: ${STORAGE_ENTRIES.length} cookies/storage keys and ${TRACKERS.length} trackers, all documented`);
