"use client";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/client";

type D = { contact: { email: string; name: string | null; messageCount: number; firstSeen: string; lastSeen: string; verificationStatus: string | null; verification: { reason: string | null; smtpCode: number | null; smtpMessage: string | null; checkedAt: string } | null }; messages: { id: string; subject: string | null; fromEmail: string | null; receivedAt: string; folder: { path: string } }[] };

export default function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<D | null>(null);
  useEffect(() => { api<D>(`/api/contacts/${id}`).then((r) => setD(r.data as unknown as D)); }, [id]);
  if (!d?.contact) return <p>Loading…</p>;
  const c = d.contact;
  return (
    <>
      <h1>{c.name ?? c.email}</h1>
      <div className="card">
        <p>{c.email} · {c.messageCount} messages · first seen {new Date(c.firstSeen).toLocaleDateString()} · last {new Date(c.lastSeen).toLocaleDateString()}</p>
        <p>Verification: <b>{c.verificationStatus ?? "unverified"}</b>{c.verification && <span className="muted"> — {c.verification.reason} {c.verification.smtpCode ? `(${c.verification.smtpCode} ${c.verification.smtpMessage ?? ""})` : ""} checked {new Date(c.verification.checkedAt).toLocaleString()}</span>}</p>
      </div>
      <h3>Message history</h3>
      <table><tbody>{d.messages.map((m) => <tr key={m.id}><td>{new Date(m.receivedAt).toLocaleDateString()}</td><td><a href={`/mail?message=${m.id}`}>{m.subject ?? "(no subject)"}</a></td><td>{m.fromEmail}</td><td className="muted">{m.folder.path}</td></tr>)}</tbody></table>
    </>
  );
}
