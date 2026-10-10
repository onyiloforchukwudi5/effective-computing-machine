export default function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="bg-gradient-to-b from-brand-soft to-page">
      <div className="container-page grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2">
        <div>
          <h1 className="!text-4xl !font-bold sm:!text-5xl">Your inbox, turned into a CRM</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Mail CRM syncs your real mailboxes, builds your contacts from them, runs outreach sequences, drafts replies with AI and can answer incoming mail for you.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {signedIn ? (
              <a href="/dashboard" className="btn btn-primary no-underline">Open dashboard</a>
            ) : (
              <a href="/signup" className="btn btn-primary no-underline">Create account</a>
            )}
            <a href="#how-it-works" className="btn btn-secondary no-underline">See how it works</a>
          </div>
        </div>
        <div aria-hidden="true" className="rounded-xl border border-line bg-surface p-4 shadow-lifted">
          <div className="mb-3 flex gap-1.5"><span className="size-2.5 rounded-full bg-danger-line" /><span className="size-2.5 rounded-full bg-warning-line" /><span className="size-2.5 rounded-full bg-success-line" /></div>
          <div className="grid grid-cols-3 gap-2">
            {["Contacts", "Sequences", "Replies"].map((l) => (
              <div key={l} className="rounded-lg bg-surface-muted p-3"><div className="text-xs text-muted">{l}</div><div className="mt-1 h-4 w-10 rounded bg-brand/70" /></div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {[70, 55, 85].map((w, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                <span className="size-7 rounded-full bg-brand-soft" />
                <div className="flex-1 space-y-1.5"><div className="h-2.5 rounded bg-line" style={{ width: `${w}%` }} /><div className="h-2 w-1/2 rounded bg-surface-muted" /></div>
                <span className="badge-neutral">Draft</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
