"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { HINT_COPY } from "@/lib/deliverability";

export default function AiSettings() {
  const [s, setS] = useState<{ provider: string | null; model: string | null; keyMasked: string | null; serverKey: boolean; usage: { requests: number; tokens: number; reqCap: number; tokCap: number; capped: boolean } } | null>(null);
  const [provider, setProvider] = useState("openai"), [model, setModel] = useState(""), [key, setKey] = useState(""), [msg, setMsg] = useState("");
  const load = async () => { const r = await api(`/api/ai/settings`); const d = r.data as unknown as NonNullable<typeof s>; setS(d); setProvider(d.provider ?? "openai"); setModel(d.model ?? ""); };
  useEffect(() => { load(); }, []);
  if (!s) return <p>Loading…</p>;
  return (
    <>
      <h1>Settings › AI</h1>
      <div className="info">{HINT_COPY.aiPrivacy}</div>
      <div className="card">
        <p>Key: {s.keyMasked ? `your own key ${s.keyMasked} (overrides the server key)` : s.serverKey ? "using the server key" : "none configured"}</p>
        <div className="row">
          <select value={provider} onChange={(e) => setProvider(e.target.value)}><option>openai</option><option>anthropic</option></select>
          <input placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
          <input type="password" placeholder="Your API key (stored encrypted)" value={key} onChange={(e) => setKey(e.target.value)} />
          <button onClick={async () => { const r = await api("/api/ai/settings", "PUT", { provider, model, apiKey: key || undefined }); setMsg(r.ok ? "Saved" : r.data.error ?? "Failed"); setKey(""); load(); }}>Save</button>
          {s.keyMasked && <button className="danger" onClick={async () => { await api("/api/ai/settings", "PUT", { removeKey: true }); load(); }}>Remove my key</button>}
        </div>
        <p>{msg}</p>
        <p className="muted">Today: {s.usage.requests}/{s.usage.reqCap} requests, {s.usage.tokens}/{s.usage.tokCap} tokens {s.usage.capped && <b className="err">— AI limit reached</b>}</p>
      </div>
    </>
  );
}
