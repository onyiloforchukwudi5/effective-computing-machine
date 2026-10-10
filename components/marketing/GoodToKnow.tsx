const POINTS = [
  "Sequences and auto-responders send real email in your name. Review AI-written content before it goes out.",
  "AI use has a daily cap.",
  "Contact verification needs outbound port 25 on the host and can be unavailable on some cloud hosts.",
  "Outreach goes through your own senders.",
];

export default function GoodToKnow() {
  return (
    <section aria-labelledby="gtk-h" className="container-page py-14">
      <h2 id="gtk-h" className="text-3xl">Good to know</h2>
      <ul className="warn mt-4 list-disc space-y-1 pl-6 !text-base">{POINTS.map((p) => <li key={p}>{p}</li>)}</ul>
    </section>
  );
}
