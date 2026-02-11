"use client";

import { useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useUserStore } from "@/lib/user-store";

export default function UserHydrator() {
  const { syncFromServer, setCoins, setUserId, unlockFeature, unlockAllFeatures } = useUserStore();

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

      if (error || !data) return;

      setUserId(userId);

      // Backfill timezone for existing users who don't have it set
      if (!data.timezone) {
        try {
          const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (detectedTz) {
            await supabase.from("users").update({ timezone: detectedTz }).eq("id", userId);
          }
        } catch (_) {}
      }

      if (typeof data.coins === "number") {
        setCoins(data.coins);
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

      if (hasPalmReading) unlockFeature("palmReading");
      if (hasPrediction2026) unlockFeature("prediction2026");
      if (hasBirthChart) unlockFeature("birthChart");
      if (hasCompatibility) unlockFeature("compatibilityTest");
    } catch (err) {
      console.error("Failed to hydrate user:", err);
    }
  }, [syncFromServer, setCoins, setUserId, unlockAllFeatures, unlockFeature]);

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

  return null;
}
