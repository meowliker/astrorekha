"use client";
import Image from "next/image";
import { ArrowDown, ArrowRight, Download, ShieldCheck, Sparkles } from "lucide-react";
import { useSoulmateDiscover, discoverAsset } from "./Experience";
import { discoverMoney, discoverTotal } from "./pricing";
import { SoulmateLanding as IndiaLanding } from "@/app/soulmate/discover/discover-landing";
import { SoulmateLanding as UsLanding } from "@/app/us/soulmate/discover/discover-landing";
import { SketchOffer as IndiaOffer } from "@/app/soulmate/discover/discover-offer";
import { SketchOffer as UsOffer } from "@/app/us/soulmate/discover/discover-offer";
import indiaCheckout from "@/app/soulmate/soulmate-checkout.module.css";
import usCheckout from "@/app/us/soulmate/soulmate-checkout.module.css";
import indiaChat from "@/app/soulmate/soulmate-chat.module.css";
import usChat from "@/app/us/soulmate/soulmate-chat.module.css";

type PlanId = "standard" | "express";
type AddOnId = "description" | "colour" | "priority" | "timeline";
type AddOn = { id: AddOnId; title: string; price: number | null };

export function DiscoverSoulmateLanding({ onStart }: { onStart: () => void }) {
  return useSoulmateDiscover() === "us" ? <UsLanding onStart={onStart} /> : <IndiaLanding onStart={onStart} />;
}
export function DiscoverSoulmateOffer({ onSelect }: { onSelect: (id: PlanId) => void }) {
  return useSoulmateDiscover() === "us" ? <UsOffer onSelect={onSelect} /> : <IndiaOffer onSelect={onSelect} />;
}
export function DiscoverZodiacCard({ name }: { name: string }) {
  const styles = useSoulmateDiscover() === "us" ? usChat : indiaChat;
  return <div className={styles.zodiac}>
    <Sparkles size={22} aria-hidden="true" />
    <h2>{name}</h2>
    <p className={styles.eyebrow}>Your birth-date zodiac sign</p>
    <div className={styles.resonanceTrack} role="progressbar" aria-label="Birth date provided" aria-valuemin={0} aria-valuemax={1} aria-valuenow={1}><span style={{ width: "100%" }} /></div>
    <p className={styles.resonanceValue}>✓</p>
    <p className={styles.resonanceLabel}>Birth date provided</p>
    <p>Symbolic inspiration for your portrait</p>
  </div>;
}

const addOnNames: Record<AddOnId, string> = { description: "Written soulmate reflection", colour: "Color sketch upgrade", priority: "Delivery within 12 hours", timeline: "Relationship reflection timeline" };
export const discoverAddOnName = (id: AddOnId) => addOnNames[id];
const artwork = {
  description: { file: "astrorekha-soulmate-description.png", width: 1254, height: 1254 },
  colour: { file: "astrorekha-sketch-colour-comparison.png", width: 1536, height: 1024 },
  priority: { file: "astrorekha-fast-delivery.png", width: 1254, height: 1254 },
};
export function DiscoverCheckoutExtras({ catalog, selected, onChange, disabled }: { catalog: readonly AddOn[]; selected: AddOnId[]; onChange: (ids: AddOnId[]) => void; disabled: boolean }) {
  const region = useSoulmateDiscover()!;
  const styles = region === "us" ? usCheckout : indiaCheckout;
  return <section className={styles.recommended} aria-labelledby="recommended-title">
    <h2 id="recommended-title">Recommended for You</h2>
    <div className={styles.addOnList}>
      {catalog.map((item) => {
        const checked = selected.includes(item.id);
        const amount = item.price === null ? "To be confirmed" : discoverMoney(discoverTotal(item.price, region), region);
        return <label key={item.id} className={`${styles.addOnCard} ${item.id === "timeline" ? styles.timelineCard : ""} ${checked ? styles.addOnSelected : ""}`}>
          {item.id === "timeline" ? <span className={styles.digitalProduct}><Download size={13} aria-hidden="true" /> Digital Product</span> : <span className={styles.addOnOverview}>
            <span className={styles.addOnArtwork}><Image src={discoverAsset(region, `/soulmate/checkout/${artwork[item.id].file}`)} width={artwork[item.id].width} height={artwork[item.id].height} alt="" className={styles.addOnThumbnail} unoptimized /></span>
            <span className={styles.addOnDescription}><strong>{addOnNames[item.id]}</strong><b className={styles.addOnPrice}>{amount}</b><small><Download size={13} aria-hidden="true" />Digital Product</small></span>
          </span>}
          <span className={styles.addOnChoice}>
            <ArrowRight size={22} strokeWidth={3} aria-hidden="true" />
            <input type="checkbox" name="extras" value={item.id} checked={checked} disabled={disabled || item.price === null} onChange={() => onChange(checked ? selected.filter((id) => id !== item.id) : [...selected, item.id])} />
            {item.id === "description" ? <span>Include <strong>{addOnNames[item.id]}</strong> to my purchase for {amount}.</span>
              : item.id === "timeline" ? <span>Add <strong>{addOnNames[item.id]}</strong> for {amount}.</span>
                : <span>Yes! I&apos;d like to add <strong>{addOnNames[item.id]}</strong> to my order for {amount}</span>}
          </span>
        </label>;
      })}
    </div>
    <p className={styles.smallPrint}>Optional extras. Prices include tax; your order summary shows the final total. Written content explores symbolic themes and does not predict when or where you will meet a partner.</p>
  </section>;
}

export function DiscoverCheckoutStory() {
  const region = useSoulmateDiscover()!;
  const styles = region === "us" ? usCheckout : indiaCheckout;
  return <div className={styles.story}>
    <ArrowDown className={styles.storyArrow} size={50} strokeWidth={3.5} aria-hidden="true" />
    <Image className={styles.customerStoryImage} src={discoverAsset(region, "/soulmate/sketches/astrorekha-1.png")} width={600} height={600} alt="Illustrative AI sketch example, not a customer result" unoptimized />
    <p>Illustrative AI sketch example. Your portrait is personalized after payment confirmation.</p>
    <ArrowDown className={styles.storyArrow} size={50} strokeWidth={3.5} aria-hidden="true" />
  </div>;
}
export function DiscoverCheckoutTrust() {
  const region = useSoulmateDiscover()!;
  const styles = region === "us" ? usCheckout : indiaCheckout;
  return <section className={styles.checkoutReviews} aria-label="Payment and report information">
    <div className={styles.checkoutTrust}><ShieldCheck size={27} aria-hidden="true" /><span><strong>{region === "us" ? "Secure payment with Stripe" : "Secure payment"}</strong><small>{region === "us" ? "Your payment details are entered securely on Stripe." : "Your payment details are entered in the secure gateway checkout."}</small></span></div>
    <div className={styles.reviewImageFrame}><p className="p-4 text-center text-sm leading-relaxed text-slate-600">Your order is for personalized AI-generated digital artwork. Delivery is by email within the package’s stated window. The sketch does not identify a real future partner or guarantee a relationship.</p></div>
  </section>;
}
