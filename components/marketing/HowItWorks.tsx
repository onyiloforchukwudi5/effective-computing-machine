const STEPS = [
  ["Connect your mailbox", "Add a mailbox with IMAP/SMTP settings, or connect Google, and let it sync."],
  ["Contacts build themselves", "Contacts are built from your mail. Check which addresses look real, then enrol people in a sequence."],
  ["AI drafts and answers", "AI drafts replies and can answer incoming mail. By default replies wait for your approval."],
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-h" className="container-page py-14">
      <h2 id="how-h" className="text-3xl">How it works</h2>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="card !mb-0">
            <span className="grid size-8 place-items-center rounded-full bg-brand text-sm font-semibold text-inverse">{i + 1}</span>
            <h3 className="mt-3">{t}</h3>
            <p className="muted !text-base">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
