"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import SendVia, { keyOf, useSendOptions } from "./SendVia";

export type ComposeInit = {
  mode: "new" | "reply" | "replyAll" | "forward";
  to?: string; cc?: string; subject?: string; body?: string; replyToMessageId?: string; accountId?: string; linkedSenderId?: string | null; aiDraftId?: string;
};

export default function Composer({ init, onClose }: { init: ComposeInit; onClose: () => void }) {
  const options = useSendOptions();
  const [via, setVia] = useState("");
  const [to, setTo] = useState(init.to ?? "");
  const [cc, setCc] = useState(init.cc ?? "");
  const [subject, setSubject] = useState(init.subject ?? "");
  const [text, setText] = useState(init.body ?? "");
  const [saveCopy, setSaveCopy] = useState(init.mode === "reply" || init.mode === "replyAll");
  const [isAi, setIsAi] = useState(!!init.aiDraftId);
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (via || !options.length) return;
    // replying: the account the message arrived in (or its linked SMTP sender); new: the default sender
    const pick = init.replyToMessageId
      ? (init.linkedSenderId ? options.find((o) => o.type === "SMTP" && o.id === init.linkedSenderId) : options.find((o) => o.type === "ACCOUNT" && o.id === init.accountId))
      : options.find((o) => o.isDefault) ?? options[0];
    if (pick) setVia(keyOf(pick));
  }, [options, via, init]);

  const list = (s: string) => s.split(/[,;\s]+/).filter(Boolean);
  const html = (t: string) => t.split("\n").map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");

  async function ai(mode: "draft" | "suggest") {
    setBusy(true); setStatus(null);
    const r = await api<{ subject: string; body: string; warning?: string }>("/api/ai/draft", "POST", { mode, instruction, replyToMessageId: init.replyToMessageId });
    setBusy(false);
    if (!r.ok) return setStatus({ ok: false, msg: r.data.error ?? "AI failed" });
    if (mode === "draft" || !subject) setSubject(r.data.subject);
    setText(r.data.body + (r.data.warning ? "" : ""));
    setIsAi(true);
    if (r.data.warning) setStatus({ ok: false, msg: r.data.warning });
  }
  async function rw(action: string) {
    setBusy(true);
    const r = await api<{ text: string }>("/api/ai/rewrite", "POST", { action, text, language: action === "translate" ? prompt("Translate to which language?") ?? "English" : undefined });
    setBusy(false);
    if (!r.ok) return setStatus({ ok: false, msg: r.data.error ?? "AI failed" });
    setText(r.data.text); setIsAi(true);
  }
  async function send() {
    const [type, id] = via.split(":");
    if (!type) return setStatus({ ok: false, msg: "Choose a sender" });
    setBusy(true);
    // TODO(sequences): one-off sends already honor the per-user Unsubscribe list server-side (lib/mail/send.ts suppressedAddresses).
    const r = await api("/api/send", "POST", { via: { type, id }, to: list(to), cc: list(cc), subject, html: html(text), replyToMessageId: init.replyToMessageId, saveCopy, aiDraftId: init.aiDraftId });
    setBusy(false);
    setStatus(r.ok ? { ok: true, msg: `Sent. Server response: ${(r.data as { response?: string }).response ?? "OK"}` } : { ok: false, msg: r.data.error ?? "Send failed" });
  }

  return (
    <div className="card">
      <h3>{{ new: "New message", reply: "Reply", replyAll: "Reply all", forward: "Forward" }[init.mode]} {isAi && <span className="badge">AI draft</span>}</h3>
      <SendVia options={options} value={via} onChange={setVia} />
      <div><input placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "100%" }} /></div>
      <div><input placeholder="Cc" value={cc} onChange={(e) => setCc(e.target.value)} style={{ width: "100%" }} /></div>
      <div><input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%" }} /></div>
      <div className="row"><input placeholder="Instruction for AI (e.g. follow up on invoice, polite)" value={instruction} onChange={(e) => setInstruction(e.target.value)} style={{ flex: 1 }} />
        <button className="sec" disabled={busy} onClick={() => ai("draft")}>Draft with AI</button>
        {init.replyToMessageId && <button className="sec" disabled={busy} onClick={() => ai("suggest")}>Suggest reply</button>}</div>
      <textarea rows={10} value={text} onChange={(e) => { setText(e.target.value); setIsAi(false); }} />
      <div className="row">
        {["shorter", "longer", "friendlier", "formal", "grammar", "translate"].map((a) => <button key={a} className="sec" disabled={busy || !text} onClick={() => rw(a)}>{a}</button>)}
      </div>
      <p className="muted">AI drafts are never sent automatically. {isAi && "Edit the text to clear the AI draft mark."}</p>
      <label><input type="checkbox" checked={saveCopy} onChange={(e) => setSaveCopy(e.target.checked)} /> Save copy to Sent</label>
      {status && <p className={status.ok ? "ok" : "err"} style={{ whiteSpace: "pre-wrap" }}>{status.msg}</p>}
      <div className="row"><button disabled={busy} onClick={send}>Send</button><button className="sec" onClick={onClose}>Close</button></div>
    </div>
  );
}
