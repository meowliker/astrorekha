"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useUserStore } from "@/lib/user-store";
import { useRouter } from "next/navigation";

export default function UserHydrator() {
  const { syncFromServer, setCoins, setUserId, unlockFeature, unlockAllFeatures } = useUserStore();
  const router = useRouter();
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securityEmail, setSecurityEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetStatusMessage, setResetStatusMessage] = useState("");
  const [resetStatusError, setResetStatusError] = useState("");

  const getSecurityPromptStorageKey = useCallback(() => {
    if (typeof window === "undefined") return null;
    const userId = localStorage.getItem("astrorekha_user_id");
    if (!userId) return null;
    return `astrorekha_security_update_prompt_seen_${userId}`;
  }, []);

  const hideSecurityModal = useCallback(() => {
    setSecurityModalOpen(false);
    const securityPromptStorageKey = getSecurityPromptStorageKey();
    if (securityPromptStorageKey) {
      localStorage.setItem(securityPromptStorageKey, "1");
    }
  }, [getSecurityPromptStorageKey]);

  const handleResetPassword = useCallback(async () => {
    if (!securityEmail) return;

    setIsSendingReset(true);
    setResetStatusError("");
    setResetStatusMessage("");

    try {
      const response = await fetch("/api/auth/send-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: securityEmail }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Failed to send reset link");
      }

      setResetStatusMessage("Reset link sent. Please check your email inbox.");
      const securityPromptStorageKey = getSecurityPromptStorageKey();
      if (securityPromptStorageKey) {
        localStorage.setItem(securityPromptStorageKey, "1");
      }
      setTimeout(() => {
        setSecurityModalOpen(false);
      }, 1200);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to send reset link right now. Please try again.";
      setResetStatusError(message);
    } finally {
      setIsSendingReset(false);
    }
  }, [securityEmail, getSecurityPromptStorageKey]);

  const hydrate = useCallback(async () => {
    const storedId = localStorage.getItem("astrorekha_user_id");
    if (!storedId) return;

    const userId = storedId;

    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      // User not found in database - clear localStorage and redirect to login
      if (error || !data) {
        console.warn("User not found in database, clearing session");
        localStorage.removeItem("astrorekha_user_id");
        localStorage.removeItem("astrorekha_email");
        localStorage.removeItem("astrorekha_password");
        localStorage.removeItem("astrorekha_onboarding_flow");
        localStorage.removeItem("astrorekha_purchase_type");
        
        // Clear session cookie
        await fetch("/api/session/clear", { method: "POST" });
        
        // Redirect to welcome
        router.push("/welcome");
        return;
      }

      setUserId(userId);

      // Backfill timezone for existing users who don't have it set
      if (!data.timezone) {
        try {
          const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (detectedTz) {
            await supabase.from("users").update({ timezone: detectedTz }).eq("id", userId);
          }
        } catch {}
      }

      if (typeof data.coins === "number") {
        setCoins(data.coins);
      }

      // Show post-login security update prompt only for affected users.
      if (!data.password_hash && data.email) {
        setSecurityEmail(String(data.email).trim().toLowerCase());
        const securityPromptStorageKey = getSecurityPromptStorageKey();
        const hasSeenPrompt = securityPromptStorageKey
          ? localStorage.getItem(securityPromptStorageKey) === "1"
          : false;
        if (!hasSeenPrompt) {
          setSecurityModalOpen(true);
        }
      }

      if (data.is_dev_tester === true) {
        unlockAllFeatures();
        setCoins(typeof data.coins === "number" ? data.coins : 999999);
        return;
      }

      // Sync unlocked features from server
      const unlocked = data.unlocked_features || {};
      syncFromServer({
        unlockedFeatures: unlocked,
        coins: data.coins,
        purchasedBundle: data.bundle_purchased || null,
      });

      const hasPalmReading = !!unlocked.palmReading;
      const hasPrediction2026 = !!unlocked.prediction2026;
      const hasBirthChart = !!unlocked.birthChart;
      const hasCompatibility = !!unlocked.compatibilityTest;
      const hasSoulmateSketch = !!unlocked.soulmateSketch;
      const hasFuturePartnerReport = !!unlocked.futurePartnerReport;

      if (hasPalmReading) unlockFeature("palmReading");
      if (hasPrediction2026) unlockFeature("prediction2026");
      if (hasBirthChart) unlockFeature("birthChart");
      if (hasCompatibility) unlockFeature("compatibilityTest");
      if (hasSoulmateSketch) unlockFeature("soulmateSketch");
      if (hasFuturePartnerReport) unlockFeature("futurePartnerReport");
    } catch (err) {
      console.error("Failed to hydrate user:", err);
    }
  }, [syncFromServer, setCoins, setUserId, unlockAllFeatures, unlockFeature, getSecurityPromptStorageKey, router]);

  useEffect(() => {
    // Hydrate immediately on mount
    hydrate();

    const onPageShow = () => hydrate();
    const onVisibility = () => {
      if (document.visibilityState === "visible") hydrate();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hydrate]);

  return (
    <>
      {securityModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-5">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#151c2f] p-5 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Important Account Update</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              We&apos;ve updated our security and usage terms. Please reset your password once and review your profile details to continue smoothly.
            </p>

            {resetStatusMessage && (
              <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                {resetStatusMessage}
              </div>
            )}
            {resetStatusError && (
              <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {resetStatusError}
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={isSendingReset}
                className="flex-1 rounded-xl bg-gradient-to-r from-[#f43f5e] to-[#a855f7] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingReset ? "Sending..." : "Reset Password"}
              </button>
              <button
                type="button"
                onClick={hideSecurityModal}
                className="rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10"
              >
                Later
              </button>
            </div>

            <button
              type="button"
              onClick={() => router.push("/profile/edit")}
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
            >
              Review Profile Details
            </button>
          </div>
        </div>
      )}
    </>
  );
}
