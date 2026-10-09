"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type C = { id: string; email: string; name: string | null; messageCount: number; lastSeen: string; verificationStatus: string | null; accounts: string[] };
type Seq = { id: string; name: string };
type Acc = { id: string; label: string };

export default function Contacts() {
  const [rows, setRows] = useState<C[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(""), [status, setStatus] = useState(""), [accountId, setAccountId] = useState("");
  const [sort, setSort] = useState("lastSeen"), [dir, setDir] = useState("desc"), [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [accs, setAccs] = useState<Acc[]>([]), [seqs, setSeqs] = useState<Seq[]>([]);
  const [port25, setPort25] = useState<{ checked: boolean; reachable?: boolean; detail?: string } | null>(null);
  const [hideInvalid, setHideInvalid] = useState(false);
  const [note, setNote] = useState("");
  const qs = () => new URLSearchParams({ q, status, accountId, sort, dir, page: String(page), ...(hideInvalid ? { hideInvalid: "1" } : {}) });
  const load = async () => { const r = await api<{ rows: C[]; total: number }>(`/api/contacts?${qs()}`); setRows(r.data.rows ?? []); setTotal(r.data.total ?? 0); };
  useEffect(() => { load(); }, [q, status, accountId, sort, dir, page, hideInvalid]); // eslint-disable-line
  useEffect(() => {
    api<Acc[]>("/api/accounts").then((r) => setAccs(r.data as unknown as Acc[]));
    api<Seq[]>("/api/sequences").then((r) => setSeqs(r.data as unknown as Seq[]));
    api<{ checked: boolean; reachable?: boolean; detail?: string }>("/api/verify").then((r) => setPort25(r.data));
  }, []);
  const th = (k: string, l: string) => <th style={{ cursor: "pointer" }} onClick={() => { setDir(sort === k && dir === "desc" ? "asc" : "desc"); setSort(k); }}>{l}{sort === k ? (dir === "asc" ? " ▲" : " ▼") : ""}</th>;
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const filterQs = () => { const p = qs(); p.delete("page"); p.delete("sort"); p.delete("dir"); return p.toString(); };

  async function verify(all: boolean) {
    const r = await api<{ queued: number }>("/api/verify", "POST", all ? { all: true, filter: filterQs() } : { ids: [...sel] });
    setNote(`Queued ${r.data.queued} address(es) for verification. Results appear here as the worker finishes.`);
  }
  async function addToSeq(id: string) {
    let r = await api<{ needsConfirmation?: boolean; warn?: { risky: number; unknown: number }; enrolled?: number; skipped?: Record<string, number> }>(`/api/sequences/${id}/enroll`, "POST", { contactIds: [...sel] });
    if (r.data.needsConfirmation) {
      const w = r.data.warn!;
      const inc = confirm(`${w.risky} risky and ${w.unknown} unverified/unknown contact(s). OK = include them, Cancel = exclude them.`);
      r = await api(`/api/sequences/${id}/enroll`, "POST", { contactIds: [...sel], includeRisky: inc, includeUnknown: inc });
    }
    setNote(r.ok ? `Enrolled ${r.data.enrolled}. Skipped: ${Object.entries(r.data.skipped ?? {}).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}` : r.data.error ?? "Failed");
  }

  return (
    <>
      <h1>Contacts <span className="muted">({total})</span></h1>
      {port25 && port25.checked && !port25.reachable && <div className="warn"><b>Outbound port 25 appears blocked</b> on the worker host ({port25.detail}). Email verification will return “unknown”. Railway, Render and Fly commonly block port 25; run the worker on a host that allows it.</div>}
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any verification</option>{["valid", "invalid", "risky", "unknown", "unverified"].map((s) => <option key={s}>{s}</option>)}</select>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">All accounts</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        <label><input type="checkbox" checked={hideInvalid} onChange={(e) => setHideInvalid(e.target.checked)} /> Hide invalid (also excludes from export)</label>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="sec" disabled={!sel.size} onClick={() => verify(false)}>Verify selected ({sel.size})</button>
        <button className="sec" onClick={() => verify(true)}>Verify all (filtered)</button>
        <a href={`/api/contacts/export?${filterQs()}${sel.size ? `&ids=${[...sel].join(",")}` : ""}`}><button className="sec">Export CSV</button></a>
        <select disabled={!sel.size} value="" onChange={(e) => e.target.value && addToSeq(e.target.value)}><option value="">Add to sequence…</option>{seqs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      {note && <p className="muted">{note}</p>}
      <table>
        <thead><tr><th></th>{th("name", "Name")}{th("email", "Email")}<th>Source account</th>{th("messageCount", "Messages")}{th("lastSeen", "Last contacted")}{th("verificationStatus", "Verification")}</tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.id}><td><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /></td>
            <td><a href={`/contacts/${c.id}`}>{c.name ?? "—"}</a></td><td>{c.email}</td><td>{c.accounts.join(", ")}</td><td>{c.messageCount}</td>
            <td>{new Date(c.lastSeen).toLocaleDateString()}</td><td>{c.verificationStatus ?? "unverified"}</td></tr>
        ))}</tbody>
      </table>
      <div className="row" style={{ marginTop: 8 }}><button className="sec" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><span>Page {page}</span><button className="sec" disabled={page * 50 >= total} onClick={() => setPage(page + 1)}>Next</button></div>
    </>
  );
}
