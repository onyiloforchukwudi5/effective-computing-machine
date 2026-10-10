import ThemeToggle from "./ThemeToggle";

/** Centered card layout shared by the sign-in, sign-up and password screens. */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 sm:py-10">
      <div className="mb-6 flex w-full max-w-md items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-semibold text-fg no-underline hover:no-underline">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-inverse" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
          </span>
          Mail CRM
        </a>
        <ThemeToggle />
      </div>
      <main className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-soft sm:p-7">{children}</main>
      <a href="/" className="mt-4 text-sm text-muted">← Back to home</a>
    </div>
  );
}
