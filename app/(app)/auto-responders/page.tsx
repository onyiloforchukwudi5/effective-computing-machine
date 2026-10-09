"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { HINT_COPY } from "@/lib/deliverability";
import SendVia, { useSendOptions } from "@/components/SendVia";

type R = { id: string; name: string; accountId: string; enabled: boolean; paused: boolean; mode: string; sendViaType: string; sendViaId: string | null; instructions: string; knowledgeText: string; onlyKnownContacts: boolean; folderFilter: string | null; toAddressFilter: string | null; keywordsInclude: string; keywordsExclude: string; activeStartHour: number; activeEndHour: number; timezone: string; maxRepliesPerContactPerDay: number; maxRepliesPerDay: number; cooldownHours: number; escalationKeywords: string; saveCopyToSent: boolean; maxAgeDays: number; dryRunOkAt: string | null };
type Log = { id: string; responder: string; messageId: string; subject: string | null; contactEmail: string; decision: string; reason: string; error: string | null; createdAt: string; draft: { body: string; status: string } | null };
type Acc = { id: string; label: string };
type Dry = { subject: string | null; from: string | null; decision: string; reason: string; reply: string | null };

const blank = { name: "", accountId: "", sendViaType: "ACCOUNT", sendViaId: null as string | null, instructions: "", knowledgeText: "", onlyKnownContacts: false, folderFilter: null, toAddressFilter: null, keywordsInclude: "", keywordsExclude: "", activeStartHour: 0, activeEndHour: 24, timezone: "UTC", maxRepliesPerContactPerDay: 1, maxRepliesPerDay: 30, cooldownHours: 24, escalationKeywords: "refund,legal,lawyer,cancel,chargeback,complaint,discount", saveCopyToSent: true, maxAgeDays: 3 };

export default function AutoResponders() {
  const options = useSendOptions();
  const [list, setList] = useState<R[]>([]), [logs, setLogs] = useState<Log[]>([]), [accs, setAccs] = useState<Acc[]>([]);
  const [f, setF] = useState<typeof blank>(blank), [editing, setEditing] = useState<string | null>(null), [msg, setMsg] = useState("");
  const [filter, setFilter] = useState(""), [dry, setDry] = useState<Record<string, Dry[]>>({});
  const load = async () => { setList((await api<R[]>("/api/auto-responders")).data as unknown as R[]); setLogs((await api<Log[]>(`/api/auto-responders/logs?decision=${filter}`)).data as unknown as Log[]); };
  useEffect(() => { load(); }, [filter]); // eslint-disable-line
  useEffect(() => { api<Acc[]>("/api/accounts").then((r) => setAccs(r.data as unknown as Acc[])); }, []);
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const patch = async (id: string, b: Record<string, unknown>) => { const r = await api(`/api/auto-responders/${id}`, "PATCH", b); if (!r.ok) setMsg(r.data.error ?? "Failed"); load(); return r.ok; };

  async function save() {
    const r = editing ? await api(`/api/auto-responders/${editing}`, "PATCH", f) : await api("/api/auto-responders", "POST", f);
    setMsg(r.ok ? "Saved" : r.data.error ?? "Failed"); if (r.ok) { setEditing(null); setF(blank); load(); }
  }
  async function toAuto(r: R) {
    if (!confirm("Automatic mode SENDS replies without your review.\n\nAI replies can be wrong, can misstate facts, and are sent in your name. You are responsible for everything that is sent. Email text is sent to your AI provider.\n\nSwitch to automatic mode?")) return;
    await patch(r.id, { mode: "auto", confirmAuto: true });
  }

  return (
    <>
      <h1>Auto-responders</h1>
      <div className="warn">{HINT_COPY.aiWrong} {HINT_COPY.aiPrivacy} Responders are OFF by default and start in approve mode.</div>
      <div className="card">
        <h3>{editing ? "Edit responder" : "New responder"}</h3>
        <div className="grid">
          <input placeholder="Name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          <select value={f.accountId} onChange={(e) => set("accountId", e.target.value)}><option value="">Mail account…</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
          <input placeholder="Only mail to address (optional)" value={f.toAddressFilter ?? ""} onChange={(e) => set("toAddressFilter", e.target.value || null)} />
          <input placeholder="Include keywords (csv)" value={f.keywordsInclude} onChange={(e) => set("keywordsInclude", e.target.value)} />
          <input placeholder="Exclude keywords (csv)" value={f.keywordsExclude} onChange={(e) => set("keywordsExclude", e.target.value)} />
          <input placeholder="Escalation keywords (csv)" value={f.escalationKeywords} onChange={(e) => set("escalationKeywords", e.target.value)} />
          <label>Active hours <input type="number" style={{ width: 55 }} value={f.activeStartHour} onChange={(e) => set("activeStartHour", Number(e.target.value))} />–<input type="number" style={{ width: 55 }} value={f.activeEndHour} onChange={(e) => set("activeEndHour", Number(e.target.value))} /></label>
          <input placeholder="Timezone" value={f.timezone} onChange={(e) => set("timezone", e.target.value)} />
          <label>Max/contact/day <input type="number" style={{ width: 55 }} value={f.maxRepliesPerContactPerDay} onChange={(e) => set("maxRepliesPerContactPerDay", Number(e.target.value))} /></label>
          <label>Max/day <input type="number" style={{ width: 65 }} value={f.maxRepliesPerDay} onChange={(e) => set("maxRepliesPerDay", Number(e.target.value))} /></label>
          <label>Cooldown h <input type="number" style={{ width: 65 }} value={f.cooldownHours} onChange={(e) => set("cooldownHours", Number(e.target.value))} /></label>
          <label>Ignore older than (days) <input type="number" style={{ width: 55 }} value={f.maxAgeDays} onChange={(e) => set("maxAgeDays", Number(e.target.value))} /></label>
        </div>
        <label><input type="checkbox" checked={f.onlyKnownContacts} onChange={(e) => set("onlyKnownContacts", e.target.checked)} /> Only known contacts</label>{" "}
        <label><input type="checkbox" checked={f.saveCopyToSent} onChange={(e) => set("saveCopyToSent", e.target.checked)} /> Save copy to Sent</label>
        <SendVia options={options.filter((o) => o.type === "SMTP" || o.id === f.accountId)} value={f.sendViaType === "SMTP" && f.sendViaId ? `SMTP:${f.sendViaId}` : f.accountId ? `ACCOUNT:${f.accountId}` : ""} onChange={(k) => { const [t, i] = k.split(":"); setF({ ...f, sendViaType: t || "ACCOUNT", sendViaId: t === "SMTP" ? i : null }); }} />
        <textarea rows={3} placeholder="Instructions / playbook" value={f.instructions} onChange={(e) => set("instructions", e.target.value)} />
        <textarea rows={5} placeholder="Knowledge (FAQ, pricing, policies the AI may use)" value={f.knowledgeText} onChange={(e) => set("knowledgeText", e.target.value)} />
        <div className="row"><button onClick={save}>{editing ? "Save" : "Create"}</button>{editing && <button className="sec" onClick={() => { setEditing(null); setF(blank); }}>Cancel</button>}<span>{msg}</span></div>
      </div>
      {list.map((r) => (
        <div className="card" key={r.id}>
          <div className="row"><b>{r.name}</b><span className="badge">{r.mode}</span><span className={r.enabled && !r.paused ? "ok" : "muted"}>{r.enabled ? (r.paused ? "paused" : "on") : "off"}</span>
            <button className="sec" onClick={() => patch(r.id, { enabled: !r.enabled })}>{r.enabled ? "Turn off" : "Turn on"}</button>
            <button className={r.paused ? "" : "danger"} onClick={() => patch(r.id, { paused: !r.paused })}>{r.paused ? "Resume" : "Pause"}</button>
            <button className="sec" onClick={async () => { setMsg("Running dry run…"); const x = await api<{ results: Dry[]; ok: boolean }>(`/api/auto-responders/${r.id}/dry-run`, "POST"); setMsg(x.ok ? "Dry run complete (nothing sent)" : x.data.error ?? "Dry run had errors"); if (x.data.results) setDry({ ...dry, [r.id]: x.data.results }); load(); }}>Dry run</button>
            {r.mode === "auto" ? <button className="sec" onClick={() => patch(r.id, { mode: "approve" })}>Back to approve mode</button> : <button className="sec" disabled={!r.dryRunOkAt} title={r.dryRunOkAt ? "" : "Run a successful dry run first"} onClick={() => toAuto(r)}>Switch to auto…</button>}
            <button className="sec" onClick={() => { setEditing(r.id); setF({ ...blank, ...r } as typeof blank); }}>Edit</button>
            <button className="danger" onClick={async () => { if (confirm("Delete responder?")) { await api(`/api/auto-responders/${r.id}`, "DELETE"); load(); } }}>Delete</button></div>
          {dry[r.id] && <table><tbody>{dry[r.id].map((d, i) => <tr key={i}><td>{d.from}</td><td>{d.subject}</td><td><b>{d.decision}</b></td><td>{d.reason}</td><td style={{ whiteSpace: "pre-wrap" }}>{d.reply}</td></tr>)}</tbody></table>}
        </div>
      ))}
      <h3>Activity log</h3>
      <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All</option>{["replied", "drafted", "skipped", "escalated"].map((d) => <option key={d}>{d}</option>)}</select>
      <table><thead><tr><th>When</th><th>Responder</th><th>From</th><th>Decision</th><th>Reason</th><th>Reply</th></tr></thead>
        <tbody>{logs.map((l) => <tr key={l.id}><td>{new Date(l.createdAt).toLocaleString()}</td><td>{l.responder}</td><td>{l.contactEmail}</td><td><b>{l.decision}</b></td>
          <td>{l.reason}{l.error ? ` — ${l.error}` : ""}</td><td><a href={`/mail?message=${l.messageId}`}>open message</a>{l.draft && <details><summary>AI reply</summary><pre style={{ whiteSpace: "pre-wrap" }}>{l.draft.body}</pre></details>}</td></tr>)}</tbody></table>
    </>
  );
}
