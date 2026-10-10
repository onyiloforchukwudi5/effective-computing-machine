"use client";
import { useState } from "react";
import AuthShell from "@/components/AuthShell";

export default function Page() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }).catch(() => {});
    setDone(true);
    setBusy(false);
  }
  return (
    <AuthShell>
      <h1>Forgot password</h1>
      {done ? (
        <p role="status" className="text-sm">If an account exists for that email, we&apos;ve sent a reset link.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
          </div>
          <button disabled={busy} className="btn btn-primary w-full">{busy ? "Please wait…" : "Send reset link"}</button>
        </form>
      )}
      <p className="muted mt-4"><a href="/login">Back to log in</a></p>
    </AuthShell>
  );
}
