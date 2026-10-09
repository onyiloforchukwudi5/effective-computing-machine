"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { HINT_COPY, domainOf, isFreeMailMismatch } from "@/lib/deliverability";

export type SendOption = {
  type: "ACCOUNT" | "SMTP"; id: string; label: string; fromEmail: string; external: boolean; accountId: string | null;
  linkedSenderId: string | null; isDefault: boolean; host: string; provider: string | null;
};
export const keyOf = (o: { type: string; id: string }) => `${o.type}:${o.id}`;

export function useSendOptions() {
  const [options, setOptions] = useState<SendOption[]>([]);
  useEffect(() => { api<SendOption[]>("/api/send-options").then((r) => r.ok && setOptions(r.data as unknown as SendOption[])); }, []);
  return options;
}

/** Shared 'Send via' dropdown. Shows the deliverability note only for external SMTP senders. */
export default function SendVia({ options, value, onChange, showHint = true }: { options: SendOption[]; value: string; onChange: (k: string) => void; showHint?: boolean }) {
  const sel = options.find((o) => keyOf(o) === value);
  return (
    <div>
      <label>Send via{" "}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {options.map((o) => <option key={keyOf(o)} value={keyOf(o)}>{o.external ? "SMTP: " : "Mailbox: "}{o.label}</option>)}
        </select>
      </label>
      {showHint && sel?.external && (
        <>
          <div className="info">
            {HINT_COPY.composer(domainOf(sel.fromEmail), sel.provider ?? sel.host)} <a href="/senders">Review this sender</a>
          </div>
          {isFreeMailMismatch(sel.fromEmail, sel.host) && <div className="warn"><b>Warning:</b> {HINT_COPY.freeMail(domainOf(sel.fromEmail))}</div>}
        </>
      )}
    </div>
  );
}
