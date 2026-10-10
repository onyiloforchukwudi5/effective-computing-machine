"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type D = { accounts: number; contacts: number; senders: number; sequences: number; escalated: number; activeResponders: number; autoRepliesPaused: boolean; aiCapNotice: boolean };

export default function Dashboard() {
  const [d, setD] = useState<D | null>(null);
  const load = () => api<D>("/api/dashboard").then((r) => setD(r.data as D));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="space-y-3" aria-busy="true" aria-label="Loading dashboard"><div className="skeleton h-8 w-48" /><div className="skeleton h-20" /><div className="grid mb-4"><div className="skeleton h-24" /><div className="skeleton h-24" /><div className="skeleton h-24" /><div className="skeleton h-24" /></div></div>;
  const stat = (l: string, v: number, href: string) => <a href={href} className="card mb-0 block text-sm text-muted no-underline transition-shadow hover:shadow-lifted hover:no-underline" key={l}><div className="text-4xl font-semibold tracking-tight text-fg">{v}</div>{l}</a>;
  return (
    <>
      <header className="mb-4"><h1 className="mb-1">Dashboard</h1><p className="text-sm text-muted">Overview of your mail, contacts and automation.</p></header>
      {d.aiCapNotice && <div className="callout-warn">AI daily limit reached: auto-drafting is paused until tomorrow.</div>}
      {d.escalated > 0 && <div className="callout-warn font-medium"><a href="/auto-responders">{d.escalated} message(s) need your attention</a></div>}
      <div className={`card flex flex-wrap items-center justify-between gap-3 ${d.autoRepliesPaused ? "border-danger-line bg-danger-soft" : ""}`}>
        <div><b>Auto-replies:</b> {d.autoRepliesPaused ? <span className="font-semibold text-danger">ALL PAUSED</span> : <span className="font-medium text-success">{d.activeResponders} responder(s) active</span>}</div>
        <button className={d.autoRepliesPaused ? "btn btn-primary" : "btn btn-danger"} onClick={async () => { await api("/api/dashboard", "PUT", { autoRepliesPaused: !d.autoRepliesPaused }); load(); }}>
          {d.autoRepliesPaused ? "Resume all auto-replies" : "Pause all auto-replies"}
        </button>
      </div>
      <div className="grid mb-4">
        {stat("Mail accounts", d.accounts, "/accounts")}{stat("SMTP senders", d.senders, "/senders")}{stat("Contacts", d.contacts, "/contacts")}{stat("Sequences", d.sequences, "/sequences")}
      </div>
      {d.accounts === 0 && <p className="callout-info">Get started: <a href="/accounts">connect a mail account</a>.</p>}
    </>
  );
}
