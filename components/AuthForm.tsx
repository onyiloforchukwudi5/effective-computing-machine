"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "./AuthShell";
import VerifyCodeForm from "./VerifyCodeForm";

const MESSAGES: Record<string, string> = {
  google_unverified: "Google says this email address isn't verified, so we can't sign you in with it.",
  google_unavailable: "Google sign-in didn't work. Please try again or use email and password.",
  google_failed: "Google sign-in didn't work. Please try again or use email and password.",
  domain_blocked: "Please use a permanent email address.",
  signups_closed: "Sign-ups are currently closed.",
  signups_busy: "We're getting a lot of sign-ups right now, please try again later.",
};

function Form({ mode, googleEnabled }: { mode: "login" | "signup"; googleEnabled?: boolean }) {
  const params = useSearchParams();
  const urlError = MESSAGES[params.get("error") ?? ""] ?? "";
  const reset = params.get("reset") === "1" && mode === "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.verify) setVerify(true);
      else if (r.ok) window.location.href = "/dashboard";
      else if (r.status === 403 && data.code === "EMAIL_NOT_VERIFIED") setVerify(true);
      else setError(data.error ?? "Failed");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  if (verify) return <VerifyCodeForm email={email.trim().toLowerCase()} signup={mode === "signup"} onChangeEmail={() => setVerify(false)} />;

  const shownError = error || urlError;
  return (
    <>
      <h1>{mode === "login" ? "Log in" : "Create your account"}</h1>
      {reset && <p className="ok mb-3 text-sm" role="status">Password updated. Log in with your new password.</p>}
      {shownError && <p className="err mb-3 text-sm" role="alert">{shownError}</p>}
      {googleEnabled && (
        <>
          <a href="/api/auth/google/start" className="btn btn-secondary w-full">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21.35 11.1H12v2.9h5.35c-.5 2.4-2.5 3.5-5.35 3.5a6 6 0 1 1 0-12c1.5 0 2.8.5 3.8 1.4l2.1-2.1A9 9 0 1 0 12 21c5.2 0 9-3.6 9-9 0-.6-.05-.6-.15-.9Z" /></svg>
            Continue with Google
          </a>
          <div className="my-4 flex items-center gap-3 text-sm text-muted" aria-hidden="true"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
        </>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required className="input" />
          {mode === "signup" && <p className="muted mt-1">At least 8 characters.</p>}
          {mode === "login" && <p className="mt-1 text-sm"><a href="/forgot-password">Forgot password?</a></p>}
        </div>
        <button disabled={busy} className="btn btn-primary w-full">{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
        {mode === "signup" && (
          <p className="muted">By creating an account you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</p>
        )}
      </form>
      <p className="muted mt-4">{mode === "login" ? <>Need an account? <a href="/signup">Sign up</a></> : <>Have an account? <a href="/login">Log in</a></>}</p>
    </>
  );
}

export default function AuthForm({ mode, googleEnabled }: { mode: "login" | "signup"; googleEnabled?: boolean }) {
  return (
    <AuthShell>
      <Suspense fallback={null}><Form mode={mode} googleEnabled={googleEnabled} /></Suspense>
    </AuthShell>
  );
}
