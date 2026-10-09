"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Row = { accountId: string; label: string; email: string; status: string; lastSyncAt: string | null; lastError: string | null; job: { status: string; foldersTotal: number; foldersDone: number; messagesFetched: number; contactsFound: number; currentFolder: string | null; error: string | null } | null; folders: { id: string; path: string; total: number; fetched: number; done: boolean }[] };

export default function Sync() {
  const [rows, setRows] = useState<Row[]>([]);
  const load = async () => setRows((await api<Row[]>("/api/sync")).data as unknown as Row[]);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []); // state lives in the DB, so this is correct after reopening
  return (
    <>
      <h1>Sync</h1>
      <button onClick={async () => { await api("/api/sync", "POST", {}); load(); }}>Sync all accounts</button>
      {rows.map((r) => (
        <div className="card" key={r.accountId} style={{ marginTop: 10 }}>
          <div className="row"><b>{r.label}</b><span className="muted">{r.email}</span><span>● {r.status}</span>
            <button className="sec" onClick={async () => { await api("/api/sync", "POST", { accountId: r.accountId }); load(); }}>Sync this account</button></div>
          {r.job && <p>Job: <b>{r.job.status}</b> · folders {r.job.foldersDone}/{r.job.foldersTotal} · {r.job.messagesFetched} messages · {r.job.contactsFound} new contacts{r.job.currentFolder ? ` · now: ${r.job.currentFolder}` : ""}</p>}
          {(r.job?.error || r.lastError) && <p className="err">{r.job?.error ?? r.lastError}</p>}
          <p className="muted">Last finished sync: {r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString() : "never"} (incremental sync runs automatically)</p>
          {r.folders.map((f) => (
            <div key={f.id} style={{ fontSize: 13 }}>{f.path} {f.done ? "✓" : ""} <span className="muted">{f.fetched}/{f.total}</span>
              <div className="bar"><div style={{ width: `${f.total ? Math.min(100, (f.fetched / f.total) * 100) : f.done ? 100 : 0}%` }} /></div></div>
          ))}
        </div>
      ))}
    </>
  );
}
