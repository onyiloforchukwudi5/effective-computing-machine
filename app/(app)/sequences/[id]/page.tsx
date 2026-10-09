"use client";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/client";
import SendVia, { useSendOptions } from "@/components/SendVia";
import { HINT_COPY } from "@/lib/deliverability";

type Step = { id?: string; subject: string; bodyHtml: string; delayDays: number; delayHours: number; sameThread: boolean; rationale?: string };
type Seq = { id: string; name: string; status: string; sendViaType: string | null; sendViaId: string | null; timezone: string; sendDays: number[]; startHour: number; endHour: number; dailySendLimit: number; hourlySendLimit: number; stopOnReply: boolean; skipUnverified: boolean; saveCopyToSent: boolean; footerText: string; postalAddress: string; steps: Step[] };
type En = { id: string; email: string; name: string | null; status: string; currentStep: number; nextSendAt: string | null; stopReason: string | null };
type Contact = { id: string; email: string; name: string | null };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const options = useSendOptions();
  const [s, setS] = useState<Seq | null>(null);
  const [ens, setEns] = useState<En[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [plan, setPlan] = useState({ goal: "", audience: "", offer: "", tone: "friendly", steps: 4, totalDays: 14 });
  const [showPlan, setShowPlan] = useState(false);

  const load = async () => { const r = await api<Seq>(`/api/sequences/${id}`); setS(r.data as unknown as Seq); setEns((await api<En[]>(`/api/sequences/${id}/enrollments`)).data as unknown as En[]); };
  useEffect(() => { load(); api<{ rows: Contact[] }>("/api/contacts?page=1").then((r) => setContacts(r.data.rows ?? [])); }, [id]);
  if (!s) return <p>Loading…</p>;
  const upd = (p: Partial<Seq>) => setS({ ...s, ...p });
  const setStep = (i: number, p: Partial<Step>) => upd({ steps: s.steps.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const move = (i: number, d: number) => { const a = [...s.steps]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; upd({ steps: a }); };

  async function save(extra: Record<string, unknown> = {}) {
    const via = s!.sendViaType && s!.sendViaId ? { type: s!.sendViaType, id: s!.sendViaId } : null;
    const r = await api(`/api/sequences/${id}`, "PATCH", {
      name: s!.name, sendVia: via, timezone: s!.timezone, sendDays: s!.sendDays, startHour: s!.startHour, endHour: s!.endHour, dailySendLimit: s!.dailySendLimit, hourlySendLimit: s!.hourlySendLimit,
      stopOnReply: s!.stopOnReply, skipUnverified: s!.skipUnverified, saveCopyToSent: s!.saveCopyToSent, footerText: s!.footerText, postalAddress: s!.postalAddress,
      steps: s!.steps.map(({ id: sid, subject, bodyHtml, delayDays, delayHours, sameThread }) => ({ id: sid, subject, bodyHtml, delayDays, delayHours, sameThread })), ...extra,
    });
    setMsg(r.ok ? "Saved" : r.data.error ?? "Failed");
    if (r.ok) load();
  }
  async function aiPlan(regen?: number) {
    setMsg("Planning with AI…");
    const r = await api<{ steps: Step[] }>("/api/ai/plan", "POST", { ...plan, regenerateStep: regen !== undefined ? { index: regen, existing: s!.steps } : undefined });
    if (!r.ok) return setMsg(r.data.error ?? "AI failed");
    const st = r.data.steps;
    // unsaved draft: stays in the editor until the user presses Save
    if (regen !== undefined) setStep(regen, { ...st[0], id: s!.steps[regen].id, delayDays: s!.steps[regen].delayDays, delayHours: s!.steps[regen].delayHours });
    else upd({ steps: st.map((x) => ({ ...x })) });
    setMsg("AI plan loaded as an unsaved draft. Review, edit, then Save. Nothing is activated or sent.");
    setShowPlan(false);
  }
  async function enroll(body: Record<string, unknown>) {
    let r = await api<{ needsConfirmation?: boolean; warn?: { risky: number; unknown: number }; enrolled?: number; skipped?: Record<string, number> }>(`/api/sequences/${id}/enroll`, "POST", body);
    if (r.data.needsConfirmation) { const w = r.data.warn!; const inc = confirm(`${w.risky} risky and ${w.unknown} unverified/unknown contact(s). OK = include them, Cancel = exclude them.`); r = await api(`/api/sequences/${id}/enroll`, "POST", { ...body, includeRisky: inc, includeUnknown: inc }); }
    setMsg(r.ok ? `Enrolled ${r.data.enrolled}. Skipped: ${Object.entries(r.data.skipped ?? {}).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}` : r.data.error ?? "Failed");
    load();
  }
  const via = s.sendViaType ? `${s.sendViaType}:${s.sendViaId}` : "";

  return (
    <>
      <div className="row"><h1 style={{ margin: 0 }}>{s.name}</h1><span className="badge">{s.status}</span>
        <button className="sec" onClick={() => setShowPlan(!showPlan)}>Plan with AI</button></div>
      <div className="info">{HINT_COPY.replyDetection}</div><div className="info">{HINT_COPY.coldEmailLaw} {HINT_COPY.rampUp}</div>
      {msg && <p className="muted">{msg}</p>}
      {showPlan && <div className="card"><h3>Plan with AI</h3><div className="grid">
        <input placeholder="Goal (book a demo, win back…)" value={plan.goal} onChange={(e) => setPlan({ ...plan, goal: e.target.value })} />
        <input placeholder="Audience" value={plan.audience} onChange={(e) => setPlan({ ...plan, audience: e.target.value })} />
        <input placeholder="Offer / value" value={plan.offer} onChange={(e) => setPlan({ ...plan, offer: e.target.value })} />
        <input placeholder="Tone" value={plan.tone} onChange={(e) => setPlan({ ...plan, tone: e.target.value })} />
        <input type="number" min={1} max={8} value={plan.steps} onChange={(e) => setPlan({ ...plan, steps: Number(e.target.value) })} title="Steps" />
        <input type="number" min={1} value={plan.totalDays} onChange={(e) => setPlan({ ...plan, totalDays: Number(e.target.value) })} title="Total days" /></div>
        <div className="info">{HINT_COPY.aiPrivacy} The AI only writes text; you choose sender, schedule and contacts.</div>
        <button onClick={() => aiPlan()}>Generate plan</button></div>}
      <div className="card"><input value={s.name} onChange={(e) => upd({ name: e.target.value })} style={{ width: "100%" }} />
        <SendVia options={options} value={via} onChange={(k) => { const [t, i] = k.split(":"); upd({ sendViaType: t || null, sendViaId: i || null }); }} />
        <label><input type="checkbox" checked={s.saveCopyToSent} onChange={(e) => upd({ saveCopyToSent: e.target.checked })} /> Save copy to Sent (mailbox senders)</label></div>
      <h3>Steps</h3>
      {s.steps.map((st, i) => (
        <div className="card" key={st.id ?? i}>
          <div className="row"><b>Step {i + 1}</b>
            {i > 0 && <>wait <input type="number" min={0} style={{ width: 60 }} value={st.delayDays} onChange={(e) => setStep(i, { delayDays: Number(e.target.value) })} /> days <input type="number" min={0} max={23} style={{ width: 60 }} value={st.delayHours} onChange={(e) => setStep(i, { delayHours: Number(e.target.value) })} /> hours after previous
              <label><input type="checkbox" checked={st.sameThread} onChange={(e) => setStep(i, { sameThread: e.target.checked })} /> same thread</label></>}
            <button className="sec" onClick={() => move(i, -1)}>↑</button><button className="sec" onClick={() => move(i, 1)}>↓</button>
            <button className="sec" onClick={() => aiPlan(i)} disabled={!plan.goal}>Regenerate</button>
            <button className="danger" onClick={() => upd({ steps: s.steps.filter((_, j) => j !== i) })}>Delete</button></div>
          {st.rationale && <p className="muted">AI rationale: {st.rationale}</p>}
          <input placeholder="Subject" value={st.subject} onChange={(e) => setStep(i, { subject: e.target.value })} style={{ width: "100%" }} />
          <textarea rows={6} value={st.bodyHtml} onChange={(e) => setStep(i, { bodyHtml: e.target.value })} />
          <p className="muted">Merge fields: {"{{firstName}} {{lastName}} {{email}} {{company}}"}, fallback: {"{{firstName|there}}"}. HTML is sanitized on save. The unsubscribe footer is added automatically.</p>
          <div className="row"><button className="sec" onClick={async () => { const r = await api<{ subject: string; html: string }>(`/api/sequences/${id}/preview`, "POST", { contactId: pick, subject: st.subject, bodyHtml: st.bodyHtml }); if (r.ok) setPreview(r.data as unknown as { subject: string; html: string }); else setMsg(r.data.error ?? "Pick a contact to preview"); }}>Preview</button>
            <button className="sec" onClick={async () => { const r = await api(`/api/sequences/${id}/test`, "POST", { subject: st.subject, bodyHtml: st.bodyHtml, contactId: pick || undefined }); setMsg(r.ok ? "Test sent to you" : r.data.error ?? "Failed (save the sender first)"); }}>Send test to myself</button></div>
        </div>
      ))}
      <div className="row"><button className="sec" onClick={() => upd({ steps: [...s.steps, { subject: "Following up", bodyHtml: "<p>Hi {{firstName|there}},</p>", delayDays: 2, delayHours: 0, sameThread: true }] })}>Add step</button>
        <select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Preview contact…</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.email}</option>)}</select></div>
      {preview && <div className="card"><b>Preview: {preview.subject}</b><div dangerouslySetInnerHTML={{ __html: preview.html }} /></div>}
      <h3>Sending schedule</h3>
      <div className="card">
        <div className="row">{DAYS.map((d, i) => <label key={d}><input type="checkbox" checked={s.sendDays.includes(i)} onChange={(e) => upd({ sendDays: e.target.checked ? [...s.sendDays, i] : s.sendDays.filter((x) => x !== i) })} />{d}</label>)}</div>
        <div className="row">From hour <input type="number" min={0} max={23} style={{ width: 60 }} value={s.startHour} onChange={(e) => upd({ startHour: Number(e.target.value) })} /> to <input type="number" min={1} max={24} style={{ width: 60 }} value={s.endHour} onChange={(e) => upd({ endHour: Number(e.target.value) })} />
          Timezone <input value={s.timezone} onChange={(e) => upd({ timezone: e.target.value })} placeholder="e.g. America/New_York" />
          Daily limit <input type="number" style={{ width: 70 }} value={s.dailySendLimit} onChange={(e) => upd({ dailySendLimit: Number(e.target.value) })} /> Hourly <input type="number" style={{ width: 70 }} value={s.hourlySendLimit} onChange={(e) => upd({ hourlySendLimit: Number(e.target.value) })} /></div>
        <div className="row"><label><input type="checkbox" checked={s.stopOnReply} onChange={(e) => upd({ stopOnReply: e.target.checked })} /> Stop on reply</label>
          <label><input type="checkbox" checked={s.skipUnverified} onChange={(e) => upd({ skipUnverified: e.target.checked })} /> Skip invalid / warn on risky &amp; unknown</label></div>
        <h4>Footer (mandatory; the unsubscribe link is always added)</h4>
        <textarea rows={2} value={s.footerText} onChange={(e) => upd({ footerText: e.target.value })} />
        <input placeholder="Postal address (required)" value={s.postalAddress} onChange={(e) => upd({ postalAddress: e.target.value })} style={{ width: "100%" }} />
      </div>
      <div className="row"><button onClick={() => save()}>Save</button>
        {s.status !== "active" ? <button onClick={() => save({ status: "active" })}>Activate</button> : <button className="sec" onClick={() => save({ status: "paused" })}>Pause</button>}
        <button className="danger" onClick={async () => { if (confirm("Delete sequence?")) { await api(`/api/sequences/${id}`, "DELETE"); window.location.href = "/sequences"; } }}>Delete</button></div>
      <h3>Enroll contacts</h3>
      <div className="row"><select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Pick a contact…</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.email}</option>)}</select>
        <button className="sec" disabled={!pick} onClick={() => enroll({ contactIds: [pick] })}>Enroll contact</button>
        <button className="sec" onClick={() => { const f = prompt("Saved filter (query string, e.g. status=valid&q=acme)", "status=valid"); if (f !== null) enroll({ filter: f }); }}>Enroll by filter</button></div>
      <h3>Activity</h3>
      <table><thead><tr><th>Contact</th><th>Step</th><th>Status</th><th>Next send</th><th></th></tr></thead>
        <tbody>{ens.map((e) => (
          <tr key={e.id}><td>{e.email}</td><td>{e.currentStep + 1}/{s.steps.length}</td><td>{e.status}{e.stopReason ? ` (${e.stopReason})` : ""}</td><td>{e.nextSendAt ? new Date(e.nextSendAt).toLocaleString() : "—"}</td>
            <td><button className="sec" onClick={async () => { await api(`/api/sequences/${id}/enrollments/${e.id}`, "PATCH", { action: e.status === "paused" ? "resume" : "pause" }); load(); }}>{e.status === "paused" ? "Resume" : "Pause"}</button>{" "}
              <button className="danger" onClick={async () => { await api(`/api/sequences/${id}/enrollments/${e.id}`, "PATCH", { action: "remove" }); load(); }}>Remove</button></td></tr>
        ))}</tbody></table>
    </>
  );
}
