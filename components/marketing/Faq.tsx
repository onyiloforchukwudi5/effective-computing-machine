const QA = [
  ["Does it send email without asking me?", "Auto-responders ask for your approval by default. Sequences you start send real email in your name, within the limits you set."],
  ["Which mailboxes can I connect?", "Any mailbox reachable over IMAP/SMTP, plus Google for mail access."],
  ["Who sees the AI content?", "Mail content you ask the AI to work with is sent to the AI provider that you or the server administrator configured."],
  ["Is my data private?", "Records are scoped to your account and credentials are encrypted at rest. See the privacy policy for details."],
  ["Does email verification always work?", "It needs outbound port 25, which some cloud hosts block. The Contacts page warns you when it is unavailable."],
  ["Is there an unsubscribe link in sequences?", "Yes, sequence emails include a footer with an unsubscribe link."],
];

export default function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-h" className="container-page py-14">
      <h2 id="faq-h" className="text-3xl">FAQ</h2>
      <div className="mt-6 divide-y divide-line rounded-xl border border-line bg-surface">
        {QA.map(([q, a]) => (
          <details key={q} className="group p-4">
            <summary className="cursor-pointer font-medium">{q}</summary>
            <p className="muted mt-2 !text-base">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
