"use client";
import { useEffect, useRef, useState } from "react";

const COOLDOWN = 60;

export default function VerifyCodeForm({ email, onChangeEmail, signup }: { email: string; onChangeEmail?: () => void; signup?: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wrong, setWrong] = useState(0);
  const [cool, setCool] = useState(0);
  const [sent, setSent] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  async function submit(value: string) {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/verify", { method: "POST", body: JSON.stringify({ email, code: value }) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) { window.location.href = "/dashboard"; return; }
      setError(data.error ?? "That code is incorrect or has expired");
      setWrong((w) => w + 1);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setCode("");
    setBusy(false);
    setTimeout(() => input.current?.focus(), 0);
  }

  function onChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void submit(digits);
  }

  async function resend() {
    if (cool > 0) return;
    setCool(COOLDOWN);
    setSent(true);
    setError("");
    await fetch("/api/auth/resend", { method: "POST", body: JSON.stringify({ email }) }).catch(() => {});
  }

  return (
    <div>
      <h1 className="!mb-2">Check your inbox</h1>
      <p className="muted !text-base">We sent a 6-digit code to <strong className="break-all text-fg">{email}</strong>. It expires in 15 minutes.</p>
      <form onSubmit={(e) => { e.preventDefault(); void submit(code); }} className="mt-5">
        <label htmlFor="code" className="label">Confirmation code</label>
        <input
          id="code" ref={input} value={code} onChange={(e) => onChange(e.target.value)} disabled={busy}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus
          aria-describedby="code-msg"
          className="w-full py-3 text-center font-mono text-3xl tracking-[0.5em] sm:text-4xl"
        />
        <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary mt-3 w-full">{busy ? "Checking…" : "Confirm"}</button>
      </form>
      <div id="code-msg" aria-live="polite" className="mt-3 min-h-6 text-sm">
        {error && <p role="alert" className="err">{error}</p>}
        {!error && sent && cool > 0 && <p className="ok">New code sent</p>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={resend} disabled={cool > 0} className="btn btn-secondary">
          {cool > 0 ? `Send a new code (${cool}s)` : "Send a new code"}
        </button>
        {onChangeEmail
          ? <button type="button" onClick={onChangeEmail} className="btn btn-ghost">Use a different email</button>
          : <a href="/signup" className="text-sm">Use a different email</a>}
      </div>
      <p className={`mt-3 text-sm ${wrong >= 3 ? "rounded-lg border border-warning-line bg-warning-soft p-2 text-warning" : "text-muted"}`}>
        Codes stop working after 5 wrong tries. Use “Send a new code” if you need another.
      </p>
      {signup && (
        <p className="mt-3 text-sm text-muted">
          Didn&apos;t get a code? If you already have an account, <a href="/login">log in</a> or <a href="/forgot-password">reset your password</a>.
        </p>
      )}
    </div>
  );
}
