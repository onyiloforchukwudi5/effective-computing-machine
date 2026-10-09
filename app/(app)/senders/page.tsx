"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import DeliverabilityHint from "@/components/DeliverabilityHint";
import { HINT_COPY } from "@/lib/deliverability";

type S = { id: string; label: string; host: string; port: number; security: string; username: string | null; passwordMasked: string | null; fromName: string; fromEmail: string; replyTo: string | null; isDefault: boolean; status: string; lastTestedAt: string | null; lastError: string | null; hintDismissed: boolean; dailyLimit: number };
const blank = { label: "", host: "", port: 587, security: "STARTTLS", username: "", password: "", fromName: "", fromEmail: "", replyTo: "", dailyLimit: 50 };

export default function Senders() {
  const [list, setList] = useState<S[]>([]);
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testMsg, setTestMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const load = async () => setList((await api<S[]>("/api/senders")).data as unknown as S[]);
  useEffect(() => { load(); }, []);
  const set = (k: string, v: string | number) => setF({ ...f, [k]: v });

  async function save() {
    setMsg({ ok: true, text: "Testing connection…" });
    const payload = { ...f, username: f.username || null, password: f.password || undefined, replyTo: f.replyTo || null };
    const r = await api<{ test: { ok: boolean; error: string | null } }>(editing ? `/api/senders/${editing}` : "/api/senders", editing ? "PATCH" : "POST", payload);
    if (!r.ok) return setMsg({ ok: false, text: r.data.error ?? "Failed" });
    const t = (r.data as unknown as { test: { ok: boolean; error: string | null } }).test;
    setMsg({ ok: t.ok, text: t.ok ? "Saved. SMTP verify passed." : `Saved, but verify failed: ${t.error}` });
    setEditing(null); setF(blank); load();
  }

  return (
    <>
      <h1>SMTP senders</h1>
      <p className="muted">Bring your own SMTP service (SendGrid, Mailgun, Amazon SES, Brevo, Postmark, your own server). Passwords are encrypted and never shown. {HINT_COPY.rampUp}</p>
      <div className="card">
        <h3>{editing ? "Edit sender" : "Add sender"}</h3>
        <div className="grid">
          <input placeholder="Label" value={f.label} onChange={(e) => set("label", e.target.value)} />
          <input placeholder="Host" value={f.host} onChange={(e) => set("host", e.target.value)} />
          <input type="number" placeholder="Port" value={f.port} onChange={(e) => set("port", Number(e.target.value))} />
          <select value={f.security} onChange={(e) => set("security", e.target.value)}><option>SSL</option><option>STARTTLS</option><option>NONE</option></select>
          <input placeholder="Username" value={f.username} onChange={(e) => set("username", e.target.value)} />
          <input type="password" placeholder={editing ? "Password (blank = keep)" : "Password / API key"} value={f.password} onChange={(e) => set("password", e.target.value)} />
          <input placeholder="From name" value={f.fromName} onChange={(e) => set("fromName", e.target.value)} />
          <input placeholder="From email" value={f.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} />
          <input placeholder="Reply-To (optional)" value={f.replyTo} onChange={(e) => set("replyTo", e.target.value)} />
          <input type="number" placeholder="Daily limit" value={f.dailyLimit} onChange={(e) => set("dailyLimit", Number(e.target.value))} />
        </div>
        <DeliverabilityHint fromEmail={f.fromEmail} host={f.host} />
        {msg && <p className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
        <div className="row"><button onClick={save}>{editing ? "Save & test" : "Add & test"}</button>{editing && <button className="sec" onClick={() => { setEditing(null); setF(blank); }}>Cancel</button>}</div>
      </div>
      {list.map((s) => (
        <div className="card" key={s.id}>
          <div className="row"><b>{s.label}</b>{s.isDefault && <span className="badge">default</span>}
            <span className={s.status === "connected" ? "ok" : s.status === "error" ? "err" : "muted"}>● {s.status}</span>
            <span className="muted">{s.fromName} &lt;{s.fromEmail}&gt; via {s.host}:{s.port} {s.security} · password {s.passwordMasked ?? "none"}</span></div>
          {s.lastError && <p className="err" style={{ fontSize: 13 }}>{s.lastError}</p>}
          {!s.hintDismissed && <DeliverabilityHint fromEmail={s.fromEmail} host={s.host} onDismiss={async () => { await api(`/api/senders/${s.id}/dismiss-hint`, "POST"); load(); }} />}
          {testMsg[s.id] && <p className={testMsg[s.id].ok ? "ok" : "err"} style={{ whiteSpace: "pre-wrap" }}>{testMsg[s.id].text}</p>}
          <div className="row">
            <button className="sec" onClick={async () => { const r = await api<{ ok: boolean; response: string }>(`/api/senders/${s.id}/test`, "POST"); setTestMsg({ ...testMsg, [s.id]: { ok: !!r.data.ok, text: r.data.response ?? r.data.error ?? "Failed" } }); load(); }}>Send test email</button>
            {!s.isDefault && <button className="sec" onClick={async () => { await api(`/api/senders/${s.id}`, "PATCH", { isDefault: true }); load(); }}>Set default</button>}
            <button className="sec" onClick={() => { setEditing(s.id); setF({ label: s.label, host: s.host, port: s.port, security: s.security, username: s.username ?? "", password: "", fromName: s.fromName, fromEmail: s.fromEmail, replyTo: s.replyTo ?? "", dailyLimit: s.dailyLimit }); }}>Edit</button>
            <button className="danger" onClick={async () => { if (confirm("Delete this sender?")) { await api(`/api/senders/${s.id}`, "DELETE"); load(); } }}>Delete</button>
          </div>
        </div>
      ))}
    </>
  );
}
