export function SoulmateBusinessFooter({ light = false }: { light?: boolean }) {
  return <footer className={`mx-auto w-full max-w-3xl px-5 py-8 text-center text-xs leading-6 ${light ? "text-slate-600" : "text-slate-400"}`}>
    <nav aria-label="Business and policies" className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
      <a href="/Terms/about-us.html">About us</a><a href="/Terms/contact-us.html">Contact us</a>
      <a href="/Terms/privacy-policy.html">Privacy</a><a href="/Terms/terms-of-service.html">Terms</a>
      <a href="/Terms/money-back-policy.html">Refund policy</a>
    </nav>
    <p>AI-generated portraits and readings for personal reflection. They do not identify a real future partner or guarantee a relationship or outcome.</p>
    <p>AstroRekha is operated by Visionary Era.</p>
    <address className="not-italic">IRIS-47, Chouhan Housing, Chouhan Green Valley, Bhilai – 490020, India</address>
    <p><a href="tel:+917828991668">+91 7828991668</a> · <a href="mailto:team.astrorekha@gmail.com">team.astrorekha@gmail.com</a></p>
  </footer>;
}
