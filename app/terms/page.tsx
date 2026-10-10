import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";
import { contactText, legal } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service | Mail CRM", description: "The terms for using Mail CRM." };
export const dynamic = "force-dynamic";

export default function Terms() {
  const law = legal.governingLaw();
  const sections = [
    { id: "service", title: "The service" },
    { id: "account", title: "Your account" },
    { id: "mailboxes", title: "Mailboxes you connect" },
    { id: "use", title: "Acceptable use" },
    { id: "ai", title: "AI and automated sending" },
    { id: "third", title: "Third-party services" },
    { id: "liability", title: "Warranty and liability" },
    ...(law ? [{ id: "law", title: "Governing law" }] : []),
    { id: "termination", title: "Suspension and termination" },
    { id: "changes", title: "Changes" },
    { id: "contact", title: "Contact" },
  ];
  return (
    <LegalLayout title="Terms of Service" sections={sections}>
      <section id="service"><h2>The service</h2><p>Mail CRM, operated by {legal.entity()}, lets you sync mailboxes, manage contacts, run outreach sequences and use AI to draft and answer email.</p></section>
      <section id="account"><h2>Your account</h2><p>You must confirm your email address (or sign in with a verified Google account). One account is for one person or business. Keep your credentials safe; you are responsible for activity under your account.</p></section>
      <section id="mailboxes"><h2>Mailboxes you connect</h2><p>You are responsible for the mailboxes and senders you connect and for having the right to use them.</p></section>
      <section id="use">
        <h2>Acceptable use</h2>
        <ul>
          <li>No spam, and no sending to people without a lawful basis.</li>
          <li>You are responsible for complying with anti-spam and privacy laws (such as CAN-SPAM, GDPR/PECR and CASL) for your outreach, and for honouring opt-outs. Sequence emails include an unsubscribe link in their footer.</li>
          <li>Do not abuse the AI features or the site&apos;s email sending, and do not try to break or overload the service.</li>
        </ul>
      </section>
      <section id="ai"><h2>AI and automated sending</h2><p>Sequences and auto-responders send real email in your name. AI-written content can be wrong, so review it; auto-responders require your approval by default.</p></section>
      <section id="third"><h2>Third-party services</h2><p>Google, AI providers and mail providers are governed by their own terms.</p></section>
      <section id="liability"><h2>Warranty and liability</h2><p>The service is provided &ldquo;as is&rdquo;, without warranties, and may be unavailable at times. To the extent permitted by law, we are not liable for indirect or consequential losses.</p></section>
      {law && <section id="law"><h2>Governing law</h2><p>These terms are governed by {law}.</p></section>}
      <section id="termination"><h2>Suspension and termination</h2><p>We may suspend or end accounts that break these terms. You can stop using the service at any time.</p></section>
      <section id="changes"><h2>Changes</h2><p>We may update these terms; the date above shows the latest version.</p></section>
      <section id="contact"><h2>Contact</h2><p>Questions: {contactText()}.</p></section>
    </LegalLayout>
  );
}
