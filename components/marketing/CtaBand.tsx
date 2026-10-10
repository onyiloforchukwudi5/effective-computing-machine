export default function CtaBand({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="cta-h" className="container-page pb-14">
      <div className="rounded-xl bg-brand px-6 py-10 text-center text-inverse">
        <h2 id="cta-h" className="text-3xl">Turn your inbox into a CRM</h2>
        <a href={signedIn ? "/dashboard" : "/signup"} className="btn mt-5 bg-white text-slate-900 no-underline hover:bg-slate-100">
          {signedIn ? "Open dashboard" : "Create account"}
        </a>
      </div>
    </section>
  );
}
