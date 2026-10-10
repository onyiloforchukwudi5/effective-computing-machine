import ThemeToggle from "../ThemeToggle";

export default function Header({ signedIn }: { signedIn: boolean }) {
  const cta = signedIn ? (
    <a href="/dashboard" className="btn btn-primary no-underline">Open dashboard</a>
  ) : (
    <>
      <a href="/login" className="btn btn-ghost no-underline">Log in</a>
      <a href="/signup" className="btn btn-primary no-underline">Create account</a>
    </>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur">
      <div className="container-page flex items-center justify-between gap-3 py-3">
        <a href="/" className="flex items-center gap-2 font-semibold text-fg no-underline hover:no-underline">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-inverse" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
          </span>
          Mail CRM
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-5 text-sm md:flex">
          <a href="#how-it-works" className="text-muted">How it works</a>
          <a href="#features" className="text-muted">Features</a>
          <a href="#faq" className="text-muted">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden items-center gap-2 sm:flex">{cta}</div>
          <details className="relative sm:hidden">
            <summary className="btn btn-secondary list-none" aria-label="Menu">Menu</summary>
            <div className="absolute right-0 mt-2 flex w-48 flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-lifted">
              <a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="#faq">FAQ</a>
              {cta}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
