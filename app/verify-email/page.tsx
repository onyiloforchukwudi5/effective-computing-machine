"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import VerifyCodeForm from "@/components/VerifyCodeForm";

function Inner() {
  const initial = useSearchParams().get("email")?.trim().toLowerCase() ?? "";
  const [email, setEmail] = useState(initial);
  const [ready, setReady] = useState(!!initial);
  if (ready) return <VerifyCodeForm email={email} onChangeEmail={() => setReady(false)} />;
  return (
    <>
      <h1>Confirm your email</h1>
      <form onSubmit={(e) => { e.preventDefault(); setEmail(email.trim().toLowerCase()); setReady(true); }} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
        </div>
        <button className="btn btn-primary w-full">Continue</button>
      </form>
      <p className="muted mt-4"><a href="/login">Back to log in</a></p>
    </>
  );
}

export default function Page() {
  return <AuthShell><Suspense fallback={null}><Inner /></Suspense></AuthShell>;
}
