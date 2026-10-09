// Wrapper around `next dev` that accepts `--host` as an alias for `--hostname`.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const args = [];
for (const arg of process.argv.slice(2)) {
  if (arg === "--host") args.push("--hostname");
  else if (arg.startsWith("--host=")) args.push(`--hostname=${arg.slice("--host=".length)}`);
  else args.push(arg);
}

const child = spawn(process.execPath, [nextBin, "dev", ...args], { stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
