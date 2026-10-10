import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import Header from "@/components/marketing/Header";
import Hero from "@/components/marketing/Hero";
import HowItWorks from "@/components/marketing/HowItWorks";
import Features from "@/components/marketing/Features";
import GoodToKnow from "@/components/marketing/GoodToKnow";
import Faq from "@/components/marketing/Faq";
import CtaBand from "@/components/marketing/CtaBand";
import Footer from "@/components/marketing/Footer";

const description = "Mail CRM syncs your mailboxes, builds contacts, runs outreach sequences and drafts or answers replies with AI.";
export const metadata: Metadata = {
  title: "Mail CRM: your inbox, turned into a CRM",
  description,
  openGraph: { title: "Mail CRM", description, type: "website" },
  twitter: { card: "summary", title: "Mail CRM", description },
};
export const dynamic = "force-dynamic";

export default async function Home() {
  const signedIn = !!(await currentUser());
  return (
    <>
      <Header signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} />
        <HowItWorks />
        <Features />
        <GoodToKnow />
        <Faq />
        <CtaBand signedIn={signedIn} />
      </main>
      <Footer />
    </>
  );
}
