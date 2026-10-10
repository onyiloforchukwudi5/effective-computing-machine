"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";

function Inner() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(!token);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords don't match");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
      if (r.ok) { window.location.href = "/login?reset=1"; return; }
      const msg = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "";
      if (msg.startsWith("This link")) setInvalid(true);
      else setError(msg || "Failed");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  if (invalid) {
    return (
      <>
        <h1>Reset password</h1>
        <p role="alert" className="err text-sm">This link is invalid or has expired</p>
        <p className="mt-4 text-sm"><a href="/forgot-password">Request a new link</a></p>
      </>
    );
  }
  return (
    <>
      <h1>Choose a new password</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="pw" className="label">New password</label>
          <input id="pw" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required className="input" />
          <p className="muted mt-1">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="pw2" className="label">Confirm password</label>
          <input id="pw2" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="input" />
        </div>
        {error && <p role="alert" className="err text-sm">{error}</p>}
        <button disabled={busy} className="btn btn-primary w-full">{busy ? "Please wait…" : "Update password"}</button>
      </form>
    </>
  );
}

export default function Page() {
  return <AuthShell><Suspense fallback={null}><Inner /></Suspense></AuthShell>;
}
