import ThemeToggle from "../ThemeToggle";
import Footer from "../marketing/Footer";
import { legal } from "@/lib/legal";

export type LegalSection = { id: string; title: string };

export default function LegalLayout({ title, sections, children }: { title: string; sections: LegalSection[]; children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="container-page flex items-center justify-between py-3">
          <a href="/" className="font-semibold text-fg no-underline hover:no-underline">Mail CRM</a>
          <div className="flex items-center gap-3"><a href="/" className="text-sm">Back to home</a><ThemeToggle /></div>
        </div>
      </header>
      <main className="container-page py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="!text-3xl">{title}</h1>
          <p className="muted">Last updated: {legal.effective()}</p>
          <nav aria-label="Contents" className="card mt-6">
            <p className="mb-2 text-sm font-medium">Contents</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
            </ol>
          </nav>
          <div className="space-y-8 leading-7 [&_h2]:mt-0 [&_h2]:scroll-mt-20 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-6">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}
