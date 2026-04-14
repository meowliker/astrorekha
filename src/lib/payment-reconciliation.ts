const SUCCESS_STATUSES = new Set(["paid", "success", "captured"]);

const BUNDLE_FEATURES: Record<string, string[]> = {
  "palm-reading": ["palmReading"],
  "palm-birth": ["palmReading", "birthChart"],
  "palm-birth-compat": ["palmReading", "birthChart", "compatibilityTest", "futurePartnerReport"],
  "palm-birth-sketch": ["palmReading", "birthChart", "soulmateSketch", "futurePartnerReport"],
};

const BUNDLE_COIN_BONUS: Record<string, number> = {
  "palm-reading": 15,
  "palm-birth": 15,
  "palm-birth-compat": 30,
  "palm-birth-sketch": 30,
};

const OFFER_ID_TO_FEATURE: Record<string, string> = {
  "2026-predictions": "prediction2026",
  "birth-chart": "birthChart",
  compatibility: "compatibilityTest",
  "soulmate-sketch": "soulmateSketch",
  "future-partner": "futurePartnerReport",
  "report-future-partner": "futurePartnerReport",
};

interface PaymentRow {
  id: string;
  user_id: string | null;
  type: string | null;
  bundle_id: string | null;
  feature: string | null;
  coins: number | null;
  payment_status: string | null;
  created_at: string | null;
}

function normalizeStatus(status?: string | null): string {
  return (status || "").toLowerCase().trim();
}

function mergeFeatures(
  current: Record<string, boolean> | null | undefined,
  featureList: string[]
): Record<string, boolean> {
  const merged: Record<string, boolean> = {
    palmReading: false,
    prediction2026: false,
    birthChart: false,
    compatibilityTest: false,
    soulmateSketch: false,
    futurePartnerReport: false,
    ...(current || {}),
  };

  for (const f of featureList) {
    if (f) merged[f] = true;
  }

  return merged;
}

function getFeatureList(row: PaymentRow): string[] {
  const type = (row.type || "").trim();
  const bundleId = (row.bundle_id || "").trim();
  const feature = (row.feature || "").trim();

  if (type === "bundle" || type === "bundle_payment") {
    return BUNDLE_FEATURES[bundleId] || [];
  }

  if (feature) {
    return feature
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  if (!bundleId) return [];
  if (bundleId.includes(",")) {
    return bundleId
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((offer) => OFFER_ID_TO_FEATURE[offer])
      .filter(Boolean);
  }

  const mapped = OFFER_ID_TO_FEATURE[bundleId];
  return mapped ? [mapped] : [];
}

function getCoinContribution(row: PaymentRow): number {
  const type = (row.type || "").trim();
  const bundleId = (row.bundle_id || "").trim();

  if (type === "coins") {
    const parsed = parseInt(String(row.coins || 0), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (type === "bundle" || type === "bundle_payment") {
    return BUNDLE_COIN_BONUS[bundleId] || 0;
  }

  return 0;
}

export async function reconcilePaidPaymentsForEmail({
  supabase,
  userId,
  email,
}: {
  supabase: any;
  userId: string;
  email: string;
}): Promise<{ hasPaidPayment: boolean; relinkedCount: number; latestBundleId: string | null }> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail || !userId) {
    return { hasPaidPayment: false, relinkedCount: 0, latestBundleId: null };
  }

  const { data: paidRows, error: paidRowsError } = await supabase
    .from("payments")
    .select("id, user_id, type, bundle_id, feature, coins, payment_status, created_at")
    .eq("customer_email", normalizedEmail)
    .in("payment_status", ["paid", "success", "captured"]);

  if (paidRowsError || !paidRows || paidRows.length === 0) {
    return { hasPaidPayment: false, relinkedCount: 0, latestBundleId: null };
  }

  const rows: PaymentRow[] = paidRows.filter((row: PaymentRow) =>
    SUCCESS_STATUSES.has(normalizeStatus(row.payment_status))
  );

  if (rows.length === 0) {
    return { hasPaidPayment: false, relinkedCount: 0, latestBundleId: null };
  }

  let relinkedCount = 0;
  for (const row of rows) {
    if (row.user_id !== userId) {
      const { error } = await supabase.from("payments").update({ user_id: userId }).eq("id", row.id);
      if (!error) relinkedCount += 1;
    }
  }

  const { data: userData } = await supabase
    .from("users")
    .select("unlocked_features, coins, bundle_purchased")
    .eq("id", userId)
    .maybeSingle();

  let mergedFeatures: Record<string, boolean> = {
    palmReading: false,
    prediction2026: false,
    birthChart: false,
    compatibilityTest: false,
    soulmateSketch: false,
    futurePartnerReport: false,
    ...(userData?.unlocked_features || {}),
  };
  let computedCoinsFromPayments = 0;
  let latestBundleId: string | null = userData?.bundle_purchased || null;

  const rowsSorted = [...rows].sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return da - db;
  });

  for (const row of rowsSorted) {
    mergedFeatures = mergeFeatures(mergedFeatures, getFeatureList(row));
    computedCoinsFromPayments += getCoinContribution(row);

    const type = (row.type || "").trim();
    const bundleId = (row.bundle_id || "").trim();
    if ((type === "bundle" || type === "bundle_payment") && bundleId) {
      latestBundleId = bundleId;
    }
  }

  const existingCoins = typeof userData?.coins === "number" ? userData.coins : 0;
  const mergedCoins = Math.max(existingCoins, computedCoinsFromPayments);

  const updatePayload: Record<string, any> = {
    unlocked_features: mergedFeatures,
    payment_status: "paid",
    coins: mergedCoins,
    updated_at: new Date().toISOString(),
  };

  if (latestBundleId) {
    updatePayload.bundle_purchased = latestBundleId;
  }

  await supabase.from("users").update(updatePayload).eq("id", userId);

  return { hasPaidPayment: true, relinkedCount, latestBundleId };
}
