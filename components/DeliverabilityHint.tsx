"use client";
import { hintFor } from "@/lib/deliverability";

export default function DeliverabilityHint({ fromEmail, host, onDismiss }: { fromEmail: string; host: string; onDismiss?: () => void }) {
  const h = hintFor(fromEmail, host);
  if (!h.domain && !fromEmail) return null;
  return (
    <>
      {h.freeMailWarning && <div className="warn"><b>Warning:</b> {h.freeMailWarning}</div>}
      <div className="info">
        {h.general}
        {h.providerTip && <div style={{ marginTop: 4 }}>{h.providerTip}</div>}
        {onDismiss && <div><button className="sec" style={{ marginTop: 6, padding: "2px 8px" }} onClick={onDismiss}>Dismiss</button></div>}
      </div>
    </>
  );
}
