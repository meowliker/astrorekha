"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles } from "lucide-react";
import Script from "next/script";
import { usePricing } from "@/hooks/usePricing";
import { generateUserId } from "@/lib/user-profile";
import { pixelEvents } from "@/lib/pixel-events";

const LAYOUT_TEST_ID = "onboarding-layout-qa";

export default function BundlePricingBPage() {
  const router = useRouter();
  const { pricing } = usePricing();
  const [selectedPlan, setSelectedPlan] = useState("palm-birth-sketch");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(true);
  const checkoutStartedRef = useRef(false);

  const visitorId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const existing = localStorage.getItem("astrorekha_ab_visitor_id");
    if (existing) return existing;
    const generated = localStorage.getItem("astrorekha_user_id") || generateUserId();
    localStorage.setItem("astrorekha_ab_visitor_id", generated);
    return generated;
  }, []);

  const bundlePlans = useMemo(() => {
    const byId = new Map(pricing.bundles.map((bundle) => [bundle.id, bundle]));
    const preferred = ["palm-reading", "palm-birth", "palm-birth-sketch"]
      .map((id) => byId.get(id))
      .filter(Boolean);
    return preferred.length > 0 ? (preferred as typeof pricing.bundles) : pricing.bundles;
  }, [pricing.bundles]);

  const selectedPlanData = bundlePlans.find((plan) => plan.id === selectedPlan) || bundlePlans[0];

  useEffect(() => {
    const init = async () => {
      localStorage.setItem("astrorekha_onboarding_flow", "flow-b");
      localStorage.setItem("astrorekha_layout_variant", "B");

      const hasCompletedPayment = localStorage.getItem("astrorekha_payment_completed") === "true";
      const hasCompletedRegistration = localStorage.getItem("astrorekha_registration_completed") === "true";

      if (hasCompletedRegistration) {
        router.replace("/dashboard");
        return;
      }
      if (hasCompletedPayment) {
        router.replace("/onboarding/bundle-upsell-b");
        return;
      }

      try {
        const configRes = await fetch("/api/ab-test/layout-config", { cache: "no-store" });
        const configJson = await configRes.json().catch(() => ({}));
        if (configJson?.config?.layoutBEnabled === false) {
          router.replace("/onboarding/bundle-pricing");
          return;
        }
      } catch {
        // ignore and continue with Layout B screen in QA
      }

      fetch("/api/ab-test/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: LAYOUT_TEST_ID,
          variant: "B",
          eventType: "impression",
          visitorId,
        }),
      }).catch(() => {});
    };
    init();
    return () => {
      if (checkoutStartedRef.current) return;
      if (localStorage.getItem("astrorekha_payment_completed") === "true") return;
      fetch("/api/ab-test/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: LAYOUT_TEST_ID,
          variant: "B",
          eventType: "bounce",
          visitorId,
        }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [router, visitorId]);

  const handlePurchase = async () => {
    if (!selectedPlanData) return;

    setIsProcessing(true);
    setPaymentError("");
    checkoutStartedRef.current = true;

    try {
      pixelEvents.addToCart(selectedPlanData.price, selectedPlanData.name);

      fetch("/api/ab-test/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: LAYOUT_TEST_ID,
          variant: "B",
          eventType: "checkout_started",
          visitorId,
          metadata: { plan: selectedPlanData.id, amount: selectedPlanData.price },
        }),
      }).catch(() => {});

      const response = await fetch("/api/payu/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bundle",
          bundleId: selectedPlanData.id,
          userId: localStorage.getItem("astrorekha_user_id") || generateUserId(),
          email: localStorage.getItem("astrorekha_email") || "",
          firstName: localStorage.getItem("astrorekha_name") || "Customer",
        }),
      });

      const data = await response.json();
      if (!data.txnId) {
        setPaymentError(data.error || "Unable to start checkout");
        setIsProcessing(false);
        return;
      }

      const bolt = (window as any).bolt;
      bolt.launch(
        {
          key: data.key,
          txnid: data.txnId,
          hash: data.hash,
          amount: data.amount,
          firstname: data.firstName,
          email: data.email,
          phone: "",
          productinfo: data.productInfo,
          udf1: data.udf1,
          udf2: data.udf2,
          udf3: data.udf3,
          udf4: data.udf4,
          udf5: data.udf5,
          surl: `${window.location.origin}/api/payu/success`,
          furl: `${window.location.origin}/api/payu/failure`,
        },
        {
          responseHandler: async (responsePayload: any) => {
            if (responsePayload.response.txnStatus !== "SUCCESS") {
              setPaymentError("Payment failed. Please try again.");
              setIsProcessing(false);
              return;
            }

            await fetch("/api/payu/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                txnid: responsePayload.response.txnid,
                mihpayid: responsePayload.response.mihpayid,
                status: "success",
                hash: responsePayload.response.hash,
                amount: data.amount,
                productinfo: data.productInfo,
                firstname: data.firstName,
                email: data.email,
                udf1: data.udf1,
                udf2: data.udf2,
                udf3: data.udf3,
                udf4: data.udf4,
                udf5: data.udf5,
                key: data.key,
              }),
            });

            localStorage.setItem("astrorekha_payment_completed", "true");
            localStorage.setItem("astrorekha_purchase_type", "one-time");
            localStorage.setItem("astrorekha_bundle_id", selectedPlanData.id);
            localStorage.setItem("astrorekha_selected_plan", selectedPlanData.id);

            pixelEvents.purchase(selectedPlanData.price, selectedPlanData.id, selectedPlanData.name);
            fetch("/api/ab-test/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                testId: LAYOUT_TEST_ID,
                variant: "B",
                eventType: "conversion",
                visitorId,
                metadata: { amount: selectedPlanData.price, plan: selectedPlanData.id },
              }),
            }).catch(() => {});

            setIsProcessing(false);
            router.push("/onboarding/bundle-upsell-b");
          },
          catchException: () => {
            setPaymentError("Payment was cancelled or failed.");
            setIsProcessing(false);
          },
        }
      );
    } catch (error) {
      console.error("Layout B checkout failed:", error);
      setPaymentError("Unable to process payment right now.");
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-[#0A0E1A] px-5 py-6">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-5 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-300/80">Layout B • QA</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Your Soulmate Sketch Is Ready</h1>
            <p className="mt-2 text-sm text-white/60">
              Unlock your palm reading, birth chart, and one-time AI soulmate sketch in a single bundle.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl border border-indigo-400/20 bg-gradient-to-b from-[#121d3b] to-[#0a1229] p-6"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(99,102,241,0.25),transparent_65%)]" />
            <div className="relative">
              <h2 className="text-center text-2xl font-semibold text-white">The Drawing Of Your Soulmate Is Ready!</h2>
              <div className="mx-auto mt-6 h-56 w-52 rounded-3xl border border-white/10 bg-white/5 p-2 shadow-[0_0_60px_rgba(16,185,129,0.15)]">
                <div className="h-full w-full rounded-2xl bg-gradient-to-b from-slate-300/70 to-slate-500/70 blur-[1px]" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-white/75">
                <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-center">💕 First date</div>
                <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-center">💍 Marriage</div>
                <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-center">🎉 Anniversary</div>
                <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-center">🚀 Big change</div>
              </div>
            </div>
          </motion.div>

          <div className="mt-5 space-y-3">
            {bundlePlans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedPlan === plan.id
                    ? "border-indigo-400 bg-indigo-500/10"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-white">{plan.name}</p>
                    <p className="mt-1 text-xs text-white/60">{plan.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xl font-bold text-indigo-200">₹{plan.displayPrice || plan.price}</span>
                      <span className="text-xs text-white/40 line-through">₹{plan.originalPrice}</span>
                    </div>
                  </div>
                  {selectedPlan === plan.id ? (
                    <div className="mt-1 rounded-full bg-indigo-500 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>

          <label className="mt-5 flex items-start gap-2 text-xs text-white/65">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I agree to the Terms and Privacy Policy.
            </span>
          </label>

          {paymentError ? (
            <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {paymentError}
            </div>
          ) : null}

          <Button
            disabled={!selectedPlanData || !agreedToTerms || isProcessing}
            onClick={handlePurchase}
            className="mt-5 h-14 w-full bg-indigo-500 text-base font-semibold hover:bg-indigo-400"
          >
            {isProcessing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Unlock Now - ₹{selectedPlanData?.displayPrice || selectedPlanData?.price || 0}
              </span>
            )}
          </Button>
        </div>
      </div>
      <Script src="https://jssdk.payu.in/bolt/bolt.min.js" strategy="afterInteractive" />
    </>
  );
}
