"use client";

import { useEffect, useLayoutEffect } from "react";
import { SoulmateImage as Image } from "../soulmate-image";
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { trackSoulmate } from "@/lib/us-soulmate-tracking";
import { trackSoulmateCta } from "@/lib/us-soulmate-ads-events";
import styles from "../soulmate.module.css";

import { deliveryPlans } from "../chat-data";
import { discoverMoney, discoverTotal } from "@/components/soulmate-discover/pricing";

// Replace these slots with approved assets and testimonials when supplied.
const sketches = [
  "/soulmate/sketches/astrorekha-1.png",
  "/soulmate/sketches/astrorekha-2.png",
  "/soulmate/sketches/astrorekha-3.png",
  "/soulmate/sketches/astrorekha-4.png",
];
// Illustrative preview copy, not verified customer testimonials.
const previewTestimonials = [
  { message: "Your preferences and birth details provide the inspiration for an AI-generated digital portrait.", caption: "Personalized artwork" },
  { message: "You can review the package, optional extras and full price before deciding to pay.", caption: "Clear package choices" },
  { message: "A sketch is an imaginative keepsake. It does not identify a known future partner or guarantee a relationship.", caption: "What a sketch means" },
  { message: "The standard package includes a black-and-white sketch within 48 hours; the complete package includes color and a written reading within 12 hours.", caption: "Digital delivery" },
  { message: "For delivery, access or refund questions, contact team.astrorekha@gmail.com.", caption: "Customer support" },
];
const customerStories = [1, 2, 3, 4].map(number => ({ src: `/soulmate/sketches/astrorekha-${number}.png`, width: 600, height: 600 }));

function ReadingButton({ position, onStart }: { position: "hero" | "footer"; onStart: () => void }) {
  const showActionNote = position !== "footer";

  return (
    <div className={styles.action}>
      <button
        type="button"
        id={`us-soulmate-cta-${position === "footer" ? "bottom" : "hero"}`}
        className={styles.cta}
        onClick={() => { trackSoulmateCta(position === "footer" ? "bottom" : "hero"); onStart(); }}
        aria-describedby={showActionNote ? `reading-notice-${position}` : undefined}
      >
        Begin My Chat Reading <ArrowRight size={20} aria-hidden="true" />
      </button>
      {showActionNote ? (
        <p id={`reading-notice-${position}`} className={styles.actionNote} role="status">
          <LockKeyhole size={12} aria-hidden="true" /> Private · Automated AI chat · Packages from {discoverMoney(discoverTotal(deliveryPlans[0].price, "us"), "us")}, tax included
        </p>
      ) : null}
    </div>
  );
}

function ChatDisclaimer() {
  return (
    <p className={styles.finePrint}>By starting the chat you confirm you’re 18+ and agree to receive your reading and related emails. <a href="/Terms/terms-of-service.html">Terms</a> · <a href="/Terms/privacy-policy.html">Privacy</a> · AI-generated artwork for personal reflection; no future relationship is guaranteed.</p>
  );
}

export function SoulmateLanding({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    trackSoulmate("landing_view", { once: "landing" });
    let remaining = 10000;
    let since = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (timer) clearTimeout(timer);
      if (since) remaining -= Date.now() - since;
      since = 0;
      if (document.visibilityState === "visible" && remaining > 0) {
        since = Date.now();
        timer = setTimeout(() => { remaining = 0; since = 0; trackSoulmate("engaged", { once: "engaged" }); }, remaining);
      }
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", update); };
  }, []);

  useLayoutEffect(() => {
    // A fresh landing page must not inherit the previous chat/offer scroll position.
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    scrollToTop();
    const frame = window.requestAnimationFrame(scrollToTop);
    window.addEventListener("pageshow", scrollToTop);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", scrollToTop);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.officialBanner}>
        <ShieldCheck size={14} aria-hidden="true" /> AstroRekha · Personalized digital readings
      </div>

      <main className={styles.column}>
        <section className={styles.hero} aria-labelledby="soulmate-heading">
          <div className={styles.profileRow}>
            <div className={styles.brandMark}>
              <Image src="/soulmate/astrorekha-artist.png" width={124} height={124} alt="Astro Rekha’s virtual soulmate sketch artist" priority />

            </div>
            <span className={styles.onlineBadge}><Sparkles size={12} aria-hidden="true" /> AI sketch guide</span>
          </div>
          <p className={styles.brandName}>Astro Rekha</p>
          <p className={styles.brandSubtitle}>Personalized AI Soulmate Sketches</p>
          <p className={styles.connectionLine}><ShieldCheck size={12} aria-hidden="true" /><span>Private automated reading</span></p>
          <div className={styles.trustLine}>
            <span className={styles.stars} aria-hidden="true"><Sparkles size={18} /></span>
            <span>AI-generated digital artwork</span>
          </div>

          {/* Reference headline retained as campaign draft copy for this local preview. */}
          <h1 id="soulmate-heading">Your <em>Personalized Soulmate Sketch</em>, Inspired by You</h1>
          <p className={styles.heroDescription}>Chat privately with Astro Rekha, our automated AI guide. Explore your preferences and birth details, then choose a personalized digital sketch in a hand-drawn style.</p>

          <ReadingButton position="hero" onStart={onStart} />

          <div className={styles.personalNote}>
            <ShieldCheck size={14} aria-hidden="true" />
            {/* Draft offer copy; real capacity must be connected before a production launch. */}
            <p>Your sketch is generated after payment confirmation. Review the package and full price before placing an order.</p>
          </div>
          <ChatDisclaimer />
        </section>

        <section className={styles.gallerySection} aria-labelledby="sketches-heading">
          <h2 id="sketches-heading" className={styles.galleryHeading}>Examples of the sketch style</h2>
          <div className={styles.gallery} role="region" aria-label="Illustrative sketches — scroll to explore" tabIndex={0}>
            <div className={styles.galleryTrack}>
              {sketches.map((src, index) => (
                <Image
                  className={styles.sketchImage}
                  key={src}
                  src={src}
                  width={1122}
                  height={1402}
                  sizes="(max-width: 480px) 215px, 232px"
                  alt={`Illustrative AI portrait example ${index + 1}`}
                />
              ))}
            </div>
          </div>
          <div className={styles.galleryCaption}>
            <p>Illustrative AI-generated examples, not customer results or images of a known future partner. Your artwork is personalized after payment.</p>
          </div>
        </section>

        <section className={styles.messagesSection} aria-labelledby="messages-heading">
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>About your reading</span>
            <h2 id="messages-heading">What to expect</h2>
          </div>
          <div className={styles.messages}>
            {previewTestimonials.map(({ message, caption }) => (
              <figure key={message} className={styles.message}>
                <blockquote className={styles.messageBubble}>
                  <p>{message}</p>
                </blockquote>
                <figcaption>{caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className={styles.storiesSection} aria-labelledby="stories-heading">
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>Explore the artwork</span>
            <h2 id="stories-heading">A closer look at the sketch style</h2>
            <p>Illustrative AI portraits showing the style of digital artwork. They are not customer testimonials.</p>
          </div>
          <div className={styles.stories}>
            {customerStories.map(({ src, width, height }, index) => (
              <Image
                className={styles.storyImage}
                key={src}
                src={src}
                width={width}
                height={height}
                sizes="(max-width: 500px) calc(100vw - 40px), 460px"
                alt={`Illustrative AI portrait detail ${index + 1}`}
              />
            ))}
          </div>
        </section>

        <section className={styles.finalSection} aria-label="Start your soulmate sketch chat">
          <ReadingButton position="footer" onStart={onStart} />
          <p className={styles.finePrint}>By starting the chat you confirm you’re 18+ and agree to receive your sketch and related emails.</p>
        </section>

        <footer className={styles.footer}>
          <nav aria-label="Legal and contact">
            <a href="/Terms/privacy-policy.html">Privacy Policy</a>
            <a href="/Terms/terms-of-service.html">Terms of Service</a>
            <a href="/Terms/money-back-policy.html">Refund Policy</a>
            <a href="/Terms/contact-us.html">Contact</a>
          </nav>
          <p>Astro Rekha sketches are artistic interpretations for personal reflection. They do not identify a real future partner or guarantee a relationship or outcome.</p>
          <p>This website is not affiliated with or endorsed by Meta or Google.</p>
          <p>Operated by Visionary Era · IRIS-47, Chouhan Housing, Chouhan Green Valley, Bhilai – 490020, India</p>
          <p><a href="tel:+917828991668">+91 7828991668</a> · <a href="mailto:team.astrorekha@gmail.com">team.astrorekha@gmail.com</a></p>
          <p className={styles.copyright}>© {new Date().getFullYear()} Astro Rekha. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
