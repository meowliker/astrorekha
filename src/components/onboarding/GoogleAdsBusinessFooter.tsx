import Link from "next/link";

export function GoogleAdsBusinessFooter() {
  return <footer className="w-full px-6 pb-6 text-center text-xs leading-relaxed text-white/60">
    <nav aria-label="Business and policies" className="flex flex-wrap justify-center gap-x-4 gap-y-2 mb-3">
      <Link href="/Terms/about-us.html" className="underline underline-offset-2">About us</Link>
      <Link href="/Terms/contact-us.html" className="underline underline-offset-2">Contact us</Link>
      <Link href="/Terms/privacy-policy.html" className="underline underline-offset-2">Privacy</Link>
      <Link href="/Terms/terms-of-service.html" className="underline underline-offset-2">Terms</Link>
      <Link href="/Terms/money-back-policy.html" className="underline underline-offset-2">Refund policy</Link>
    </nav>
    <p>AstroRekha is operated by Visionary Era.</p>
    <address className="not-italic">IRIS-47, Chouhan Housing, Chouhan Green Valley, Bhilai – 490020, India</address>
    <p><a href="tel:+917828991668">+91 7828991668</a> · <a href="mailto:team.astrorekha@gmail.com">team.astrorekha@gmail.com</a></p>
  </footer>;
}
