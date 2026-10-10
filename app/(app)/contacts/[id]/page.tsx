"use client";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/client";

type D = { contact: { email: string; name: string | null; messageCount: number; firstSeen: string; lastSeen: string; verificationStatus: string | null; verification: { reason: string | null; smtpCode: number | null; smtpMessage: string | null; checkedAt: string } | null }; messages: { id: string; subject: string | null; fromEmail: string | null; receivedAt: string; folder: { path: string } }[] };

const VERIFY_BADGE: Record<string, string> = { valid: "badge-success", invalid: "badge-danger", risky: "badge-warn", unknown: "badge-neutral", unverified: "badge-neutral" };

export default function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<D | null>(null);
  useEffect(() => { api<D>(`/api/contacts/${id}`).then((r) => setD(r.data as unknown as D)); }, [id]);
  if (!d?.contact) return <div className="space-y-3" aria-busy="true" aria-label="Loading contact"><div className="skeleton h-8 w-64" /><div className="skeleton h-24" /><div className="skeleton h-40" /></div>;
  const c = d.contact;
  return (
    <>
      <header className="mb-4"><a href="/contacts" className="text-sm">← Contacts</a><h1 className="mb-1 mt-1">{c.name ?? c.email}</h1><p className="text-sm text-muted">Contact details and message history.</p></header>
      <div className="card">
        <p>{c.email} · {c.messageCount} messages · first seen {new Date(c.firstSeen).toLocaleDateString()} · last {new Date(c.lastSeen).toLocaleDateString()}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2">Verification: <span className={VERIFY_BADGE[c.verificationStatus ?? "unverified"] ?? "badge-neutral"}>{c.verificationStatus ?? "unverified"}</span>{c.verification && <span className="text-sm text-muted"> — {c.verification.reason} {c.verification.smtpCode ? `(${c.verification.smtpCode} ${c.verification.smtpMessage ?? ""})` : ""} checked {new Date(c.verification.checkedAt).toLocaleString()}</span>}</p>
      </div>
      <h3>Message history</h3>
      {d.messages.length === 0 ? <div className="empty-state">No messages with this contact yet.</div> : <div className="table-wrap"><table><tbody>{d.messages.map((m) => <tr key={m.id}><td>{new Date(m.receivedAt).toLocaleDateString()}</td><td><a href={`/mail?message=${m.id}`}>{m.subject ?? "(no subject)"}</a></td><td>{m.fromEmail}</td><td className="text-sm text-muted">{m.folder.path}</td></tr>)}</tbody></table></div>}
    </>
  );
}
