"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import Script from "next/script";
import { generateUserId } from "@/lib/user-profile";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { pixelEvents } from "@/lib/pixel-events";
import { getPaymentAttributionPayload } from "@/lib/attribution-client";

const offers = [
  {
    id: "compatibility",
    name: "Compatibility Report",
    description: "Know how your relationship energy aligns.",
    price: 499,
    icon: "💕",
  },
  {
    id: "2026-predictions",
    name: "2026 Future Predictions",
    description: "Month-wise timeline of your next big year.",
    price: 499,
    icon: "🔮",
  },
];

export default function BundleUpsellBPage() {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const totalInr = useMemo(
    () => offers.filter((offer) => selectedIds.has(offer.id)).reduce((sum, offer) => sum + offer.price, 0),
    [selectedIds]
  );

  useEffect(() => {
    localStorage.setItem("astrorekha_onboarding_flow", "flow-b");
    localStorage.setItem("astrorekha_layout_variant", "B");

    const hasCompletedPayment = localStorage.getItem("astrorekha_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("astrorekha_registration_completed") === "true";

    if (hasCompletedRegistration) {
      router.replace("/dashboard");
      return;
    }

    if (!hasCompletedPayment) {
      router.replace("/onboarding/bundle-pricing-b");
    }
  }, [router]);

  const toggleOffer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCheckout = async () => {
    if (selectedIds.size === 0) {
      router.push("/onboarding/step-19");
      return;
    }

    setIsProcessing(true);
    setError("");

    try {
      const selected = offers.filter((offer) => selectedIds.has(offer.id));
      const offerIds = selected.map((offer) => offer.id).join(",");
      const selectedOfferNames = selected.map((offer) => offer.name);
      const combinedOfferLabel = selectedOfferNames.join(", ");

      pixelEvents.addToCart(totalInr, combinedOfferLabel);

      const response = await fetch("/api/payu/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: localStorage.getItem("astrorekha_user_id") || generateUserId(),
          bundleId: offerIds,
          type: "upsell",
          email: localStorage.getItem("astrorekha_email") || "",
          firstName: localStorage.getItem("astrorekha_name") || "Customer",
          attribution: getPaymentAttributionPayload(),
        }),
      });

      const data = await response.json();
      if (!data.txnId) {
        setError(data.error || "Unable to start checkout");
        setIsProcessing(false);
        return;
      }
      pixelEvents.initiateCheckout(totalInr, selectedOfferNames);
      pixelEvents.addPaymentInfo(totalInr, combinedOfferLabel);

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
              setError("Payment failed. Please try again.");
              setIsProcessing(false);
              return;
            }

            const verifyRes = await fetch("/api/payu/verify-payment", {
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

            const verifyData = await verifyRes.json().catch(() => ({ success: false }));
            if (verifyRes.ok && verifyData?.success) {
              pixelEvents.purchase(totalInr, `upsell-${offerIds}`, combinedOfferLabel);
              setIsProcessing(false);
              router.push("/onboarding/step-19");
            } else {
              setError("Payment verification failed. Please contact support.");
              setIsProcessing(false);
            }
          },
          catchException: () => {
            setError("Payment was cancelled or failed.");
            setIsProcessing(false);
          },
        }
      );
    } catch (checkoutError) {
      console.error("Layout B upsell checkout failed:", checkoutError);
      setError("Something went wrong. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <>
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="min-h-screen bg-background px-6 py-6">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-center text-2xl font-bold">Optional Add-ons</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Choose one, both, or skip.
          </p>

          <div className="mt-6 space-y-3">
            {offers.map((offer) => {
              const selected = selectedIds.has(offer.id);
              return (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => toggleOffer(offer.id)}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition-all duration-200",
                    "bg-card hover:bg-card/80 border-border hover:border-primary/50",
                    selected && "border-primary bg-primary/10"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{offer.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold">{offer.name}</p>
                      <p className="text-xs text-muted-foreground">{offer.description}</p>
                      <p className="mt-2 text-sm text-primary">₹{offer.price}</p>
                    </div>
                    {selected ? (
                      <div className="rounded-full bg-primary p-1">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Button onClick={handleCheckout} disabled={isProcessing} className="mt-6 h-14 w-full text-lg font-semibold">
            {isProcessing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </span>
            ) : selectedIds.size > 0 ? (
              `Continue with Add-ons - ₹${totalInr}`
            ) : (
              "Skip & Continue"
            )}
          </Button>

        </div>
      </motion.div>
      <Script src="https://jssdk.payu.in/bolt/bolt.min.js" strategy="afterInteractive" />
    </>
  );
}
