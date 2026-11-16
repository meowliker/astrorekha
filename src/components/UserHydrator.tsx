"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useUserStore, type PurchasedBundle } from "@/lib/user-store";
import { resolveStoredUserSession } from "@/lib/session-recovery";
import { isCustomerAccountPath } from "@/lib/customer-account-path";
import { customerLoginPath } from "@/lib/customer-login-path";

/** Mount report screens only after the server has restored this browser's paid account. */
export default function UserHydrator({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if(!isCustomerAccountPath(pathname)) return <>{children}</>;
  return <CustomerAccountGate pathname={pathname}>{children}</CustomerAccountGate>;
}
function CustomerAccountGate({children, pathname}: {children:ReactNode;pathname:string}) {
  const [state, setState] = useState<"loading" | "ready" | "signed_out" | "error">("loading");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loginPath, setLoginPath] = useState("/login?next=/reports");
  const busy = useRef(false);
  const generation = useRef(0);

  const hydrate = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const attempt = generation.current;
    try {
      const user = await resolveStoredUserSession(true);
      if (attempt !== generation.current) return;
      if (!user) {
        useUserStore.getState().resetUserState();
        setAccountId(null);
        setState("signed_out");
        return;
      }
      const store = useUserStore.getState();
      if (store.userId !== user.id) store.resetUserState();
      store.setUserId(user.id);
      store.syncFromServer({ unlockedFeatures: user.unlocked_features, coins: user.coins,
        purchasedBundle: (user.bundle_purchased || null) as PurchasedBundle,
        palmReading:user.palm_reading,birthChart:user.birth_chart,compatibilityTest:user.compatibility_test,
        prediction2026:user.prediction_2026,soulmateSketch:user.soulmate_sketch,futurePartnerReport:user.future_partner_report,
        vastuShastraGuide:user.vastu_shastra_guide,auraColorReport:user.aura_color_report,pastLifeReport:user.past_life_report,
        numerologyReport:user.numerology_report,spiritAnimalReport:user.spirit_animal_report });
      if (user.is_dev_tester === true) store.unlockAllFeatures();
      setAccountId(user.id);
      setMessage("");
      setState("ready");
    } catch {
      if (attempt !== generation.current) return;
      setMessage("We couldn’t load your account. Please retry. Your purchases and saved reports have not changed.");
      // A temporary outage must not log out a verified customer or discard their answers.
      setState(previous => previous === "ready" ? "ready" : "error");
    } finally { if(attempt === generation.current) busy.current = false; }
  }, []);

  useEffect(() => {
    setLoginPath(customerLoginPath(window.location.pathname + window.location.search));
    void hydrate();
    const onShow = () => { void hydrate(); };
    const onVisible = () => { if (document.visibilityState === "visible") void hydrate(); };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      generation.current += 1;
      busy.current = false;
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrate, pathname]);

  if (state === "ready") return <Fragment key={accountId}>
    {message && <div role="status" className="p-3 text-sm text-center text-white/70">{message} <button className="underline" onClick={() => void hydrate()}>Retry</button></div>}
    {children}
  </Fragment>;
  return <div className="min-h-[70vh] flex items-center justify-center p-6">
    <div className="max-w-md text-center space-y-4">
      {state === "loading" ? <p role="status">Loading your account and reports…</p> : state === "signed_out" ? <>
        <h1 className="text-2xl font-semibold">Sign in to your reports</h1>
        <p className="text-white/60">Use the email you entered at checkout. If you paid without setting a password, choose email code on the sign-in page.</p>
        <Link href={loginPath} className="inline-block rounded-xl bg-primary px-6 py-3 text-white">Sign in and continue</Link>
      </> : <>
        <p role="alert" className="text-white/70">{message}</p>
        <button className="rounded-xl bg-primary px-6 py-3 text-white" onClick={() => { setState("loading"); void hydrate(); }}>Retry</button>
      </>}
    </div>
  </div>;
}
