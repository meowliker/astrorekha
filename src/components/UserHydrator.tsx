"use client";

import { useCallback, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { useUserStore } from "@/lib/user-store";

export default function UserHydrator() {
  const { setSubscriptionPlan, setCoins, setFirebaseUserId, unlockFeature, unlockAllFeatures } = useUserStore();

  const normalizePlan = (plan: any): "weekly" | "monthly" | "yearly" | null => {
    if (!plan) return null;
    const p = String(plan).toLowerCase().trim();
    if (p === "weekly" || p.includes("week")) return "weekly";
    if (p === "monthly" || p.includes("month")) return "monthly";
    if (p === "yearly" || p.includes("year") || p.includes("annual")) return "yearly";
    return null;
  };

  const hydrate = useCallback(async () => {
    const authUid = auth.currentUser?.uid || null;
    const storedId = localStorage.getItem("palmcosmic_user_id");
    const userId = authUid || storedId;
    if (!userId) return;

    if (authUid && storedId !== authUid) {
      localStorage.setItem("palmcosmic_user_id", authUid);
    }

    try {
      const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
      const sessionId = url?.searchParams.get("session_id") || "";
      const fulfillKey = sessionId ? `pc_fulfilled_${sessionId}` : "";

      if (sessionId && typeof window !== "undefined" && !sessionStorage.getItem(fulfillKey)) {
        sessionStorage.setItem(fulfillKey, "1");
        try {
          await fetch("/api/stripe/fulfill-checkout-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, userId }),
          });

          try {
            const next = new URL(window.location.href);
            next.searchParams.delete("session_id");
            window.history.replaceState({}, "", next.toString());
          } catch {
            // ignore
          }
        } catch (err) {
          console.error("Failed to fulfill checkout session:", err);
        }
      }

      const snap = await getDoc(doc(db, "users", userId));
      if (!snap.exists()) return;

      const data: any = snap.data();

      setFirebaseUserId(userId);
      
      // Check subscription status and set cookie for middleware
      const subStatus = data.subscriptionStatus;
      const isCancelled = subStatus === "cancelled" || subStatus === "canceled" || data.subscriptionCancelled === true;
      
      if (isCancelled) {
        // Set cookie to indicate subscription is cancelled
        document.cookie = "pc_sub_cancelled=1; path=/; max-age=86400"; // 24 hours
        
        // Redirect to manage subscription if on a protected route
        const protectedPaths = ["/dashboard", "/reports", "/chat", "/palm-reading", "/horoscope", "/birth-chart", "/compatibility", "/prediction-2026", "/profile", "/settings"];
        const currentPath = window.location.pathname;
        const isOnProtectedRoute = protectedPaths.some(p => currentPath.startsWith(p));
        
        if (isOnProtectedRoute) {
          window.location.href = "/manage-subscription";
          return;
        }
      } else {
        // Clear the cancelled cookie if subscription is active
        document.cookie = "pc_sub_cancelled=; path=/; max-age=0";
      }

      // Backfill timezone for existing users who don't have it set
      if (!data.timezone) {
        try {
          const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (detectedTz) {
            await updateDoc(doc(db, "users", userId), { timezone: detectedTz });
          }
        } catch (_) {}
      }

      if (Object.prototype.hasOwnProperty.call(data, "subscriptionPlan")) {
        setSubscriptionPlan(normalizePlan(data.subscriptionPlan));
      }

      if (typeof data.coins === "number") {
        setCoins(data.coins);
      }

      if (data.isDevTester === true) {
        unlockAllFeatures();
        setCoins(typeof data.coins === "number" ? data.coins : 999999);
        setSubscriptionPlan(normalizePlan(data.subscriptionPlan) ?? "yearly");
        return;
      }

      const unlocked = data.unlockedFeatures || {};
      const hasPrediction2026 = !!(unlocked.prediction2026 || unlocked["unlockedFeatures.prediction2026"]);
      const hasBirthChart = !!(unlocked.birthChart || unlocked["unlockedFeatures.birthChart"]);
      const hasCompatibility = !!(unlocked.compatibilityTest || unlocked["unlockedFeatures.compatibilityTest"]);

      if (hasPrediction2026) unlockFeature("prediction2026");
      if (hasBirthChart) unlockFeature("birthChart");
      if (hasCompatibility) unlockFeature("compatibilityTest");
    } catch (err) {
      console.error("Failed to hydrate user:", err);
    }
  }, [setSubscriptionPlan, setCoins, setFirebaseUserId, unlockAllFeatures, unlockFeature]);

  useEffect(() => {
    // Wait for Firebase Auth to initialize before first hydration
    const unsubscribe = auth.onAuthStateChanged(() => {
      hydrate();
    });

    const onPageShow = () => hydrate();
    const onVisibility = () => {
      if (document.visibilityState === "visible") hydrate();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hydrate]);

  return null;
}
