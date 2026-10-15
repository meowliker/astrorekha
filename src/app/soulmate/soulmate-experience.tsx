"use client";
import { startSoulmateSession, saveDraft, flushDraft } from "./session-save";

import { trackSoulmate } from "@/lib/soulmate-tracking";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { SoulmateImage as Image } from "./soulmate-image";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, LockKeyhole, Send, Sparkles, Star, Palette, Mail } from "lucide-react";
import { SoulmateLanding } from "./soulmate-landing";
import { Answers, choices, conversation, DeliveryId, deliveryPlans, formatRupees, getZodiac, messageDelay, preferenceOptions, sanitizeAnswers, Step, steps, validateAnswer } from "./chat-data";
import { useRouter } from "next/navigation";
import { CHECKOUT_ATTEMPT_KEY, CHECKOUT_RECOVERY_KEY, clearCheckoutDetails, prepareCheckout, readCheckoutDetails } from "./checkout-state";
import styles from "./soulmate-chat.module.css";

const portraits = [1, 2, 3, 4];
const stories = [
  { file: "astrorekha-clean-5", width: 1586, height: 992 },
  { file: "astrorekha-clean-6", width: 1586, height: 992 },
  { file: "astrorekha-clean-7", width: 1586, height: 992 },
  { file: "astrorekha-clean-8", width: 1586, height: 992 },
];

function AnswerInput({ step, selectedPreference, onAnswer }: { step: Step; selectedPreference?: string; onAnswer: (value: string) => void }) {
  const [text, setText] = useState("");
  const [custom, setCustom] = useState(false);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();
  const days = month ? new Date(Number(year) || 2000, Number(month), 0).getDate() : 31;

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = step === "birthDate" ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : text.trim();
    const problem = validateAnswer(step, value);
    setError(problem);
    if (!problem) onAnswer(value);
  }

  if (step === "birthDate") return (
    <form onSubmit={submit} className={styles.answerForm} aria-label="Your date of birth">
      <div className={styles.dateFields}>
        <label>Month<select aria-describedby={error ? "answer-error" : undefined} value={month} onChange={(event) => { setMonth(event.target.value); if (Number(day) > new Date(Number(year) || 2000, Number(event.target.value), 0).getDate()) setDay(""); setError(null); }} required autoFocus>
          <option value="">Month</option>
          {Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{new Date(2000, index, 1).toLocaleString("en", { month: "long" })}</option>)}
        </select></label>
        <label>Day<select aria-describedby={error ? "answer-error" : undefined} value={day} onChange={(event) => { setDay(event.target.value); setError(null); }} required>
          <option value="">Day</option>
          {Array.from({ length: days }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
        </select></label>
        <label>Year<select aria-describedby={error ? "answer-error" : undefined} value={year} onChange={(event) => { setYear(event.target.value); if (month && Number(day) > new Date(Number(event.target.value), Number(month), 0).getDate()) setDay(""); setError(null); }} required>
          <option value="">Year</option>
          {Array.from({ length: 103 }, (_, index) => <option key={index} value={currentYear - 18 - index}>{currentYear - 18 - index}</option>)}
        </select></label>
      </div>
      {error && <p id="answer-error" className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary} type="submit" disabled={!year || !month || !day}>This is my date of birth <ArrowRight size={17} /></button>
    </form>
  );

  const options = step === "name" ? null : step === "preference" ? preferenceOptions(selectedPreference) : choices[step].map((value) => ({ value, label: value }));
  return (
    <div className={styles.answerForm}>
      {options && <div className={`${styles.choices} ${step === "ethnicity" ? styles.ethnicityChoices : ""}`} aria-label={`Choose your ${step === "ethnicity" ? "sketch’s ethnic background" : "answer"}`}>
        {options.map((option) => <button key={option.value} type="button" onClick={() => onAnswer(option.value)}>{option.label}<ArrowRight size={15} aria-hidden="true" /></button>)}
      </div>}
      {(step === "heart" || step === "feeling") && !custom && <button type="button" className={styles.textButton} onClick={() => setCustom(true)}>I’d like to write my own answer</button>}
      {(step === "name" || custom) && <form onSubmit={submit}>
        <label className={styles.srOnly} htmlFor="chat-answer">{step === "name" ? "First name" : "Your answer"}</label>
        <div className={styles.composer}>
          <input id="chat-answer" autoFocus autoComplete={step === "name" ? "given-name" : "off"} value={text} onChange={(event) => setText(event.target.value)} placeholder={step === "name" ? "Your first name…" : "Tell me in your own words…"} maxLength={step === "name" ? 40 : 200} aria-describedby={error ? "answer-error" : undefined} required />
          <button type="submit" disabled={!text.trim()} aria-label="Send answer"><Send size={18} /></button>
        </div>
        {error && <p id="answer-error" role="alert" className={styles.error}>{error}</p>}
      </form>}
    </div>
  );
}

function ZodiacCard({ birthDate, reducedMotion }: { birthDate: string; reducedMotion: boolean }) {
  const [progress, setProgress] = useState(0);
  const zodiac = getZodiac(birthDate);
  // A decorative entertainment score, not a measured compatibility result.
  const target = 90;
  useEffect(() => {
    if (reducedMotion) { setProgress(target); return; }
    let frame: number;
    let start: number | undefined;
    const animate = (time: number) => {
      start ??= time;
      const elapsed = Math.min((time - start) / 2200, 1);
      setProgress(Math.round(target * (1 - (1 - elapsed) ** 3)));
      if (elapsed < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion]);
  return <div className={styles.zodiac}>
    <Sparkles size={22} aria-hidden="true" />
    <h2>{zodiac.name}</h2>
    <p className={styles.eyebrow}>Birth signal · Soul resonance</p>
    <div className={styles.resonanceTrack} role="progressbar" aria-label="Compatibility resonance — for entertainment" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
    <p className={styles.resonanceValue}>{progress}<span>%</span></p>
    <p className={styles.resonanceLabel}>compatibility resonance</p>
  </div>;
}

function PlanCards({ onSelect }: { onSelect: (plan: DeliveryId) => void }) {
  return <div className={styles.plans}>
    {deliveryPlans.map((plan) => <article key={plan.id} className={`${styles.plan} ${plan.id === "express" ? styles.express : ""}`}>
      {plan.id === "express" && <span className={styles.slotBadge}>Only 2 slots left</span>}
      <p className={styles.eyebrow}>{plan.label}</p>
      <h3>{plan.name}</h3>
      <p className={styles.price}>{formatRupees(plan.price)}</p>
      <ul>{plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
      <button type="button" className={plan.id === "express" ? styles.primary : styles.secondary} onClick={() => onSelect(plan.id)}>{plan.cta} <ArrowRight size={16} /></button>
      <p className={styles.taxNote}>One-time payment</p>
      <p className={styles.gstDisclosure}>The prices are excl. of GST</p>
    </article>)}
  </div>;
}

function SketchOffer({ onSelect }: { onSelect: (plan: DeliveryId) => void }) {
  const [remaining, setRemaining] = useState(30 * 60);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  useEffect(() => {
    const deadline = Date.now() + 30 * 60 * 1000;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const time = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  return <section className={styles.offer} aria-label="Your soulmate sketch packages">
    <div className={styles.sessionTimer} role="timer" aria-label={`Your session is held for ${time}`}><Clock3 size={14} aria-hidden="true" />{`Your session is held for ${time}`}</div>
    <PlanCards onSelect={onSelect} />
    <p className={styles.sameSketch}><LockKeyhole size={14} /> Secure checkout · 6,000+ sketches delivered</p>
    <section className={styles.workSection} aria-labelledby="recent-title"><span className={styles.eyebrow}>From the studio</span><h2 id="recent-title">Recent soulmate sketches</h2><div className={styles.portraits} role="region" aria-label="Recent soulmate sketches">{portraits.map((number) => <Image key={number} src={`/soulmate/offer-sketches/astrorekha-signed-${number}.png`} width={1254} height={1254} sizes="(max-width: 650px) calc((100vw - 47px) / 2), 300px" alt={`Astro Rekha soulmate sketch example ${number}`} />)}</div></section>
    <section className={styles.workSection} aria-labelledby="stories-title"><span className={styles.eyebrow}>The stories behind the sketches</span><h2 id="stories-title">And then, a familiar face.</h2><p>Messages about the moment they met someone who looked like their sketch.</p><div className={styles.storyGallery} role="region" aria-label="Soulmate sketch stories">{stories.map(({ file, width, height }, index) => <Image key={file} src={`/soulmate/stories/${file}.png`} width={width} height={height} sizes="(max-width: 650px) calc(100vw - 40px), 616px" alt={`Soulmate sketch beside a couple’s photo — comparison ${index + 1}`} />)}</div></section>
    <section className={styles.storyCta} aria-label="Choose your soulmate package">
      <p>Your sketch begins with the details you’ve shared. Choose your package, and take the next step when you’re ready.</p>
      <button type="button" className={styles.primary} onClick={() => onSelect("express")}>Complete Soulmate Vision — ₹1,499 <ArrowRight size={16} /></button>
      <button type="button" className={styles.standardLink} onClick={() => onSelect("standard")}>or Soulmate Sketch — ₹999</button>
      <p className={styles.gstDisclosure}>The prices are excl. of GST</p>
    </section>
    <section className={styles.reviewSection} aria-labelledby="reviews-title">
      <h2 id="reviews-title">When the sketch feels familiar</h2>
      {[
        { name: "Ananya", location: "Mumbai", image: "ananya", quote: "I showed him the sketch after our third date and we both just stared at it. The smile was so similar! I’m not saying I know where this is going yet, but it was such a lovely coincidence." },
        { name: "Arjun", location: "Bengaluru", image: "arjun", quote: "A friend introduced us, and something about her face felt familiar. Later I pulled up my sketch — it was the eyes and the way she smiled. I sent it to my sister and she noticed it too. We’re still getting to know each other, but that moment stayed with me." },
      ].map((review) => <article className={styles.reviewCard} key={review.name}>
        <header className={styles.reviewHeader}>
          <Image className={styles.reviewAvatar} src={`/soulmate/reviews/${review.image}.png`} width={49} height={49} sizes="49px" alt={`Generated portrait for ${review.name}’s illustrative story`} />
          <div><div className={styles.reviewStars} role="img" aria-label="5 out of 5 stars">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill="currentColor" aria-hidden="true" />)}</div>
          <p><strong>{review.name}</strong><span> · {review.location}</span></p>
          <span className={styles.reviewBadge}>Verified Buyer</span></div>
        </header>
        <blockquote>“{review.quote}”</blockquote>
      </article>)}
    </section>
    <section className={styles.socialSection} aria-labelledby="social-posts-title">
      <h2 id="social-posts-title">Stories they shared</h2>
      <p>A place for the moments they wanted to tell others about.</p>
      <div className={styles.socialPosts}>
        {[
          { number: 1, name: "Priya Sharma" },
          { number: 3, name: "Meera Iyer" },
          { number: 2, name: "Ananya Patel" },
          { number: 4, name: "Arjun Kapoor" },
        ].map(({ number, name }) => <Image
          key={number}
          className={styles.socialPostImage}
          src={`/soulmate/social-posts/astrorekha-brand-post-${number}.png`}
          width={1024}
          height={1536}
          sizes="(max-width: 650px) calc(100vw - 40px), 616px"
          alt={`${name}’s shared Astrorekha story, with a couple’s photo and soulmate sketch`}
        />)}
      </div>
    </section>
    <section className={styles.artistSection} aria-labelledby="artist-title"><Image src="/soulmate/astrorekha-artist.png" width={100} height={100} alt="Astro Rekha’s virtual sketch artist" /><div><span className={styles.eyebrow}>Meet your sketch artist</span><h2 id="artist-title">Astro Rekha</h2><p>I’m Astro Rekha, your guide through a personal soulmate sketch experience. I draw inspiration from the way you describe love — the warmth, trust, and sense of recognition you hope to find in another person. Your answers, preferred features, and zodiac symbolism help shape the portrait’s expression and character. The aim is a face that invites you to pause, imagine, and connect with the possibilities ahead — a personal keepsake of the love you’re curious about.</p></div></section>
    <section className={styles.workSection} aria-labelledby="delivery-title"><span className={styles.eyebrow}>What happens next</span><h2 id="delivery-title">From your answers to your sketch</h2><ol className={styles.process}><li><span className={styles.processIcon}><Palette size={23} aria-hidden="true" /></span><div><h3>Your preferences guide the portrait</h3><p>Your answers shape the inspiration and appearance of your sketch.</p></div></li><li><span className={styles.processIcon}><Clock3 size={23} aria-hidden="true" /></span><div><h3>Your sketch is created</h3><p>Choose a black-and-white Soulmate Sketch within 48 hours, or the Complete Soulmate Vision with a color sketch and written reading within 12 hours.</p></div></li><li><span className={styles.processIcon}><Mail size={23} aria-hidden="true" /></span><div><h3>Your sketch arrives by email</h3><p>Receive your personalized digital sketch in your inbox, ready to download and keep.</p></div></li></ol></section>
    <section className={styles.faq} aria-labelledby="faq-title"><h2 id="faq-title">A few things you might wonder</h2>{[
      ["How is my soulmate sketch created?", "Your chat answers, birth details, and preferences provide the inspiration for a personal portrait. Astro Rekha brings those details together with zodiac symbolism to create a soulmate sketch in a hand-drawn style."],
      ["What can I expect from Astro Rekha?", "You can explore examples of the sketch style above before deciding. Your order is for a personalized digital portrait, and you can contact us with questions about the process or your order."],
      ["What’s included in my order?", "Soulmate Sketch includes your personalized black-and-white portrait. Complete Soulmate Vision includes a color sketch, a full written soulmate reading and description, and express priority delivery."],
      ["How soon will I receive my sketch?", "Soulmate Sketch is delivered by email within 48 hours. Complete Soulmate Vision includes express priority delivery within 12 hours."],
      ["How are the two packages different?", "Soulmate Sketch is ₹999 and includes a black-and-white sketch within 48 hours. Complete Soulmate Vision is ₹1,499 and includes a color sketch, full written soulmate reading and description, and express priority delivery within 12 hours. The prices are excl. of GST."],
      ["Will I recognize my soulmate from the sketch?", "You may notice that your sketch resembles someone already in your life — a partner, someone you admire, or a person you feel drawn to. It might be a familiar smile, an expression, or another detail that brings that person to mind."],
    ].map(([question, answer]) => <details key={question} open={openFaq === question}><summary onClick={(event) => { event.preventDefault(); setOpenFaq((current) => current === question ? null : question); }}>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</section>
    <section className={styles.finalCta} aria-label="Choose your soulmate package">
      <div className={styles.finalCtaBanner}>Your complete soulmate portrait</div>
      <div className={styles.finalCtaBody}>
        <h2>Complete Soulmate Vision</h2>
        <p>Your soulmate sketch in color, a full written reading and description, and express priority delivery within 12 hours.</p>
        <p className={styles.finalCtaPrice}>₹1,499 <span>One-time payment</span></p>
        <button type="button" className={styles.primary} onClick={() => onSelect("express")}>Get my Complete Soulmate Vision — ₹1,499 <ArrowRight size={16} /></button>
        <button type="button" className={styles.standardLink} onClick={() => onSelect("standard")}>or Soulmate Sketch — ₹999</button>
        <p className={styles.gstDisclosure}>The prices are excl. of GST</p>
      </div>
    </section>

  </section>;
}

export function SoulmateExperience({ visitorLocation }: { visitorLocation: string | null }) {
  const [started, setStarted] = useState(false);
  const [opening, setOpening] = useState(false);
  const [offerReady, setOfferReady] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [revealed, setRevealed] = useState(0);
  const router = useRouter();
  const [reducedMotion, setReducedMotion] = useState(false);
  const chatScroll = useRef<HTMLDivElement>(null);
  const offerStart = useRef<HTMLDivElement>(null);
  const followsChat = useRef(true);
  const submitting = useRef(false);
  const messages = useMemo(() => conversation(answers, visitorLocation), [answers, visitorLocation]);
  const step = steps.find((key) => !answers[key]);
  const typing = revealed < messages.length;
  const finished = !step && !typing && offerReady;

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    // Restore an explicit checkout return, while ordinary landing reloads start fresh.
    const checkoutReturn = new URLSearchParams(window.location.search).get("checkout");
    if (checkoutReturn === "retry" || checkoutReturn === "back") {
      try {
        if (checkoutReturn === "retry") sessionStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
        const saved = readCheckoutDetails() || JSON.parse(sessionStorage.getItem(CHECKOUT_RECOVERY_KEY) || "null");
        const restored = sanitizeAnswers(saved?.answers);
        if (saved?.savedAt > Date.now() - 24 * 3600000 && steps.every((key) => restored[key])) {
          setAnswers(restored);
          setRevealed(conversation(restored, visitorLocation).length);
          setStarted(true);
          setOfferReady(true);
        }
      } catch { /* A missing recovery record returns to the landing page. */ }
      window.history.replaceState(null, "", "/soulmate");
    }
    // Discard old persisted sessions. A reload always starts at the landing page.
    try { sessionStorage.removeItem("astrorekha-soulmate-chat-v1"); } catch { /* Storage may be unavailable. */ }
  }, [visitorLocation]);

  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => setOpening(false), reducedMotion ? 0 : 1200);
    return () => window.clearTimeout(timer);
  }, [opening, reducedMotion]);

  useEffect(() => {
    if (!started || opening) return;
    if (revealed >= messages.length) { submitting.current = false; return; }
    const next = messages[revealed];
    const previous = messages[revealed - 1];
    const delay = Math.max(messageDelay(next), previous?.zodiac && !reducedMotion ? 2600 : 0);
    const timer = window.setTimeout(() => setRevealed((count) => count + 1), delay);
    return () => window.clearTimeout(timer);
  }, [messages, revealed, started, opening, reducedMotion]);

  useEffect(() => {
    if (!started || opening || step || typing) return;
    // Leave the final message on screen before revealing and scrolling to the offer.
    const timer = window.setTimeout(() => setOfferReady(true), 5000);
    return () => window.clearTimeout(timer);
  }, [started, opening, step, typing]);

  useEffect(() => {
    // Follow new messages while reading the bottom; never drag someone away from older messages.
    const container = chatScroll.current;
    if (started && !opening && !finished && followsChat.current && container) container.scrollTo({ top: container.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  }, [revealed, started, opening, reducedMotion, finished]);

  useEffect(() => {
    if (finished && started && !opening) trackSoulmate("offer_view", { once: "offer" });
    if (finished && started && !opening) offerStart.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }, [finished, started, opening, reducedMotion]);

  useEffect(() => {
    if (!started || !answers.name) return;
    void saveDraft(answers);
    const timer = window.setInterval(() => { void flushDraft(); }, 10000);
    const flush = () => { void flushDraft(); };
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    return () => { clearInterval(timer); window.removeEventListener("online", flush); window.removeEventListener("pagehide", flush); };
  }, [answers, started]);

  function start() {
    trackSoulmate("chat_start", { once: "chat" });
    startSoulmateSession();
    clearCheckoutDetails();
    setOfferReady(false);
    setAnswers({});
    setRevealed(0);
    submitting.current = false;
    setStarted(true);
    setOpening(true);
    followsChat.current = true;
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  function answer(value: string) {
    if (!step || typing || submitting.current || validateAnswer(step, value)) return;
    submitting.current = true;
    followsChat.current = true;
    if (steps.every((key) => key === step || answers[key])) trackSoulmate("chat_complete", { once: "complete" });
    setAnswers((current) => ({ ...current, [step]: value.trim() }));
    setRevealed(messages.length + 1); // Show the visitor's answer immediately, then reveal the reply.
  }


  function selectPlan(planId: DeliveryId) {
    prepareCheckout(answers, planId);
    router.push(`/soulmate/checkout?plan=${planId}`);
  }

  if (!started) return <SoulmateLanding visitorLocation={visitorLocation} onStart={start} />;

  return <div className={`${styles.page} ${!finished && !opening ? styles.chatPage : styles.offerPage}`}>
    {opening ? <main className={styles.opening} role="status"><div className={styles.openingPortrait}><Image src="/soulmate/astrorekha-artist.png" width={112} height={112} alt="Astro Rekha" /></div><h1>Astro Rekha</h1><p>Opening your personal sketch session…</p><div className={styles.typing} aria-hidden="true"><i /><i /><i /></div></main> : <>
      <header className={styles.header}><div className={styles.headerInner}><button type="button" className={styles.back} aria-label="Back to landing page" onClick={() => { setStarted(false); window.scrollTo(0, 0); }}><ArrowLeft size={20} /></button><div className={styles.avatar}><Image src="/soulmate/astrorekha-artist.png" width={46} height={46} alt="" /><span /></div><div className={styles.headerName}><strong>Astro Rekha</strong><span>Soulmate sketch artist</span></div><span className={styles.online}>Online</span></div></header>
      <main className={`${styles.main} ${!finished ? styles.chatMain : ""}`}>
        <div ref={chatScroll} className={styles.chatMessages} onScroll={(event) => { const container = event.currentTarget; followsChat.current = container.scrollHeight - container.scrollTop - container.clientHeight < 180; }}>
        <div className={styles.transcript} role="log" aria-label="Your conversation with Astro Rekha" aria-live="polite" aria-relevant="additions">
          {messages.slice(0, revealed).map((message) => <div key={message.id} className={`${styles.message} ${message.role === "visitor" ? styles.visitor : styles.artist}`}>
            {message.zodiac && answers.birthDate ? <ZodiacCard birthDate={answers.birthDate} reducedMotion={reducedMotion} /> : <p>{message.text}</p>}
          </div>)}
        </div>
        {typing && <div className={`${styles.message} ${styles.artist} ${styles.typingMessage}`} role="status" aria-label="Astro Rekha is typing"><div className={styles.typing} aria-hidden="true"><i /><i /><i /></div></div>}
        <div className={styles.chatEnd} />
        </div>
        {!finished && <div className={styles.answerDock}>
          {!typing && step ? <AnswerInput key={step} step={step} selectedPreference={answers.preferenceSelection} onAnswer={answer} /> : <div className={styles.composer}><input disabled aria-label="Reply" placeholder={typing ? "" : "Your sketch options are coming up…"} /><button type="button" disabled aria-label="Send answer"><Send size={18} /></button></div>}
        </div>}
        {finished && <div ref={offerStart} className={styles.offerStart}><SketchOffer onSelect={selectPlan} /></div>}
      </main>
      <footer className={styles.footer}><nav aria-label="Legal and contact"><a href="/Terms/privacy-policy.html">Privacy</a><a href="/Terms/terms-of-service.html">Terms</a><a href="/Terms/money-back-policy.html">Refunds</a><a href="/Terms/contact-us.html">Contact</a></nav><p>For entertainment and self-reflection. Results and experiences vary.</p><p>© {new Date().getFullYear()} Astro Rekha. All rights reserved.</p></footer>
    </>}
  </div>;
}
