"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { INR_COUPON_INTENT_KEY, type InrCouponIntent } from "@/lib/inr-coupon-client";
import { useUserStore } from "@/lib/user-store";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { saveUserProfile } from "@/lib/user-profile";

type Account = { id: string; email: string };
type Offer = { name: string; originalAmount: number; coins: number };
export default function CouponCheckout() {
  const [intent, setIntent] = useState<InrCouponIntent | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = sessionStorage.getItem(INR_COUPON_INTENT_KEY);
        if (!saved) throw new Error("Choose a bundle or report and apply your coupon first.");
        const selected = JSON.parse(saved) as InrCouponIntent;
        const [quoteResponse, accountResponse] = await Promise.all([
          fetch("/api/coupons/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selected) }),
          fetch("/api/coupons/redeem", { cache: "no-store" }),
        ]);
        const quote = await quoteResponse.json(), session = await accountResponse.json();
        if (!quoteResponse.ok) throw new Error(quote.error || "Could not check your coupon.");
        if (!accountResponse.ok) throw new Error(session.error || "Could not load your account.");
        if (cancelled) return;
        setIntent(selected); setOffer(quote); setAccount(session.account);
        setEmail(localStorage.getItem("astrorekha_checkout_email") || localStorage.getItem("astrorekha_email") || "");
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Please try again."); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function unlock() {
    if (!intent || !offer || busy) return;
    setBusy(true); setError("");
    try {
      let customer = account;
      if (!customer) {
        if (!accepted) throw new Error("Please accept the Terms of Service and Privacy Policy.");
        if (password !== confirm) throw new Error("The passwords do not match.");
        // Do not trust a browser-provided anonymous ID to migrate someone else's access.
        const registration = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
        const result = await registration.json();
        if (!registration.ok) throw new Error(result.message || "Unable to create an account. If you already have one, sign in below.");
        customer = result.user as Account;
        setAccount(customer);
        // Save the existing onboarding answers/photo for the newly created account only.
        if (intent.type === "bundle") {
          await saveUserProfile({ ...useOnboardingStore.getState(), userId: customer.id, email: customer.email,
            palmImage: localStorage.getItem("astrorekha_palm_image"), createdAt: new Date().toISOString() });
        }
      }
      const response = await fetch("/api/coupons/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intent) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to unlock. Please try again.");
      // Use only the identity and entitlements returned by the authenticated server.
      localStorage.setItem("astrorekha_user_id", result.userId);
      localStorage.setItem("astrorekha_email", result.email);
      localStorage.setItem("astrorekha_checkout_email", result.email);
      localStorage.setItem("astrorekha_registration_completed", "true");
      useUserStore.getState().setUserId(result.userId);
      useUserStore.getState().syncFromServer({ unlockedFeatures: result.unlockedFeatures, coins: result.coins });
      sessionStorage.removeItem(INR_COUPON_INTENT_KEY);
      setFinished(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-[100dvh] bg-background px-5 py-10 text-white">
    <div className="mx-auto max-w-md space-y-6 rounded-3xl border border-white/10 bg-card p-6 sm:p-8">
      <Link href="/" className="text-sm text-white/60">AstroRekha</Link>
      <h1 className="text-2xl font-semibold">{finished ? "Your reports are unlocked" : "Complete your free unlock"}</h1>
      {offer && <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="font-medium">{offer.name}</h2>
        <p className="text-sm text-white/50 line-through">₹{(offer.originalAmount / 100).toFixed(2)}</p>
        <p className="text-3xl font-semibold text-emerald-400">₹0.00</p>
        <p className="text-sm text-white/70">Coupon applied · No payment required</p>
        {offer.coins > 0 && <p className="text-sm text-white/70">Includes {offer.coins} coins. Each bundle&apos;s coupon bonus can be claimed once per account.</p>}
      </div>}
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {finished ? <>
        <p className="text-sm text-white/70">Your access is saved to {account?.email}. Open your reports to view or generate them.</p>
        <a href="/reports" className="block rounded-xl bg-primary px-4 py-4 text-center font-semibold">View my reports</a>
      </> : offer && <form onSubmit={e => { e.preventDefault(); void unlock(); }} className="space-y-4">
        {account ? <>
          <p className="text-sm text-white/70">Unlock for <strong className="text-white">{account.email}</strong></p>
          <Link href="/login?next=/coupon-checkout" className="block text-sm text-white/60 underline">Sign in to a different account</Link>
        </> : <>
          <p className="text-sm text-white/70">Create an account to save your reports, or <Link className="underline text-white" href="/login?next=/coupon-checkout">sign in to your existing account</Link>.</p>
          <label className="block text-sm">Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 p-3" /></label>
          <label className="block text-sm">Password<input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 p-3" /></label>
          <p className="text-xs text-white/50">Use at least 8 characters, including uppercase, lowercase, a number and a symbol.</p>
          <label className="block text-sm">Confirm password<input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 p-3" /></label>
          <label className="flex gap-3 text-xs leading-relaxed text-white/70"><input type="checkbox" required checked={accepted} onChange={e => setAccepted(e.target.checked)} />
            <span>I agree to the <Link href="/Terms/terms-of-service.html" target="_blank" className="underline">Terms of Service</Link> and <Link href="/Terms/privacy-policy.html" target="_blank" className="underline">Privacy Policy</Link>.</span></label>
        </>}
        <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-4 font-semibold disabled:opacity-50">{busy ? "Unlocking…" : "Unlock for ₹0"}</button>
      </form>}
    </div>
  </main>;
}
