"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

const blank = { businessName: "", whatYouDo: "", tone: "professional", signature: "", language: "English", doNotSay: "" };

export default function Profile() {
  const [f, setF] = useState(blank), [msg, setMsg] = useState("");
  useEffect(() => { api<typeof blank>("/api/ai/profile").then((r) => setF({ ...blank, ...r.data })); }, []);
  const set = (k: keyof typeof blank, v: string) => setF({ ...f, [k]: v });
  return (
    <>
      <h1>Business profile</h1>
      <p className="muted">Injected into every AI prompt.</p>
      <div className="card">
        <input placeholder="Business name" value={f.businessName} onChange={(e) => set("businessName", e.target.value)} style={{ width: "100%" }} />
        <textarea placeholder="What you do" rows={3} value={f.whatYouDo} onChange={(e) => set("whatYouDo", e.target.value)} />
        <div className="row"><select value={f.tone} onChange={(e) => set("tone", e.target.value)}>{["friendly", "professional", "short", "formal", "casual"].map((t) => <option key={t}>{t}</option>)}</select>
          <input placeholder="Language" value={f.language} onChange={(e) => set("language", e.target.value)} /></div>
        <textarea placeholder="Signature" rows={3} value={f.signature} onChange={(e) => set("signature", e.target.value)} />
        <textarea placeholder="Do-not-say list (comma or line separated)" rows={2} value={f.doNotSay} onChange={(e) => set("doNotSay", e.target.value)} />
        <button onClick={async () => { const r = await api("/api/ai/profile", "PUT", f); setMsg(r.ok ? "Saved" : r.data.error ?? "Failed"); }}>Save</button> {msg}
      </div>
    </>
  );
}
