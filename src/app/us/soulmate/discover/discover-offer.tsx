"use client";
import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Clock3, LockKeyhole, Sparkles, Palette, Mail } from "lucide-react";
import { SoulmateImage as Image } from "../soulmate-image";
import { deliveryPlans, type DeliveryId } from "../chat-data";
import { discoverMoney, discoverTotal } from "@/components/soulmate-discover/pricing";
import styles from "../soulmate-chat.module.css";
const formatRupees = (value: number) => discoverMoney(discoverTotal(value, "us"), "us");
const portraits = [1, 2, 3, 4];
const stories = portraits.map(number => ({ file: `/soulmate/sketches/astrorekha-${number}.png`, width: 600, height: 600 }));
// Original offer structure and controls; only the audit-related content is revised.
function PlanCards({ onSelect }: { onSelect: (plan: DeliveryId) => void }) {
  return <div className={styles.plans}>
    {deliveryPlans.map((plan) => <article key={plan.id} className={`${styles.plan} ${plan.id === "express" ? styles.express : ""}`}>
      {plan.id === "express" && <span className={styles.slotBadge}>Complete package</span>}
      <p className={styles.eyebrow}>{plan.label}</p>
      <h3>{plan.name}</h3>
      <p className={styles.price}>{formatRupees(plan.price)}</p>
      <ul>{plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
      <button type="button" className={plan.id === "express" ? styles.primary : styles.secondary} onClick={() => onSelect(plan.id)}>{plan.cta} <ArrowRight size={16} /></button>
      <p className={styles.taxNote}>One-time payment · Tax included</p>

    </article>)}
  </div>;
}

export function SketchOffer({ onSelect }: { onSelect: (plan: DeliveryId) => void }) {
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  return <section className={styles.offer} aria-label="Your soulmate sketch packages">
    <div className={styles.sessionTimer}><Clock3 size={14} aria-hidden="true" />Choose your package · Review the full price before payment</div>
    <PlanCards onSelect={onSelect} />
    <p className={styles.sameSketch}><LockKeyhole size={14} /> Secure checkout · Personalized AI artwork</p>
    <section className={styles.workSection} aria-labelledby="recent-title"><span className={styles.eyebrow}>From the studio</span><h2 id="recent-title">Illustrative soulmate sketches</h2><div className={styles.portraits} role="region" aria-label="Illustrative soulmate sketches">{portraits.map((number) => <Image key={number} src={`/soulmate/sketches/astrorekha-${number}.png`} width={1254} height={1254} sizes="(max-width: 650px) calc((100vw - 47px) / 2), 300px" alt={`Astro Rekha soulmate sketch example ${number}`} />)}</div></section>
    <section className={styles.workSection} aria-labelledby="stories-title"><span className={styles.eyebrow}>Details in the artwork</span><h2 id="stories-title">Personalized portrait examples</h2><p>Illustrative AI artwork, not customer results or predictions of a real person.</p><div className={styles.storyGallery} role="region" aria-label="Soulmate sketch stories">{stories.map(({ file, width, height }, index) => <Image key={file} src={file} width={width} height={height} sizes="(max-width: 650px) calc(100vw - 40px), 616px" alt={`Illustrative AI portrait example ${index + 1}`} />)}</div></section>
    <section className={styles.storyCta} aria-label="Choose your soulmate package">
      <p>Your sketch begins with the details you’ve shared. Choose your package, and take the next step when you’re ready.</p>
      <button type="button" className={styles.primary} onClick={() => onSelect("express")}>Complete Soulmate Vision — {formatRupees(deliveryPlans[1].price)} <ArrowRight size={16} /></button>
      <button type="button" className={styles.standardLink} onClick={() => onSelect("standard")}>or Soulmate Sketch — {formatRupees(deliveryPlans[0].price)}</button>

    </section>
    <section className={styles.reviewSection} aria-labelledby="reviews-title">
      <h2 id="reviews-title">Before you choose a package</h2>
      {[
        { name: "Personalized artwork", location: "AI-generated", image: 1, quote: "Your preferences inspire a digital portrait. It is an imaginative keepsake, not an identification of your actual future partner." },
        { name: "Delivery and support", location: "Digital order", image: 2, quote: "Review the package delivery window before payment. Your sketch is delivered by email; contact team.astrorekha@gmail.com for order or refund questions." },
      ].map((review) => <article className={styles.reviewCard} key={review.name}>
        <header className={styles.reviewHeader}>
          <Image className={styles.reviewAvatar} src={`/soulmate/sketches/astrorekha-${review.image}.png`} width={49} height={49} sizes="49px" alt={`Illustrative AI portrait`} />
          <div><div className={styles.reviewStars} aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <Sparkles key={index} size={14} fill="currentColor" aria-hidden="true" />)}</div>
          <p><strong>{review.name}</strong><span> · {review.location}</span></p>
          <span className={styles.reviewBadge}>Package information</span></div>
        </header>
        <blockquote>{review.quote}</blockquote>
      </article>)}
    </section>
    <section className={styles.socialSection} aria-labelledby="social-posts-title">
      <h2 id="social-posts-title">More examples of the artwork</h2>
      <p>Illustrative AI-generated sketches. They do not show customer relationship outcomes.</p>
      <div className={styles.socialPosts}>
        {[
          { number: 1, name: "Portrait style" },
          { number: 3, name: "Facial details" },
          { number: 2, name: "Expression" },
          { number: 4, name: "Shading" },
        ].map(({ number, name }) => <Image
          key={number}
          className={styles.socialPostImage}
          src={`/soulmate/sketches/astrorekha-${number}.png`}
          width={1024}
          height={1536}
          sizes="(max-width: 650px) calc(100vw - 40px), 616px"
          alt={`Illustrative AI sketch example ${number}: ${name}`}
        />)}
      </div>
    </section>
    <section className={styles.artistSection} aria-labelledby="artist-title"><Image src="/soulmate/astrorekha-artist.png" width={100} height={100} alt="Astro Rekha’s virtual sketch artist" /><div><span className={styles.eyebrow}>Meet your AI guide</span><h2 id="artist-title">Astro Rekha</h2><p>Astro Rekha is an automated AI guide. Your preferences and birth details inspire an AI-generated portrait in a hand-drawn style. Written readings, where included, explore symbolic themes for personal reflection. The artwork does not identify an actual future partner or guarantee a relationship.</p></div></section>
    <section className={styles.workSection} aria-labelledby="delivery-title"><span className={styles.eyebrow}>What happens next</span><h2 id="delivery-title">From your answers to your sketch</h2><ol className={styles.process}><li><span className={styles.processIcon}><Palette size={23} aria-hidden="true" /></span><div><h3>Your preferences guide the portrait</h3><p>Your answers shape the inspiration and appearance of your sketch.</p></div></li><li><span className={styles.processIcon}><Clock3 size={23} aria-hidden="true" /></span><div><h3>Your sketch is created</h3><p>Choose a black-and-white Soulmate Sketch within 48 hours, or the Complete Soulmate Vision with a color sketch and written reading within 12 hours.</p></div></li><li><span className={styles.processIcon}><Mail size={23} aria-hidden="true" /></span><div><h3>Your sketch arrives by email</h3><p>Receive your personalized digital sketch in your inbox, ready to download and keep.</p></div></li></ol></section>
    <section className={styles.faq} aria-labelledby="faq-title"><h2 id="faq-title">A few things you might wonder</h2>{[
      ["How is my soulmate sketch created?", "Your chat answers, birth details, and preferences provide the inspiration for a personal portrait. AI combines these details with symbolic astrology themes to generate a digital sketch in a hand-drawn style."],
      ["What can I expect from Astro Rekha?", "You can explore examples of the sketch style above before deciding. Your order is for a personalized digital portrait, and you can contact us with questions about the process or your order."],
      ["What’s included in my order?", "Soulmate Sketch includes your personalized black-and-white portrait. Complete Soulmate Vision includes a color sketch, a full written soulmate reading and description, and express priority delivery."],
      ["How soon will I receive my sketch?", "Soulmate Sketch is delivered by email within 48 hours. Complete Soulmate Vision includes express priority delivery within 12 hours."],
      ["How are the two packages different?", `Soulmate Sketch is ${formatRupees(deliveryPlans[0].price)} and includes a black-and-white sketch within 48 hours. Complete Soulmate Vision is ${formatRupees(deliveryPlans[1].price)} and includes a color sketch, written reading and description, and delivery within 12 hours. Prices include tax.`],
      ["Will I recognize my soulmate from the sketch?", "The sketch is imaginative AI artwork. It cannot identify your real future partner, predict a meeting or guarantee a relationship. Any resemblance is not proof of a prediction."],
    ].map(([question, answer]) => <details key={question} open={openFaq === question}><summary onClick={(event) => { event.preventDefault(); setOpenFaq((current) => current === question ? null : question); }}>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</section>
    <section className={styles.finalCta} aria-label="Choose your soulmate package">
      <div className={styles.finalCtaBanner}>Your complete soulmate portrait</div>
      <div className={styles.finalCtaBody}>
        <h2>Complete Soulmate Vision</h2>
        <p>Your soulmate sketch in color, a full written reading and description, and express priority delivery within 12 hours.</p>
        <p className={styles.finalCtaPrice}>{formatRupees(deliveryPlans[1].price)} <span>One-time payment</span></p>
        <button type="button" className={styles.primary} onClick={() => onSelect("express")}>Get my Complete Soulmate Vision — {formatRupees(deliveryPlans[1].price)} <ArrowRight size={16} /></button>
        <button type="button" className={styles.standardLink} onClick={() => onSelect("standard")}>or Soulmate Sketch — {formatRupees(deliveryPlans[0].price)}</button>

      </div>
    </section>

  </section>;
}
