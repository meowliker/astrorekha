import { AlertCircle, Clock3, X } from "lucide-react";
import Link from "next/link";
import styles from "./order-confirmation.module.css";

type Props = { kind: "failed" | "unverified" | "pending"; orderId?: string; checking?: boolean; onRetry?: () => void };
export function SoulmatePaymentProblem({ kind, orderId, checking = false, onRetry }: Props) {
  const failed = kind === "failed", pending = kind === "pending";
  const Icon = failed ? X : pending ? Clock3 : AlertCircle;
  return <div className={styles.page}>
    <header className={styles.brand}>ASTROREKHA</header>
    <main className={styles.main}>
      <div className={`${styles.check} ${failed ? styles.failed : styles.pending}`} aria-hidden="true"><Icon size={32} strokeWidth={1.6} /></div>
      <p className={styles.eyebrow}>PAYMENT UPDATE</p>
      <h1>{failed ? "Payment failed." : pending ? "Confirming your payment." : "We couldn’t confirm your payment."}</h1>
      <p className={styles.message}>{failed ? "Your payment wasn’t completed. If money has been deducted, please contact us before trying again." : pending ? "We’re checking your payment securely with PayU. Please wait before making another payment." : "If money has been deducted, please contact us. Please don’t pay again until we’ve checked your order."}</p>
      {orderId && <p className={styles.reference}>Order reference: <span>{orderId}</span></p>}
      {onRetry && <button className={styles.action} disabled={checking} onClick={onRetry}>{checking ? "Checking payment…" : "Check payment status"}</button>}
      {failed && <Link className={styles.backLink} href="/soulmate?checkout=retry">Return to checkout</Link>}
      <div className={styles.support}>
        <p>{orderId ? "For help, email us with your order reference." : "For help, email us with your payment details."}</p>
        <a href="mailto:team.astrorekha@gmail.com">team.astrorekha@gmail.com</a>
      </div>
    </main>
    <footer className={styles.footer}>We’re here to help. Team AstroRekha</footer>
  </div>;
}
