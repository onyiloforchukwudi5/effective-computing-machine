"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import Composer, { ComposeInit } from "@/components/Composer";

type Acc = { id: string; label: string };
type Folder = { id: string; path: string; name: string; specialUse: string | null; count: number };
type Row = { id: string; subject: string | null; from: string | null; receivedAt: string; unread: boolean; aiDraft: string | null; handled: boolean };
type Msg = { id: string; subject: string | null; fromName: string | null; fromEmail: string | null; to: { address: string }[] | null; cc: { address: string }[] | null; receivedAt: string; html: string | null; hasRemoteImages: boolean; text: string | null; accountId: string; accountEmail: string; linkedSenderId: string | null; attachments: { filename: string | null; size: number }[] | null; aiDraft: { id: string; subject: string; body: string; kind: string; note: string | null } | null; autoReplies: { responder: string; decision: string; reason: string }[] };

function MailInner() {
  const sp = useSearchParams();
  const [accs, setAccs] = useState<Acc[]>([]);
  const [acc, setAcc] = useState("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [images, setImages] = useState(false);
  const [compose, setCompose] = useState<ComposeInit | null>(null);

  useEffect(() => { api<Acc[]>("/api/accounts").then((r) => { const l = r.data as unknown as Acc[]; setAccs(l); if (l[0]) setAcc(l[0].id); }); }, []);
  useEffect(() => { if (!acc) return; api<Folder[]>(`/api/mail/folders?accountId=${acc}`).then((r) => { const f = r.data as unknown as Folder[]; setFolders(f); setFolder(f.find((x) => x.specialUse === "\\Inbox")?.id ?? f[0]?.id ?? ""); setPage(1); }); }, [acc]);
  useEffect(() => { if (!folder) return; api<{ rows: Row[]; total: number }>(`/api/mail/messages?folderId=${folder}&page=${page}`).then((r) => { setRows(r.data.rows ?? []); setTotal(r.data.total ?? 0); }); }, [folder, page]);
  const open = async (id: string, img = false) => { const r = await api<Msg>(`/api/mail/messages/${id}?images=${img ? 1 : 0}`); setMsg(r.data as unknown as Msg); setImages(img); setCompose(null); };
  useEffect(() => { const m = sp.get("message"); if (m) open(m); }, [sp]);

  const reply = (all: boolean, m: Msg, aiDraftId?: string, body?: string, subject?: string): ComposeInit => ({
    mode: all ? "replyAll" : "reply", to: m.fromEmail ?? "", cc: all ? [...(m.to ?? []), ...(m.cc ?? [])].map((a) => a.address).filter((a) => a !== m.accountEmail && a !== m.fromEmail).join(", ") : "",
    subject: subject ?? `Re: ${(m.subject ?? "").replace(/^re:\s*/i, "")}`, body: body ?? `\n\nOn ${new Date(m.receivedAt).toLocaleString()}, ${m.fromEmail} wrote:\n${(m.text ?? "").split("\n").map((l) => `> ${l}`).join("\n")}`,
    replyToMessageId: m.id, accountId: m.accountId, linkedSenderId: m.linkedSenderId, aiDraftId,
  });

  return (
    <>
      <div className="row"><h1 style={{ margin: 0 }}>Mail</h1>
        <select value={acc} onChange={(e) => setAcc(e.target.value)}>{accs.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        <button onClick={() => setCompose({ mode: "new" })}>Compose</button></div>
      {compose && <Composer key={JSON.stringify(compose)} init={compose} onClose={() => setCompose(null)} />}
      <div style={{ display: "grid", gridTemplateColumns: "180px 320px 1fr", gap: 10, marginTop: 10 }}>
        <div className="card">{folders.map((f) => <div key={f.id}><a href="#" style={{ fontWeight: f.id === folder ? 700 : 400 }} onClick={(e) => { e.preventDefault(); setFolder(f.id); setPage(1); }}>{f.name} ({f.count})</a></div>)}</div>
        <div>{rows.map((r) => (
          <div key={r.id} className="card" style={{ cursor: "pointer", padding: 8 }} onClick={() => open(r.id)}>
            <div style={{ fontWeight: r.unread ? 700 : 400 }}>{r.from}</div><div>{r.subject ?? "(no subject)"}</div>
            <div className="muted">{new Date(r.receivedAt).toLocaleString()} {r.aiDraft && <span className="badge">{r.aiDraft === "escalated" ? "needs your attention" : "AI drafted a reply"}</span>} {r.handled && <span className="badge">auto-responder</span>}</div>
          </div>))}
          <div className="row"><button className="sec" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><span>{page}</span><button className="sec" disabled={page * 30 >= total} onClick={() => setPage(page + 1)}>Next</button></div></div>
        <div>{msg && (
          <div className="card">
            <h3>{msg.subject}</h3><p className="muted">{msg.fromName} &lt;{msg.fromEmail}&gt; · {new Date(msg.receivedAt).toLocaleString()}</p>
            {msg.autoReplies.map((a, i) => <div key={i} className="info">Auto-responder “{a.responder}”: {a.decision} — {a.reason}</div>)}
            {msg.aiDraft && (
              <div className="info"><b>{msg.aiDraft.kind === "escalated" ? "Needs your attention" : "AI drafted a reply"}</b>{msg.aiDraft.note ? ` (${msg.aiDraft.note})` : ""}
                <pre style={{ whiteSpace: "pre-wrap" }}>{msg.aiDraft.body}</pre>
                <div className="row">
                  <button onClick={() => setCompose(reply(false, msg, msg.aiDraft!.id, msg.aiDraft!.body, msg.aiDraft!.subject))}>Use draft / Edit</button>
                  <button className="sec" onClick={async () => { await api(`/api/ai/drafts/${msg.aiDraft!.id}`, "POST", { action: "discard" }); open(msg.id); }}>Discard</button>
                  <button className="sec" onClick={async () => { const r = await api(`/api/ai/drafts/${msg.aiDraft!.id}`, "POST", { action: "regenerate" }); if (!r.ok) alert(r.data.error); open(msg.id); }}>Regenerate</button></div>
                <p className="muted">Approve &amp; send: open the draft, review it, then press Send. Nothing is sent without you.</p></div>)}
            {msg.hasRemoteImages && !images && <div className="warn">Remote images are blocked. <button className="sec" onClick={() => open(msg.id, true)}>Show images</button></div>}
            {msg.html ? <div className="rounded-lg bg-white p-3 text-slate-900" dangerouslySetInnerHTML={{ __html: msg.html }} /> : <pre style={{ whiteSpace: "pre-wrap" }}>{msg.text}</pre>}
            {msg.attachments && msg.attachments.length > 0 && <p className="muted">Attachments: {msg.attachments.map((a) => `${a.filename ?? "file"} (${a.size}b)`).join(", ")}</p>}
            <div className="row"><button onClick={() => setCompose(reply(false, msg))}>Reply</button><button className="sec" onClick={() => setCompose(reply(true, msg))}>Reply all</button>
              <button className="sec" onClick={() => setCompose({ mode: "forward", subject: `Fwd: ${msg.subject ?? ""}`, body: `\n\n---------- Forwarded message ----------\nFrom: ${msg.fromEmail}\n\n${msg.text ?? ""}` })}>Forward</button></div>
          </div>)}</div>
      </div>
    </>
  );
}
export default function Mail() { return <Suspense><MailInner /></Suspense>; }
