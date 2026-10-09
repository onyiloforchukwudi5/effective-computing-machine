"use client";
import { useState } from "react";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });
    if (r.ok) window.location.href = "/dashboard";
    else setError((await r.json()).error ?? "Failed");
  }
  return (
    <main style={{ maxWidth: 360 }}>
      <h1>{mode === "login" ? "Log in" : "Sign up"}</h1>
      <form onSubmit={submit} className="card">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%" }} />
        <input type="password" placeholder="Password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%" }} />
        {error && <p className="err">{error}</p>}
        <button>{mode === "login" ? "Log in" : "Create account"}</button>
        <p className="muted">{mode === "login" ? <a href="/signup">Need an account?</a> : <a href="/login">Have an account?</a>}</p>
      </form>
    </main>
  );
}
