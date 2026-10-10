const FEATURES = [
  ["Mail accounts & sync", "Connect several mailboxes and keep them in sync."],
  ["Mail & compose", "Read and write mail across all your connected accounts."],
  ["Contacts & email verification", "Contacts from your mail, with checks on whether an address looks deliverable."],
  ["Sequences", "Multi-step drip campaigns with schedules, daily and hourly limits, and AI-written steps."],
  ["Auto-responders", "Answer incoming mail automatically, with an approval step by default and a master pause switch on the dashboard."],
  ["AI & business profile", "Use your own AI provider key or a server-wide one, and set tone, signature and a do-not-say list."],
  ["Dashboard", "See your mail, contacts and outreach activity at a glance."],
];

export default function Features() {
  return (
    <section id="features" aria-labelledby="feat-h" className="border-y border-line bg-surface-muted">
      <div className="container-page py-14">
        <h2 id="feat-h" className="text-3xl">What you get</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d]) => (
            <li key={t} className="card !mb-0"><h3>{t}</h3><p className="muted !text-base">{d}</p></li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">
          Every record is scoped to the signed-in user. Mailbox passwords, tokens and API keys are encrypted at rest and never sent back to the browser, and email confirmation is required to sign up. See our <a href="/privacy">privacy policy</a>.
        </p>
      </div>
    </section>
  );
}
