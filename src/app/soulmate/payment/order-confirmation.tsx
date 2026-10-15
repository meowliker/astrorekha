import { Check } from "lucide-react";
import styles from "./order-confirmation.module.css";

export function SoulmateOrderConfirmation({ orderId }: { orderId?: string }) {
  return (
    <div className={styles.page}>
      <header className={styles.brand}>ASTROREKHA</header>
      <main className={styles.main}>
        <div className={styles.check} aria-hidden="true"><Check size={32} strokeWidth={1.6} /></div>
        <p className={styles.eyebrow}>THANK YOU FOR YOUR ORDER</p>
        <h1>Your order is confirmed.</h1>
        <p className={styles.message}>
          You’ll receive a confirmation email with your order summary and invoice shortly.
        </p>
        <p className={styles.note}>Please check your inbox and spam folder.</p>
        {orderId && <p className={styles.reference}>Order reference: <span>{orderId}</span></p>}
        <div className={styles.support}>
          <p>Have a question about your order?</p>
          <a href="mailto:team.astrorekha@gmail.com">team.astrorekha@gmail.com</a>
        </div>
      </main>
      <footer className={styles.footer}>With warmth, Team AstroRekha</footer>
    </div>
  );
}
