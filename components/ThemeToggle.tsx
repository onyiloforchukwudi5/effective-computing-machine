"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const OPTIONS: { v: Theme; label: string; icon: React.ReactNode }[] = [
  { v: "light", label: "Light", icon: <path d="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4 7 17m10-10 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /> },
  { v: "dark", label: "Dark", icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /> },
  { v: "system", label: "System", icon: <path d="M4 5h16v11H4zM9 20h6m-3-4v4" /> },
];

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let t: Theme = "system";
    try {
      const s = localStorage.getItem("theme");
      if (s === "light" || s === "dark" || s === "system") t = s;
    } catch { /* storage unavailable */ }
    setTheme(t);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  function choose(t: Theme) {
    setTheme(t);
    try { localStorage.setItem("theme", t); } catch { /* ignore */ }
    apply(t);
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {OPTIONS.map((o) => {
        const on = theme === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => choose(o.v)}
            className={`rounded-md p-1.5 ${on ? "bg-brand-soft text-link" : "bg-transparent text-muted hover:bg-surface-muted"}`}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{o.icon}</svg>
          </button>
        );
      })}
    </div>
  );
}
