"use client";

import { useEffect, useLayoutEffect } from "react";
import { SoulmateImage as Image } from "./soulmate-image";
import { ArrowRight, LockKeyhole, ShieldCheck, Star } from "lucide-react";
import { trackSoulmate } from "@/lib/us-soulmate-tracking";
import styles from "./soulmate.module.css";

// Replace these slots with approved assets and testimonials when supplied.
const sketches = [
  "/soulmate/sketches/astrorekha-1.png",
  "/soulmate/sketches/astrorekha-2.png",
  "/soulmate/sketches/astrorekha-3.png",
  "/soulmate/sketches/astrorekha-4.png",
];
// Illustrative preview copy, not verified customer testimonials.
const previewTestimonials = [
  {
    message: "I met him a few weeks later, and the resemblance honestly surprised me. The same eyes, the same smile, even the shape of his face looked like the sketch.",
    caption: "After meeting him",
  },
  {
    message: "Oh wow, this is so close to the face I kept imagining! I actually gasped when I opened it. I wasn’t expecting it to feel this personal.",
    caption: "On sketch delivery",
  },
  {
    message: "His face feels strangely familiar, like I may have seen him somewhere before but can’t remember where. I felt warm the moment I looked at it.",
    caption: "After seeing her sketch",
  },
  {
    message: "I have to admit I’m still a little skeptical, but I saved the sketch on my phone. I’m curious to see whether I recognize him someday.",
    caption: "First reaction from a new client",
  },
  {
    message: "This man looks more familiar than I expected. The glasses, the light facial hair, and even the way he smiles remind me of someone—but I can’t place him yet.",
    caption: "On sketch delivery",
  },
];
const customerStories = [
  { src: "/soulmate/messages/20.png", width: 2484, height: 4999 },
  { src: "/soulmate/messages/21.png", width: 3166, height: 4853 },
  { src: "/soulmate/messages/23.png", width: 3053, height: 5000 },
  { src: "/soulmate/messages/22.png", width: 3334, height: 4606 },
];

function ReadingButton({ position, onStart }: { position: string; onStart: () => void }) {
  const showActionNote = position !== "footer";

  return (
    <div className={styles.action}>
      <button
        type="button"
        className={styles.cta}
        onClick={onStart}
        aria-describedby={showActionNote ? `reading-notice-${position}` : undefined}
      >
        Begin My Chat Reading <ArrowRight size={20} aria-hidden="true" />
      </button>
      {showActionNote ? (
        <p id={`reading-notice-${position}`} className={styles.actionNote} role="status">
          <LockKeyhole size={12} aria-hidden="true" /> Private · Takes about 2 minutes
        </p>
      ) : null}
    </div>
  );
}

function ChatDisclaimer() {
  return (
    <p className={styles.finePrint}>By starting the chat you confirm you’re 18+ and agree to receive your reading and related emails. <a href="/Terms/terms-of-service.html">Terms</a> · <a href="/Terms/privacy-policy.html">Privacy</a> · For entertainment purposes only.</p>
  );
}

export function SoulmateLanding({ visitorLocation, onStart }: { visitorLocation: string | null; onStart: () => void }) {
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
        <ShieldCheck size={14} aria-hidden="true" /> Official website of AstroRekha — beware of imitations
      </div>

      <main className={styles.column}>
        <section className={styles.hero} aria-labelledby="soulmate-heading">
          <div className={styles.profileRow}>
            <div className={styles.brandMark}>
              <Image src="/soulmate/astrorekha-artist.png" width={124} height={124} alt="Astro Rekha’s virtual soulmate sketch artist" priority />
              <span className={styles.portraitOnlineDot} aria-hidden="true" />
            </div>
            <span className={styles.onlineBadge}><span aria-hidden="true" /> AstroRekha is online</span>
          </div>
          <p className={styles.brandName}>Astro Rekha</p>
          <p className={styles.brandSubtitle}>Personalized Soulmate Sketch Artist</p>
          <p className={styles.connectionLine}>
            <span className={styles.connectionDot} aria-hidden="true" /> Connected ·
            {visitorLocation ? <><span title="Approximate location based on your connection">{visitorLocation}</span> ·</> : null}
            <span>Online now</span>
          </p>
          <div className={styles.trustLine}>
            <span className={styles.stars} aria-hidden="true">{[0, 1, 2, 3, 4].map((star) => <Star key={star} size={18} fill="currentColor" strokeWidth={0} />)}</span>
            <span>Trusted by 5,000+ women</span>
          </div>

          {/* Reference headline retained as campaign draft copy for this local preview. */}
          <h1 id="soulmate-heading">“Just <em>Two Weeks</em> After My Sketch, I Met My Soulmate”</h1>
          <p className={styles.heroDescription}>Chat privately with Astro Rekha right now. Explore your birth energy together — then discover a personalized, hand-drawn-style sketch of the person who could be part of your love story.</p>

          <ReadingButton position="hero" onStart={onStart} />

          <div className={styles.personalNote}>
            <span className={styles.urgencyDot} aria-hidden="true" />
            {/* Draft offer copy; real capacity must be connected before a production launch. */}
            <p>Astro Rekha creates a limited number of personalized sketches each day — only one slot remains today. Start your chat to reserve it.</p>
          </div>
          <ChatDisclaimer />
        </section>

        <section className={styles.gallerySection} aria-labelledby="sketches-heading">
          <h2 id="sketches-heading" className={styles.galleryHeading}>Recent sketches by Astro Rekha</h2>
          <div className={styles.gallery} role="region" aria-label="Recent sketches — scroll to explore" tabIndex={0}>
            <div className={styles.galleryTrack}>
              {sketches.map((src, index) => (
                <Image
                  className={styles.sketchImage}
                  key={src}
                  src={src}
                  width={1122}
                  height={1402}
                  sizes="(max-width: 480px) 215px, 232px"
                  alt={`Recent personalized soulmate sketch ${index + 1} by Astro Rekha`}
                />
              ))}
            </div>
          </div>
          <div className={styles.galleryCaption}>
            <p>Every sketch is created in a hand-drawn style by Astro Rekha. Yours is personalized just for you.</p>
          </div>
        </section>

        <section className={styles.messagesSection} aria-labelledby="messages-heading">
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>Messages from sketch clients</span>
            <h2 id="messages-heading">Their first reactions</h2>
          </div>
          <div className={styles.messages}>
            {previewTestimonials.map(({ message, caption }) => (
              <figure key={message} className={styles.message}>
                <blockquote className={styles.messageBubble}>
                  <p>“{message}”</p>
                </blockquote>
                <figcaption>{caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className={styles.storiesSection} aria-labelledby="stories-heading">
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>Behind every sketch, a story</span>
            <h2 id="stories-heading">Love, in their own words</h2>
            <p>A closer look at the conversations behind the experience.</p>
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
                alt={`Astro Rekha customer soulmate sketch story ${index + 1}`}
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
          <p>Astro Rekha sketches are artistic interpretations for entertainment and self-reflection. They do not identify a real future partner or guarantee a relationship or outcome.</p>
          <p>This website is not affiliated with or endorsed by Meta or Google.</p>
          <p className={styles.copyright}>© {new Date().getFullYear()} Astro Rekha. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
