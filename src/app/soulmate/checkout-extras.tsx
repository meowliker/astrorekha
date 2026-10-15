import Image from "next/image";
import { ArrowDown, ArrowRight, Download, ShieldCheck } from "lucide-react";
import { soulmateAssetUrl } from "@/lib/assets";
import { addOnsForPlan, type AddOnId } from "./checkout-addons";
import { formatRupees, type DeliveryId } from "./chat-data";
import styles from "./soulmate-checkout.module.css";

const artwork = {
  description: { file: "astrorekha-soulmate-description.png", width: 1254, height: 1254 },
  colour: { file: "astrorekha-sketch-colour-comparison.png", width: 1536, height: 1024 },
  priority: { file: "astrorekha-fast-delivery.png", width: 1254, height: 1254 },
};
// Version the uploaded checkout images to avoid stale edge responses.
function checkoutImageUrl(filename: string) {
  return `${soulmateAssetUrl(`/soulmate/checkout/${filename}`)}?v=20261015`;
}

export function CheckoutExtras({ planId, selected, onChange, disabled }: { planId: DeliveryId; selected: AddOnId[]; onChange: (value: AddOnId[]) => void; disabled: boolean }) {
  return <section className={styles.recommended} aria-labelledby="recommended-title">
    <h2 id="recommended-title">Recommended for You</h2>
    <div className={styles.addOnList}>
      {addOnsForPlan(planId).map((item) => {
        const checked = selected.includes(item.id);
        const amount = item.price === null ? "To be confirmed" : formatRupees(item.price);
        return <label key={item.id} className={`${styles.addOnCard} ${item.id === "timeline" ? styles.timelineCard : ""} ${checked ? styles.addOnSelected : ""}`}>
          {item.id === "timeline" ? <span className={styles.digitalProduct}><Download size={13} aria-hidden="true" /> Digital Product</span> : <span className={styles.addOnOverview}>
            <span className={styles.addOnArtwork}><Image src={checkoutImageUrl(artwork[item.id].file)} width={artwork[item.id].width} height={artwork[item.id].height} alt="" className={styles.addOnThumbnail} unoptimized /></span>
            <span className={styles.addOnDescription}><strong>{item.title}</strong><b className={styles.addOnPrice}>{amount}</b><small><Download size={13} aria-hidden="true" />Digital Product</small></span>
          </span>}
          <span className={styles.addOnChoice}>
            <ArrowRight size={22} strokeWidth={3} aria-hidden="true" />
            <input type="checkbox" name="extras" value={item.id} checked={checked} disabled={disabled} onChange={() => onChange(checked ? selected.filter((id) => id !== item.id) : [...selected, item.id])} />
            {item.id === "description" ? <span>Include <strong>{item.title}</strong> to my purchase for only {amount} right now!</span>
              : item.id === "timeline" ? <span>Select this option or you WILL NOT receive <strong>{item.title}</strong> for only {amount}!</span>
                : <span>Yes! I&apos;d like to add <strong>{item.title}</strong> to my order for {amount}</span>}
          </span>
        </label>;
      })}
    </div>
    <p className={styles.smallPrint}>The prices are excl. of GST.</p>
  </section>;
}

export function CheckoutStory() {
  return <div className={styles.story}>
    <ArrowDown className={styles.storyArrow} size={50} strokeWidth={3.5} aria-hidden="true" />
    <Image className={styles.customerStoryImage} src={checkoutImageUrl("customer-story-kavita.png")} width={1254} height={1254} alt="Kavita Sharma shares her Astrorekha sketch story beside a photo of a couple holding the sketch." unoptimized />
    <ArrowDown className={styles.storyArrow} size={50} strokeWidth={3.5} aria-hidden="true" />
  </div>;
}

export function CheckoutReviews() {
  return <section className={styles.checkoutReviews} aria-label="Customer reviews">
    <div className={styles.checkoutTrust}><ShieldCheck size={27} aria-hidden="true" /><span><strong>Secure payment with PayU</strong><small>Your payment details are entered securely on PayU.</small></span></div>
    <div className={styles.reviewImageFrame}><Image className={styles.customerReviewsImage} src={checkoutImageUrl("customer-reviews.png")} width={1360} height={540} alt="Reviews: 4.5 stars, 25,287 total. 5-star: 85%; 4-star: 6%; 3-star: 2%; 2-star: 1%; 1-star: 6%." unoptimized /></div>
  </section>;
}
