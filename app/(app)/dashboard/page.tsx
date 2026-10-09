"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type D = { accounts: number; contacts: number; senders: number; sequences: number; escalated: number; activeResponders: number; autoRepliesPaused: boolean; aiCapNotice: boolean };

export default function Dashboard() {
  const [d, setD] = useState<D | null>(null);
  const load = () => api<D>("/api/dashboard").then((r) => setD(r.data as D));
  useEffect(() => { load(); }, []);
  if (!d) return <p>Loading…</p>;
  const stat = (l: string, v: number, href: string) => <a href={href} className="card" key={l}><div style={{ fontSize: 28 }}>{v}</div>{l}</a>;
  return (
    <>
      <h1>Dashboard</h1>
      {d.aiCapNotice && <div className="warn">AI daily limit reached: auto-drafting is paused until tomorrow.</div>}
      {d.escalated > 0 && <div className="warn"><a href="/auto-responders">{d.escalated} message(s) need your attention</a></div>}
      <div className="card row">
        <b>Auto-replies:</b> {d.autoRepliesPaused ? <span className="err">ALL PAUSED</span> : <span className="ok">{d.activeResponders} responder(s) active</span>}
        <button className={d.autoRepliesPaused ? "" : "danger"} onClick={async () => { await api("/api/dashboard", "PUT", { autoRepliesPaused: !d.autoRepliesPaused }); load(); }}>
          {d.autoRepliesPaused ? "Resume all auto-replies" : "Pause all auto-replies"}
        </button>
      </div>
      <div className="grid">
        {stat("Mail accounts", d.accounts, "/accounts")}{stat("SMTP senders", d.senders, "/senders")}{stat("Contacts", d.contacts, "/contacts")}{stat("Sequences", d.sequences, "/sequences")}
      </div>
      {d.accounts === 0 && <p className="muted">Get started: <a href="/accounts">connect a mail account</a>.</p>}
    </>
  );
}
