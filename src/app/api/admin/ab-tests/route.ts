import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";

// Admin API for managing A/B tests
const SETTINGS_KEY = "funnel_layout_b_config";
const DEFAULT_ONBOARDING_TEST_ID = DEFAULT_LAYOUT_B_CONFIG.testId;
const PAYWALL_DEFAULT_PLAN_TEST_ID_PREFIX = "paywall-default-plan";
const PAYWALL_GST_TEST_ID = "paywall-gst-exclusive-v1";
const PAYWALL_GST_TEST_ID_PREFIX = "paywall-gst-exclusive";
const PAYWALL_COSMIC_BUNDLE_TEST_ID = "paywall-cosmic-bundle-v1";
const PAYWALL_COSMIC_BUNDLE_TEST_ID_PREFIX = "paywall-cosmic-bundle";
const SUCCESS_PAYMENT_STATUSES = new Set(["paid", "success", "captured"]);

type VariantKey = "A" | "B";

type RouteStatsRow = {
  route: string;
  assignedUsers: number;
  uniqueAudience: number;
  impressions: number;
  checkoutsStarted: number;
  trackedBundleConversions: number;
  bounces: number;
  bounceRate: string;
  checkoutStartRate: string;
  trackedConversionRate: string;
  trackedCheckoutToConversionRate: string;
  trackedRevenueInr: number;
  paidOrders: number;
  paidRevenueInr: number;
  upsellOrders: number;
  upsellRevenueInr: number;
  upsellAttachRate: string;
};

type FunnelFlowStepRow = {
  step: number;
  route: string;
  audience: number;
  impressions: number;
  continuedToNext: number;
  dropOffs: number;
  bounceRate: string;
  checkoutsStarted: number;
  trackedBundleConversions: number;
  paidOrders: number;
  paidRevenueInr: number;
  upsellOrders: number;
  upsellRevenueInr: number;
};

type PurchaseDetailRow = {
  purchasedAt: string;
  userId: string;
  email: string;
  userName?: string;
  variant: VariantKey;
  funnel: string;
  source?: "upsell_page" | "dashboard";
  item: string;
  amountInr: number;
  paymentId: string;
  transactionId: string;
  paymentStatus: string;
};

type MixSummaryRow = {
  item: string;
  orders: number;
  buyers: number;
  revenueInr: number;
};

type FunnelDecisionSummary = {
  assignedUsers: number;
  bundleBuyers: number;
  upsellBuyers: number;
  upsellAttachRate: string;
  bundleRevenueInr: number;
  upsellRevenueInr: number;
  totalRevenueInr: number;
  avgRevenuePerBundleBuyerInr: string;
};

type InternalRouteAccumulator = {
  route: string;
  visitorIds: Set<string>;
  impressions: number;
  checkoutsStarted: number;
  trackedBundleConversions: number;
  bounces: number;
  trackedRevenueInr: number;
  paidOrders: number;
  paidRevenueInr: number;
  upsellOrders: number;
  upsellRevenueInr: number;
};

const ONBOARDING_FLOW_ROUTES: Record<VariantKey, string[]> = {
  A: [
    "/welcome",
    "/onboarding",
    "/onboarding/birthday",
    "/onboarding/birth-time",
    "/onboarding/birthplace",
    "/onboarding/step-5",
    "/onboarding/step-6",
    "/onboarding/step-7",
    "/onboarding/step-8",
    "/onboarding/step-9",
    "/onboarding/step-10",
    "/onboarding/step-11",
    "/onboarding/step-12",
    "/onboarding/step-13",
    "/onboarding/step-14",
    "/onboarding/step-15",
    "/onboarding/bundle-pricing",
    "/onboarding/bundle-upsell",
    "/onboarding/step-19",
    "/onboarding/step-20",
  ],
  B: [
    "/welcome-b",
    "/onboarding",
    "/onboarding/birthday",
    "/onboarding/birth-time",
    "/onboarding/birthplace",
    "/onboarding/step-5",
    "/onboarding/step-6",
    "/onboarding/step-7",
    "/onboarding/step-8",
    "/onboarding/step-9",
    "/onboarding/step-10",
    "/onboarding/step-10b",
    "/onboarding/step-11",
    "/onboarding/step-12",
    "/onboarding/step-13",
    "/onboarding/step-14",
    "/onboarding/step-15",
    "/onboarding/bundle-pricing",
    "/onboarding/bundle-upsell-b",
    "/onboarding/step-19",
    "/onboarding/step-20",
  ],
};

function normalizeStatus(status: unknown): string {
  return String(status || "").trim().toLowerCase();
}

function toInrAmount(amount: unknown, currency: unknown): number {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const normalizedCurrency = String(currency || "").trim().toUpperCase();

  // PayU INR amounts are usually in paise (e.g. 49900), while AB test event
  // metadata amount is already in rupees.
  if (normalizedCurrency === "INR" && numeric >= 1000 && numeric % 100 === 0) {
    return numeric / 100;
  }
  return numeric;
}

function normalizeOnboardingRoute(page: unknown, fallback: string): string {
  const raw = String(page || "").trim();
  if (!raw) return fallback;
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("onboarding/")) return `/${raw}`;
  return `/onboarding/${raw}`;
}

function resolveEventRoute(metadata: any, fallback: string): string {
  const payload = metadata?.metadata ?? metadata?.event_data ?? metadata?.data ?? metadata;
  const candidates = [payload?.route, payload?.path, payload?.page];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const normalized = candidate.trim();
      return normalized.startsWith("/") ? normalized : `/${normalized}`;
    }
  }
  return fallback;
}

function canonicalizeTrackedRoute(route: unknown): string {
  const raw = String(route || "").trim();
  if (!raw) return "";
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  const [withoutQuery] = normalized.split("?");
  const [withoutHash] = withoutQuery.split("#");

  const aliases: Record<string, string> = {
    "/onboarding/bundle-pricing-b": "/onboarding/bundle-pricing",
    "/onboarding/step-17": "/onboarding/bundle-pricing",
    "/onboarding/a-step-17": "/onboarding/bundle-pricing",
    "/onboarding/layout-b-funnel": "/onboarding/step-7",
  };

  return aliases[withoutHash] || withoutHash;
}

function inferVariantFromUser(user: any): VariantKey {
  if (user?.ab_variant === "A" || user?.ab_variant === "B") return user.ab_variant;
  if (user?.onboarding_flow === "flow-b") return "B";
  return "A";
}

function isPaywallDefaultPlanTestId(testId: string): boolean {
  return testId.startsWith(PAYWALL_DEFAULT_PLAN_TEST_ID_PREFIX);
}

function isPaywallGstTestId(testId: string): boolean {
  return testId.startsWith(PAYWALL_GST_TEST_ID_PREFIX);
}

function isPaywallCosmicBundleTestId(testId: string): boolean {
  return testId.startsWith(PAYWALL_COSMIC_BUNDLE_TEST_ID_PREFIX);
}

function isPaywallScopedTestId(testId: string): boolean {
  return isPaywallDefaultPlanTestId(testId) || isPaywallGstTestId(testId) || isPaywallCosmicBundleTestId(testId);
}

function inferPaymentVariant(row: any, user: any, testId: string): VariantKey | null {
  if (isPaywallGstTestId(testId) || isPaywallCosmicBundleTestId(testId)) {
    if (String(row?.paywall_test_id || "") !== testId) return null;
    if (row?.paywall_variant === "A" || row?.paywall_variant === "B") return row.paywall_variant;
    return null;
  }
  return inferVariantFromUser(user);
}

function variantLabel(variant: VariantKey, testId = ""): string {
  if (isPaywallGstTestId(testId)) return variant === "B" ? "Exclusive GST" : "Current Price";
  if (isPaywallCosmicBundleTestId(testId)) return variant === "B" ? "Cosmic Bundle" : "Current Bundles";
  if (isPaywallDefaultPlanTestId(testId)) return variant === "B" ? "Default Full Bundle" : "Default Mid Bundle";
  return variant === "B" ? "Layout B" : "Layout A";
}

function mapBundleName(bundleId: string): string {
  const key = bundleId.trim();
  const map: Record<string, string> = {
    "palm-reading": "Palm Reading",
    "palm-birth": "Palm + Birth Chart",
    "palm-birth-compat": "Palm + Birth + Compatibility + Future Partner Report",
    "palm-birth-sketch": "Palm + Birth + Soulmate Sketch + Future Partner Report",
    "palm-birth-sketch-aura-astro": "Cosmic Bundle",
  };
  return map[key] || key || "Unknown Bundle";
}

function normalizeOfferKey(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function mapUpsellName(raw: string): string {
  const key = normalizeOfferKey(raw);
  const map: Record<string, string> = {
    "2026-future-predictions": "2026 Future Predictions",
    "2026-predictions": "2026 Future Predictions",
    "report-2026": "2026 Future Predictions",
    prediction2026: "2026 Future Predictions",
    "prediction-2026": "2026 Future Predictions",
    compatibility: "Compatibility Report",
    "compatibility-report": "Compatibility Report",
    "report-compatibility": "Compatibility Report",
    "report-compatibility-test": "Compatibility Report",
    "compatibility-test": "Compatibility Report",
    compatibilitytest: "Compatibility Report",
    "birth-chart": "Birth Chart Report",
    "birth-chart-report": "Birth Chart Report",
    "report-birth-chart": "Birth Chart Report",
    reportbirthchart: "Birth Chart Report",
    "soulmate-sketch": "Soulmate Sketch",
    "report-soulmate-sketch": "Soulmate Sketch",
    "soulmate-portrait": "Soulmate Sketch",
    "future-partner": "Future Partner Report",
    "report-future-partner": "Future Partner Report",
    futurepartnerreport: "Future Partner Report",
    "past-life": "Past Life Report",
    "past-life-report": "Past Life Report",
    "report-past-life": "Past Life Report",
    pastlifereport: "Past Life Report",
    "vastu-shastra-guide": "Complete Vastu Shastra Guide Ebook",
    "report-vastu-shastra-guide": "Complete Vastu Shastra Guide Ebook",
    vastushastraguide: "Complete Vastu Shastra Guide Ebook",
  };
  return map[key] || raw.trim() || "Unknown Upsell";
}

function parseOfferItems(raw: unknown): string[] {
  const value = String(raw || "").trim();
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function splitFromTrafficValue(value: unknown): { a: number; b: number } {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return { a: 50, b: 50 };
  const b = raw <= 1 ? raw * 100 : raw;
  const bWeight = clampPercent(b);
  return { a: 100 - bWeight, b: bWeight };
}

function maxIsoDate(leftIso: string, rightIso: string): string {
  return new Date(leftIso).getTime() >= new Date(rightIso).getTime() ? leftIso : rightIso;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

// Matches Revenue/Profit Sheet day model:
// Costa Rica day == IST 11:30 AM to next day 11:29:59 AM.
function getISTRangeForCostaRicaDate(costaRicaDate: string): { start: Date; end: Date } {
  const startIST = new Date(`${costaRicaDate}T11:30:00+05:30`);
  const endIST = new Date(startIST.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start: startIST, end: endIST };
}

function getIstDateTimeParts(date: Date): { dayKey: string; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  const dayKey = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { dayKey, hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0 };
}

function getCostaRicaBusinessDayKeyFromDate(date: Date): string {
  const { dayKey, hour, minute } = getIstDateTimeParts(date);
  const isBeforeBoundary = hour < 11 || (hour === 11 && minute < 30);
  return isBeforeBoundary ? addDaysToIsoDate(dayKey, -1) : dayKey;
}

function parsePayUTxnTimestamp(payuTxnId: unknown): Date | null {
  const txn = String(payuTxnId || "").trim();
  if (!txn) return null;
  const match = txn.match(/^TXN_(\d{10,13})_/i);
  if (!match) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const millis = match[1].length <= 10 ? raw * 1000 : raw;
  const parsed = new Date(millis);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolvePaymentEventAt(row: any): Date | null {
  const fromTxn = parsePayUTxnTimestamp(row?.payu_txn_id);
  if (fromTxn) return fromTxn;

  const fallbackCandidates = [row?.fulfilled_at, row?.created_at];
  for (const candidate of fallbackCandidates) {
    const parsed = new Date(String(candidate || ""));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function getTestVariants(row: Record<string, any> | null | undefined, defaults: { pageA: string; pageB: string }) {
  const configuredA = Number(row?.variants?.A?.weight);
  const configuredB = Number(row?.variants?.B?.weight);

  let aWeight = Number.isFinite(configuredA) ? clampPercent(configuredA) : NaN;
  let bWeight = Number.isFinite(configuredB) ? clampPercent(configuredB) : NaN;

  if (!Number.isFinite(aWeight) || !Number.isFinite(bWeight) || aWeight + bWeight !== 100) {
    const split = splitFromTrafficValue(row?.traffic_split);
    aWeight = split.a;
    bWeight = split.b;
  }

  return {
    A: { weight: aWeight, page: String(row?.variants?.A?.page || defaults.pageA) },
    B: { weight: bWeight, page: String(row?.variants?.B?.page || defaults.pageB) },
  };
}

function normalizeTestForResponse(row: Record<string, any> | null | undefined, testId: string) {
  const isOnboardingLayoutTest = testId.startsWith("onboarding-layout");
  const isPaywallDefaultPlanTest = isPaywallDefaultPlanTestId(testId);
  const isPaywallGstTest = isPaywallGstTestId(testId);
  const isPaywallCosmicBundleTest = isPaywallCosmicBundleTestId(testId);
  const defaults = isOnboardingLayoutTest
    ? { pageA: "bundle-pricing", pageB: "bundle-pricing-b" }
    : isPaywallDefaultPlanTest
    ? { pageA: "default-839", pageB: "default-1599" }
    : isPaywallGstTest
    ? { pageA: "tax-inclusive", pageB: "exclusive-gst" }
    : isPaywallCosmicBundleTest
    ? { pageA: "current-bundles", pageB: "cosmic-bundle" }
    : { pageA: "step-17", pageB: "a-step-17" };
  const variants = getTestVariants(row, defaults);
  const trafficSplit = variants.B.weight / 100;
  const createdAt = row?.created_at || row?.createdAt || new Date().toISOString();
  const updatedAt = row?.updated_at || row?.updatedAt || createdAt;

  return {
    id: testId,
    name:
      row?.name ||
      (isOnboardingLayoutTest
        ? "Onboarding Layout A/B (QA)"
        : isPaywallDefaultPlanTest
        ? "Paywall Default Plan A/B (₹839 vs ₹1599)"
        : isPaywallGstTest
        ? "Paywall GST Exclusive Price Test"
        : isPaywallCosmicBundleTest
        ? "Paywall Cosmic Bundle Test"
        : "Pricing Page A/B Test"),
    status: row?.status || "active",
    variants,
    traffic_split: trafficSplit,
    last_reset_at: row?.last_reset_at || null,
    created_at: createdAt,
    updated_at: updatedAt,
    createdAt,
    updatedAt,
    lastResetAt: row?.last_reset_at || null,
  };
}

async function ensureOnboardingLayoutTest(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  const config = normalizeLayoutBConfig(settingsRow?.value);
  const testId = config.testId || DEFAULT_ONBOARDING_TEST_ID;
  const trafficSplit = clampPercent(config.variantBWeight) / 100;

  const { data: existing } = await supabase
    .from("ab_tests")
    .select("*")
    .eq("id", testId)
    .maybeSingle();

  if (!existing) {
    const row = {
      id: testId,
      name: "Onboarding Layout A/B (QA)",
      status: config.enabled ? "active" : "paused",
      traffic_split: trafficSplit,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await supabase.from("ab_tests").upsert(row, { onConflict: "id" });
    return testId;
  }

  // Keep metadata aligned with funnel config, but do not overwrite admin
  // controls such as status or split weights on every read.
  const shouldUpdateName = existing.name !== "Onboarding Layout A/B (QA)";
  const shouldSeedTrafficSplit = existing.traffic_split === null || existing.traffic_split === undefined;

  if (shouldUpdateName || shouldSeedTrafficSplit) {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (shouldUpdateName) patch.name = "Onboarding Layout A/B (QA)";
    if (shouldSeedTrafficSplit) patch.traffic_split = trafficSplit;

    await supabase.from("ab_tests").update(patch).eq("id", testId);
  }

  return testId;
}

async function ensurePaywallGstTest(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: existing } = await supabase
    .from("ab_tests")
    .select("*")
    .eq("id", PAYWALL_GST_TEST_ID)
    .maybeSingle();

  if (!existing) {
    const now = new Date().toISOString();
    await supabase.from("ab_tests").upsert(
      {
        id: PAYWALL_GST_TEST_ID,
        name: "Paywall GST Exclusive Price Test",
        status: "completed",
        traffic_split: 1,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "id" }
    );
  } else if (existing.status !== "completed" || Number(existing.traffic_split) !== 1) {
    await supabase
      .from("ab_tests")
      .update({
        status: "completed",
        traffic_split: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", PAYWALL_GST_TEST_ID);
  }

  return PAYWALL_GST_TEST_ID;
}

async function ensurePaywallCosmicBundleTest(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const now = new Date().toISOString();
  const row = {
    id: PAYWALL_COSMIC_BUNDLE_TEST_ID,
    name: "Paywall Cosmic Bundle Test",
    status: "completed",
    traffic_split: 0,
    variants: {
      A: { weight: 100, page: "current-bundles" },
      B: { weight: 0, page: "cosmic-bundle" },
    },
    updated_at: now,
    created_at: now,
  };

  const { data: existing } = await supabase
    .from("ab_tests")
    .select("*")
    .eq("id", PAYWALL_COSMIC_BUNDLE_TEST_ID)
    .maybeSingle();

  if (!existing) {
    await supabase.from("ab_tests").insert(row);
    return PAYWALL_COSMIC_BUNDLE_TEST_ID;
  }

  const patch: Record<string, unknown> = {};
  if (existing.name !== row.name) patch.name = row.name;
  if (existing.status !== row.status) patch.status = row.status;
  if (Number(existing.traffic_split) !== row.traffic_split) {
    patch.traffic_split = row.traffic_split;
  }
  if (
    Number(existing.variants?.A?.weight) !== row.variants.A.weight ||
    Number(existing.variants?.B?.weight) !== row.variants.B.weight ||
    existing.variants?.A?.page !== row.variants.A.page ||
    existing.variants?.B?.page !== row.variants.B.page
  ) {
    patch.variants = row.variants;
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = now;
    await supabase.from("ab_tests").update(patch).eq("id", PAYWALL_COSMIC_BUNDLE_TEST_ID);
  }

  return PAYWALL_COSMIC_BUNDLE_TEST_ID;
}

async function buildDefaultTestData(testId: string) {
  const isPaywallDefaultPlanTest = isPaywallDefaultPlanTestId(testId);
  const isPaywallGstTest = isPaywallGstTestId(testId);
  const isPaywallCosmicBundleTest = isPaywallCosmicBundleTestId(testId);
  const row = normalizeTestForResponse(
    {
      name: isPaywallGstTest
        ? "Paywall GST Exclusive Price Test"
        : isPaywallDefaultPlanTest
        ? "Paywall Default Plan A/B (₹839 vs ₹1599)"
        : isPaywallCosmicBundleTest
        ? "Paywall Cosmic Bundle Test"
        : "Onboarding Layout A/B (QA)",
      status: isPaywallDefaultPlanTest || isPaywallGstTest || isPaywallCosmicBundleTest ? "completed" : "active",
      traffic_split: isPaywallDefaultPlanTest || isPaywallGstTest ? 1 : isPaywallCosmicBundleTest ? 0 : 0.5,
      variants: isPaywallCosmicBundleTest
        ? {
            A: { weight: 100, page: "current-bundles" },
            B: { weight: 0, page: "cosmic-bundle" },
          }
        : undefined,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
    testId
  );
  return row;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("testId");

      const supabase = getSupabaseAdmin();
      const onboardingTestId = await ensureOnboardingLayoutTest(supabase);
      const paywallGstTestId = await ensurePaywallGstTest(supabase);
      const paywallCosmicBundleTestId = await ensurePaywallCosmicBundleTest(supabase);

    if (testId) {
      // Get specific test with detailed stats
      const { data: testData } = await supabase.from("ab_tests").select("*").eq("id", testId).single();
      
      const [{ count: assignmentsA = 0 }, { count: assignmentsB = 0 }] = await Promise.all([
        supabase
          .from("ab_test_assignments")
          .select("*", { count: "exact", head: true })
          .eq("test_id", testId)
          .eq("variant", "A"),
        supabase
          .from("ab_test_assignments")
          .select("*", { count: "exact", head: true })
          .eq("test_id", testId)
          .eq("variant", "B"),
      ]);
      let assignmentsACount = Number(assignmentsA ?? 0);
      let assignmentsBCount = Number(assignmentsB ?? 0);

      let recentEvents: any[] = [];
      let dailyBreakdown: any[] = [];

      const calculateRates = (stats: any, assignedCount: number) => {
        const impressions = Math.max(stats?.impressions || 0, assignedCount || 0);
        const conversions = stats?.conversions || 0;
        // For summary cards, bounce should represent users who did not convert
        // in the selected analytics window (not sparse explicit "bounce" events).
        const normalizedConversions = Math.min(Math.max(conversions, 0), impressions);
        const bounces = Math.max(impressions - normalizedConversions, 0);
        const checkoutsStarted = stats?.checkouts_started || 0;
        const totalRevenue = stats?.total_revenue || 0;

        return {
          impressions,
          conversions,
          bounces,
          checkoutsStarted,
          totalRevenue,
          conversionRate: impressions > 0 ? ((conversions / impressions) * 100).toFixed(2) : "0.00",
          bounceRate: impressions > 0 ? ((bounces / impressions) * 100).toFixed(2) : "0.00",
          checkoutRate: impressions > 0 ? ((checkoutsStarted / impressions) * 100).toFixed(2) : "0.00",
          checkoutToConversionRate: checkoutsStarted > 0 ? ((conversions / checkoutsStarted) * 100).toFixed(2) : "0.00",
          avgRevenuePerUser: conversions > 0 ? (totalRevenue / conversions).toFixed(2) : "0.00",
          avgRevenuePerImpression: impressions > 0 ? (totalRevenue / impressions).toFixed(2) : "0.00",
          assignedUsers: assignedCount || 0,
        };
      };

      const resolvedTestData = testData
        ? normalizeTestForResponse(testData, testId)
        : await buildDefaultTestData(testId);

      const trackingStartIso = String(
        resolvedTestData.last_reset_at || resolvedTestData.created_at || new Date().toISOString()
      );
      const requestedStartDate = searchParams.get("startDate");
      const requestedEndDate = searchParams.get("endDate");
      const hasDateFilter = Boolean(requestedStartDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedStartDate));
      const safeStartDate = hasDateFilter ? String(requestedStartDate) : null;
      const safeEndDate =
        hasDateFilter && requestedEndDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedEndDate)
          ? requestedEndDate
          : safeStartDate;

      const filterStartBoundary = safeStartDate ? getISTRangeForCostaRicaDate(safeStartDate).start.toISOString() : null;
      const filterEndBoundary = safeEndDate ? getISTRangeForCostaRicaDate(safeEndDate).end.toISOString() : null;

      const dateRangeStartIso = filterStartBoundary
        ? maxIsoDate(trackingStartIso, filterStartBoundary)
        : trackingStartIso;
      const dateRangeEndIso =
        filterEndBoundary && new Date(filterEndBoundary).getTime() >= new Date(dateRangeStartIso).getTime()
          ? filterEndBoundary
          : null;

      const isOnboardingLayoutTest = testId.startsWith("onboarding-layout");
        const isPaywallScopedTest = isPaywallScopedTestId(testId);
        const pricingRoutes: Record<VariantKey, string> = isOnboardingLayoutTest || isPaywallScopedTest
          ? {
              A: "/onboarding/bundle-pricing",
              B: "/onboarding/bundle-pricing",
          }
        : {
            A: canonicalizeTrackedRoute(
              normalizeOnboardingRoute(resolvedTestData?.variants?.A?.page, "/onboarding/step-17")
            ),
            B: canonicalizeTrackedRoute(
              normalizeOnboardingRoute(resolvedTestData?.variants?.B?.page, "/onboarding/a-step-17")
            ),
          };

        const upsellRoutes: Record<VariantKey, string> = isOnboardingLayoutTest
          ? {
              A: "/onboarding/bundle-upsell",
              B: "/onboarding/bundle-upsell-b",
            }
          : isPaywallScopedTest
          ? {
              A: "/onboarding/bundle-upsell",
              B: "/onboarding/bundle-upsell",
            }
          : {
            A: "/onboarding/step-19",
            B: "/onboarding/step-19",
          };

      const makeAccumulator = (route: string): InternalRouteAccumulator => ({
        route,
        visitorIds: new Set<string>(),
        impressions: 0,
        checkoutsStarted: 0,
        trackedBundleConversions: 0,
        bounces: 0,
        trackedRevenueInr: 0,
        paidOrders: 0,
        paidRevenueInr: 0,
        upsellOrders: 0,
        upsellRevenueInr: 0,
      });

      const routeAccumulators: Record<VariantKey, Map<string, InternalRouteAccumulator>> = {
        A: new Map(),
        B: new Map(),
      };
      const routeImpressionVisitorSets: Record<VariantKey, Map<string, Set<string>>> = {
        A: new Map(),
        B: new Map(),
      };
      const routeImpressionCounts: Record<VariantKey, Map<string, number>> = {
        A: new Map(),
        B: new Map(),
      };

      const ensureRouteImpressionVisitorSet = (variant: VariantKey, route: string) => {
        const map = routeImpressionVisitorSets[variant];
        if (!map.has(route)) map.set(route, new Set<string>());
        return map.get(route)!;
      };

      const incrementRouteImpressionCount = (variant: VariantKey, route: string) => {
        const map = routeImpressionCounts[variant];
        map.set(route, (map.get(route) || 0) + 1);
      };

      const ensureRoute = (variant: VariantKey, route: string): InternalRouteAccumulator => {
        const map = routeAccumulators[variant];
        if (!map.has(route)) {
          map.set(route, makeAccumulator(route));
        }
        return map.get(route)!;
      };

      (["A", "B"] as VariantKey[]).forEach((variant) => {
        ensureRoute(variant, pricingRoutes[variant]);
        ensureRoute(variant, upsellRoutes[variant]);
      });
      if (isOnboardingLayoutTest) {
        (["A", "B"] as VariantKey[]).forEach((variant) => {
          ONBOARDING_FLOW_ROUTES[variant].forEach((route) => {
            const canonical = canonicalizeTrackedRoute(route);
            ensureRoute(variant, canonical);
            ensureRouteImpressionVisitorSet(variant, canonical);
            if (!routeImpressionCounts[variant].has(canonical)) {
              routeImpressionCounts[variant].set(canonical, 0);
            }
          });
        });
      }

      let allEventsQuery = supabase
        .from("ab_test_events")
        .select("*")
        .eq("test_id", testId)
        .gte("created_at", dateRangeStartIso);
      if (dateRangeEndIso) {
        allEventsQuery = allEventsQuery.lte("created_at", dateRangeEndIso);
      }
      const { data: allEvents } = await allEventsQuery.order("created_at", { ascending: false }).limit(5000);

      for (const evt of allEvents || []) {
        const variant = evt?.variant === "B" ? "B" : evt?.variant === "A" ? "A" : null;
        if (!variant) continue;

        const fallbackRoute = pricingRoutes[variant];
        const route = canonicalizeTrackedRoute(resolveEventRoute(evt, fallbackRoute));
        const acc = ensureRoute(variant, route);

        const visitorId = typeof evt?.visitor_id === "string" ? evt.visitor_id.trim() : "";
        if (visitorId) acc.visitorIds.add(visitorId);

        const eventType = String(evt?.event_type || "");
        if (eventType === "impression") {
          acc.impressions += 1;
          incrementRouteImpressionCount(variant, route);
          if (visitorId) {
            ensureRouteImpressionVisitorSet(variant, route).add(visitorId);
          }
        } else if (eventType === "checkout_started") {
          acc.checkoutsStarted += 1;
        } else if (eventType === "conversion") {
          acc.trackedBundleConversions += 1;
          const eventMeta = evt?.metadata ?? evt?.event_data ?? evt?.data ?? {};
          acc.trackedRevenueInr += toInrAmount(eventMeta?.amount, "INR");
        } else if (eventType === "bounce") {
          acc.bounces += 1;
        }
      }

      recentEvents = (allEvents || []).slice(0, 50);
      const dailyData: Record<string, { A: any; B: any }> = {};
      for (const evt of allEvents || []) {
        if (!evt?.created_at) continue;
        const variant = evt?.variant === "B" ? "B" : evt?.variant === "A" ? "A" : null;
        if (!variant) continue;

        const dayKey = getCostaRicaBusinessDayKeyFromDate(new Date(evt.created_at));
        if (safeStartDate && dayKey < safeStartDate) continue;
        if (safeEndDate && dayKey > safeEndDate) continue;

        if (!dailyData[dayKey]) {
          dailyData[dayKey] = {
            A: { impressions: 0, conversions: 0, bounces: 0, revenue: 0 },
            B: { impressions: 0, conversions: 0, bounces: 0, revenue: 0 },
          };
        }

        if (evt.event_type === "impression") {
          dailyData[dayKey][variant].impressions += 1;
        } else if (evt.event_type === "conversion") {
          const eventMeta = evt?.metadata ?? evt?.event_data ?? evt?.data ?? {};
          dailyData[dayKey][variant].conversions += 1;
          dailyData[dayKey][variant].revenue += toInrAmount(eventMeta?.amount, "INR");
        } else if (evt.event_type === "bounce") {
          dailyData[dayKey][variant].bounces += 1;
        }
      }
      dailyBreakdown = Object.entries(dailyData)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      let paymentRowsQuery = supabase
        .from("payments")
        .select("*")
        .not("user_id", "is", null)
        .gte("created_at", dateRangeStartIso);
      const { data: paymentRows } = await paymentRowsQuery.order("created_at", { ascending: false }).limit(50000);

      const successfulPayments = (paymentRows || []).filter((row: any) =>
        SUCCESS_PAYMENT_STATUSES.has(normalizeStatus(row?.payment_status))
      );

      const uniqueUserIds = Array.from(
        new Set(
          successfulPayments
            .map((row: any) => String(row?.user_id || "").trim())
            .filter(Boolean)
        )
      );

      const usersById = new Map<string, any>();
      if (uniqueUserIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, email, name, ab_variant, onboarding_flow")
          .in("id", uniqueUserIds);
        for (const row of usersData || []) {
          usersById.set(String(row.id), row);
        }
      }

      const bundleBuyerSets: Record<VariantKey, Set<string>> = {
        A: new Set(),
        B: new Set(),
      };
      const upsellBuyerSets: Record<VariantKey, Set<string>> = {
        A: new Set(),
        B: new Set(),
      };

      const bundlePurchases: PurchaseDetailRow[] = [];
      const upsellPurchases: PurchaseDetailRow[] = [];
      const bundleMixMaps: Record<VariantKey, Map<string, { orders: number; buyers: Set<string>; revenueInr: number }>> = {
        A: new Map(),
        B: new Map(),
      };
      const upsellMixMaps: Record<VariantKey, Map<string, { orders: number; buyers: Set<string>; revenueInr: number }>> = {
        A: new Map(),
        B: new Map(),
      };

      const addMix = (
        variant: VariantKey,
        map: Record<VariantKey, Map<string, { orders: number; buyers: Set<string>; revenueInr: number }>>,
        item: string,
        userId: string,
        amountInr: number
      ) => {
        const variantMap = map[variant];
        const current = variantMap.get(item) || { orders: 0, buyers: new Set<string>(), revenueInr: 0 };
        current.orders += 1;
        current.buyers.add(userId);
        current.revenueInr += amountInr;
        variantMap.set(item, current);
      };

      for (const row of successfulPayments) {
        const userId = String(row?.user_id || "").trim();
        if (!userId) continue;

        const paymentEventAt = resolvePaymentEventAt(row);
        if (!paymentEventAt) continue;
        const paymentDayKey = getCostaRicaBusinessDayKeyFromDate(paymentEventAt);
        if (safeStartDate && paymentDayKey < safeStartDate) continue;
        if (safeEndDate && paymentDayKey > safeEndDate) continue;

        const user = usersById.get(userId);
          const variant = inferPaymentVariant(row, user, testId);
          if (!variant) continue;
          const funnel = variantLabel(variant, testId);
          const amountInr = Number(row?.total_amount || row?.amount || 0) / 100;
        const paymentType = String(row?.type || "").trim().toLowerCase();
        const email = String(user?.email || row?.customer_email || "").trim() || "N/A";
        const userName = String(user?.name || "").trim() || undefined;
        const paymentId = String(row?.id || "");
        const transactionId = String(row?.payu_txn_id || row?.razorpay_order_id || row?.razorpay_payment_id || "");
        const paymentStatus = String(row?.payment_status || "");
        const purchasedAt = paymentEventAt.toISOString();

        if (paymentType === "bundle") {
          bundleBuyerSets[variant].add(userId);
          const pricingAcc = ensureRoute(variant, pricingRoutes[variant]);
          pricingAcc.paidOrders += 1;
          pricingAcc.paidRevenueInr += amountInr;

          const bundleItem = mapBundleName(String(row?.bundle_id || row?.feature || "unknown"));
          bundlePurchases.push({
            purchasedAt,
            userId,
            email,
            userName,
            variant,
            funnel,
            item: bundleItem,
            amountInr,
            paymentId,
            transactionId,
            paymentStatus,
          });
          addMix(variant, bundleMixMaps, bundleItem, userId, amountInr);
        } else if (paymentType === "upsell" || paymentType === "report") {
          const upsellSource: "upsell_page" | "dashboard" =
            paymentType === "report" ? "dashboard" : "upsell_page";
          upsellBuyerSets[variant].add(userId);
          const upsellAcc = ensureRoute(variant, upsellRoutes[variant]);
          upsellAcc.upsellOrders += 1;
          upsellAcc.upsellRevenueInr += amountInr;

          const rawItems = parseOfferItems(row?.bundle_id || row?.feature);
          const mappedItems = (rawItems.length > 0 ? rawItems : ["unknown"]).map(mapUpsellName);
          const upsellItemDisplay = mappedItems.join(", ");
          upsellPurchases.push({
            purchasedAt,
            userId,
            email,
            userName,
            variant,
            funnel,
            source: upsellSource,
            item: upsellItemDisplay,
            amountInr,
            paymentId,
            transactionId,
            paymentStatus,
          });
          mappedItems.forEach((item) => addMix(variant, upsellMixMaps, item, userId, amountInr));
        }
      }

      (["A", "B"] as VariantKey[]).forEach((variant) => {
        const upsellAcc = ensureRoute(variant, upsellRoutes[variant]);
        bundleBuyerSets[variant].forEach((userId) => upsellAcc.visitorIds.add(`user:${userId}`));
        if (upsellAcc.impressions === 0) {
          upsellAcc.impressions = bundleBuyerSets[variant].size;
        }
      });

      let assignmentRowsQuery = supabase
        .from("ab_test_assignments")
        .select("visitor_id, variant, created_at")
        .eq("test_id", testId)
        .gte("created_at", dateRangeStartIso);
      if (dateRangeEndIso) {
        assignmentRowsQuery = assignmentRowsQuery.lte("created_at", dateRangeEndIso);
      }
      const { data: assignmentRows } = await assignmentRowsQuery.limit(10000);

      if (assignmentRows && assignmentRows.length > 0) {
        assignmentsACount = assignmentRows.filter((row: any) => row?.variant === "A").length;
        assignmentsBCount = assignmentRows.filter((row: any) => row?.variant === "B").length;
      }

      const assignmentsByVariant: Record<VariantKey, number> = {
        A: assignmentsACount,
        B: assignmentsBCount,
      };

      const buildWindowStats = (variant: VariantKey) => {
        const rows = Array.from(routeAccumulators[variant].values());
        const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
        const bounces = rows.reduce((sum, row) => sum + row.bounces, 0);
        const checkoutsStarted = rows.reduce((sum, row) => sum + row.checkoutsStarted, 0);
        const paidOrders = rows.reduce((sum, row) => sum + row.paidOrders, 0);
        const paidRevenue = rows.reduce((sum, row) => sum + row.paidRevenueInr, 0);

        return {
          impressions,
          // Summary cards should reflect real successful payments, not event-fire counts.
          conversions: paidOrders,
          bounces,
          checkouts_started: checkoutsStarted,
          total_revenue: Number(paidRevenue.toFixed(2)),
        };
      };

      const windowStatsByVariant: Record<VariantKey, {
        impressions: number;
        conversions: number;
        bounces: number;
        checkouts_started: number;
        total_revenue: number;
      }> = {
        A: buildWindowStats("A"),
        B: buildWindowStats("B"),
      };

      const toRouteRows = (variant: VariantKey): RouteStatsRow[] => {
        const routes = Array.from(routeAccumulators[variant].values());
        const flowOrderMap = new Map<string, number>(
          (isOnboardingLayoutTest ? ONBOARDING_FLOW_ROUTES[variant] : [])
            .map((route, index) => [canonicalizeTrackedRoute(route), index + 1])
        );
        routes.sort((left, right) => {
          const leftFlowIndex = flowOrderMap.get(left.route);
          const rightFlowIndex = flowOrderMap.get(right.route);
          if (leftFlowIndex !== undefined || rightFlowIndex !== undefined) {
            if (leftFlowIndex === undefined) return 1;
            if (rightFlowIndex === undefined) return -1;
            if (leftFlowIndex !== rightFlowIndex) return leftFlowIndex - rightFlowIndex;
          }
          const leftPriority = left.route === pricingRoutes[variant] ? 0 : left.route === upsellRoutes[variant] ? 1 : 2;
          const rightPriority = right.route === pricingRoutes[variant] ? 0 : right.route === upsellRoutes[variant] ? 1 : 2;
          if (leftPriority !== rightPriority) return leftPriority - rightPriority;
          return right.impressions - left.impressions;
        });

        return routes.map((row) => {
          const impressions = row.impressions;
          const checkoutRate = impressions > 0 ? (row.checkoutsStarted / impressions) * 100 : 0;
          const conversionRate = impressions > 0 ? (row.trackedBundleConversions / impressions) * 100 : 0;
          const bounceRate = impressions > 0 ? (row.bounces / impressions) * 100 : 0;
          const checkoutToConversionRate = row.checkoutsStarted > 0
            ? (row.trackedBundleConversions / row.checkoutsStarted) * 100
            : 0;
          const upsellAttachRate = row.paidOrders > 0 ? (row.upsellOrders / row.paidOrders) * 100 : 0;

          const routeAudienceFromImpressions = routeImpressionVisitorSets[variant].get(row.route)?.size || 0;
          return {
            route: row.route,
            assignedUsers: assignmentsByVariant[variant],
            uniqueAudience: Math.max(routeAudienceFromImpressions, row.visitorIds.size),
            impressions,
            checkoutsStarted: row.checkoutsStarted,
            trackedBundleConversions: row.trackedBundleConversions,
            bounces: row.bounces,
            bounceRate: bounceRate.toFixed(2),
            checkoutStartRate: checkoutRate.toFixed(2),
            trackedConversionRate: conversionRate.toFixed(2),
            trackedCheckoutToConversionRate: checkoutToConversionRate.toFixed(2),
            trackedRevenueInr: Number(row.trackedRevenueInr.toFixed(2)),
            paidOrders: row.paidOrders,
            paidRevenueInr: Number(row.paidRevenueInr.toFixed(2)),
            upsellOrders: row.upsellOrders,
            upsellRevenueInr: Number(row.upsellRevenueInr.toFixed(2)),
            upsellAttachRate: upsellAttachRate.toFixed(2),
          };
        });
      };

      const toMixRows = (
        map: Map<string, { orders: number; buyers: Set<string>; revenueInr: number }>
      ): MixSummaryRow[] =>
        Array.from(map.entries())
          .map(([item, values]) => ({
            item,
            orders: values.orders,
            buyers: values.buyers.size,
            revenueInr: Number(values.revenueInr.toFixed(2)),
          }))
          .sort((a, b) => b.orders - a.orders);

      const routeStats = {
        A: toRouteRows("A"),
        B: toRouteRows("B"),
      };

      const routeStatsByVariant = {
        A: new Map(routeStats.A.map((row) => [row.route, row] as const)),
        B: new Map(routeStats.B.map((row) => [row.route, row] as const)),
      };

      const countIntersection = (left: Set<string>, right: Set<string>) => {
        if (left.size === 0 || right.size === 0) return 0;
        let count = 0;
        const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
        for (const value of smaller) {
          if (larger.has(value)) count += 1;
        }
        return count;
      };

      const orderedFunnelFlow: Record<VariantKey, FunnelFlowStepRow[]> = (["A", "B"] as VariantKey[]).reduce(
        (acc, variant) => {
          const flowRoutes = isOnboardingLayoutTest
            ? ONBOARDING_FLOW_ROUTES[variant]
            : [pricingRoutes[variant], upsellRoutes[variant]];

          const rows: FunnelFlowStepRow[] = [];
          let previousContinued = 0;

          flowRoutes.forEach((route, index) => {
            const canonicalRoute = canonicalizeTrackedRoute(route);
            const routeRow = routeStatsByVariant[variant].get(canonicalRoute);
            const visitorSet = routeImpressionVisitorSets[variant].get(canonicalRoute) || new Set<string>();
            const nextRoute = flowRoutes[index + 1];
            const nextVisitorSet = nextRoute
              ? routeImpressionVisitorSets[variant].get(canonicalizeTrackedRoute(nextRoute)) || new Set<string>()
              : new Set<string>();
            const impressionCount = routeImpressionCounts[variant].get(canonicalRoute) || routeRow?.impressions || 0;

            // Use unique audience (not raw impression count) to avoid inflated late-step audiences.
            const rawAudience = routeRow?.uniqueAudience || visitorSet.size || impressionCount || 0;
            const audience =
              index === 0
                ? rawAudience
                : previousContinued > 0
                  ? Math.min(rawAudience, previousContinued)
                  : rawAudience;

            const rawContinuedToNext = nextRoute ? countIntersection(visitorSet, nextVisitorSet) : 0;
            // Bounce/drop-off in ordered funnel view must reflect actual progression
            // to the next route (not payment/checkouts), otherwise bundle-pricing
            // can incorrectly show 0% bounce despite real route exits.
            const continuedToNext = nextRoute ? Math.min(audience, rawContinuedToNext) : 0;
            const dropOffs = nextRoute ? Math.max(audience - continuedToNext, 0) : 0;
            const bounceRate = audience > 0 ? ((dropOffs / audience) * 100).toFixed(2) : "0.00";

            rows.push({
              step: index + 1,
              route: canonicalRoute,
              audience,
              impressions: impressionCount,
              continuedToNext,
              dropOffs,
              bounceRate,
              checkoutsStarted: routeRow?.checkoutsStarted || 0,
              trackedBundleConversions: routeRow?.trackedBundleConversions || 0,
              paidOrders: routeRow?.paidOrders || 0,
              paidRevenueInr: routeRow?.paidRevenueInr || 0,
              upsellOrders: routeRow?.upsellOrders || 0,
              upsellRevenueInr: routeRow?.upsellRevenueInr || 0,
            });

            previousContinued = continuedToNext;
          });

          acc[variant] = rows;
          return acc;
        },
        { A: [], B: [] } as Record<VariantKey, FunnelFlowStepRow[]>
      );

      const bundleBreakdown = {
        A: toMixRows(bundleMixMaps.A),
        B: toMixRows(bundleMixMaps.B),
      };
      const upsellBreakdown = {
        A: toMixRows(upsellMixMaps.A),
        B: toMixRows(upsellMixMaps.B),
      };

      const funnelSummary = (["A", "B"] as VariantKey[]).reduce<Record<VariantKey, FunnelDecisionSummary>>(
        (acc, variant) => {
          const assignedUsers = assignmentsByVariant[variant];
          const bundleBuyers = bundleBuyerSets[variant].size;
          const upsellBuyers = upsellBuyerSets[variant].size;
          const bundleRevenueInr = bundleBreakdown[variant].reduce((sum, row) => sum + row.revenueInr, 0);
          const upsellRevenueInr = upsellBreakdown[variant].reduce((sum, row) => sum + row.revenueInr, 0);
          const totalRevenueInr = bundleRevenueInr + upsellRevenueInr;

          acc[variant] = {
            assignedUsers,
            bundleBuyers,
            upsellBuyers,
            upsellAttachRate: bundleBuyers > 0 ? ((upsellBuyers / bundleBuyers) * 100).toFixed(2) : "0.00",
            bundleRevenueInr: Number(bundleRevenueInr.toFixed(2)),
            upsellRevenueInr: Number(upsellRevenueInr.toFixed(2)),
            totalRevenueInr: Number(totalRevenueInr.toFixed(2)),
            avgRevenuePerBundleBuyerInr: bundleBuyers > 0 ? (totalRevenueInr / bundleBuyers).toFixed(2) : "0.00",
          };
          return acc;
        },
        {} as Record<VariantKey, FunnelDecisionSummary>
      );
      
      return NextResponse.json({
        test: resolvedTestData,
        analyticsWindowStart: trackingStartIso,
        appliedDateRange: {
          start: dateRangeStartIso,
          end: dateRangeEndIso,
        },
        appliedCostaRicaDateRange: {
          startDate: safeStartDate,
          endDate: safeEndDate,
          timezoneNote: "Costa Rica business day (UTC-6), aligned to IST 11:30 AM to next day 11:29 AM",
        },
        stats: {
          A: calculateRates(windowStatsByVariant.A, assignmentsACount),
          B: calculateRates(windowStatsByVariant.B, assignmentsBCount),
        },
        dailyBreakdown,
        recentEvents,
        routeStats,
        orderedFunnelFlow,
        bundlePurchases: bundlePurchases
          .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
          .slice(0, 250),
        upsellPurchases: upsellPurchases
          .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
          .slice(0, 250),
        bundleBreakdown,
        upsellBreakdown,
        funnelSummary,
      });
    }

    // Get all tests
    const { data: allTests } = await supabase.from("ab_tests").select("*");
    const hydratedTests = [...(allTests || [])];
      if (!hydratedTests.some((test) => test.id === onboardingTestId)) {
      const { data: onboardingTest } = await supabase
        .from("ab_tests")
        .select("*")
        .eq("id", onboardingTestId)
        .single();
        if (onboardingTest) hydratedTests.push(onboardingTest);
      }
      if (!hydratedTests.some((test) => test.id === paywallGstTestId)) {
        const { data: paywallGstTest } = await supabase
          .from("ab_tests")
          .select("*")
          .eq("id", paywallGstTestId)
          .single();
        if (paywallGstTest) hydratedTests.push(paywallGstTest);
      }
      if (!hydratedTests.some((test) => test.id === paywallCosmicBundleTestId)) {
        const { data: paywallCosmicBundleTest } = await supabase
          .from("ab_tests")
          .select("*")
          .eq("id", paywallCosmicBundleTestId)
          .single();
        if (paywallCosmicBundleTest) hydratedTests.push(paywallCosmicBundleTest);
      }
    const tests = [];

    for (const testRow of hydratedTests) {
      const normalizedTest = normalizeTestForResponse(testRow, String(testRow.id));
      const { data: sA } = await supabase.from("ab_test_stats").select("*").eq("id", `${normalizedTest.id}_A`).single();
      const { data: sB } = await supabase.from("ab_test_stats").select("*").eq("id", `${normalizedTest.id}_B`).single();
      const [{ count: assignmentsA = 0 }, { count: assignmentsB = 0 }] = await Promise.all([
        supabase
          .from("ab_test_assignments")
          .select("*", { count: "exact", head: true })
          .eq("test_id", normalizedTest.id)
          .eq("variant", "A"),
        supabase
          .from("ab_test_assignments")
          .select("*", { count: "exact", head: true })
          .eq("test_id", normalizedTest.id)
          .eq("variant", "B"),
      ]);
      const assignmentsACount = Number(assignmentsA ?? 0);
      const assignmentsBCount = Number(assignmentsB ?? 0);

      const aData = sA || { impressions: 0, conversions: 0 };
      const bData = sB || { impressions: 0, conversions: 0 };
      const variantAImpressions = Math.max(aData.impressions || 0, assignmentsACount);
      const variantBImpressions = Math.max(bData.impressions || 0, assignmentsBCount);

      tests.push({
        ...normalizedTest,
        quickStats: {
          totalImpressions: variantAImpressions + variantBImpressions,
          totalConversions: (aData.conversions || 0) + (bData.conversions || 0),
          variantAConversionRate: variantAImpressions > 0 
            ? ((aData.conversions / variantAImpressions) * 100).toFixed(2) 
            : "0.00",
          variantBConversionRate: variantBImpressions > 0 
            ? ((bData.conversions / variantBImpressions) * 100).toFixed(2) 
            : "0.00",
        },
      });
    }

    return NextResponse.json({ tests });
  } catch (error) {
    console.error("Admin A/B tests error:", error);
    return NextResponse.json(
      { error: "Failed to get A/B tests" },
      { status: 500 }
    );
  }
}

// Update test configuration
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { testId, status, variants, name, resetAnalytics } = body;

    if (!testId) {
      return NextResponse.json({ error: "testId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    
    if (resetAnalytics) {
      await supabase.from("ab_test_stats").delete().eq("id", `${testId}_A`);
      await supabase.from("ab_test_stats").delete().eq("id", `${testId}_B`);
      await supabase.from("ab_test_events").delete().eq("test_id", testId);
      await supabase.from("ab_test_assignments").delete().eq("test_id", testId);
      
      await supabase.from("ab_tests").update({
        last_reset_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", testId);
      
      return NextResponse.json({
        success: true,
        message: "Analytics reset successfully. All stats, events, and user assignments have been cleared.",
      });
    }

    let nextTrafficSplit: number | null = null;
    if (variants) {
      const totalWeight = Object.values(variants).reduce(
        (sum: number, v: any) => sum + (v.weight || 0),
        0
      );
      
      if (totalWeight !== 100) {
        return NextResponse.json(
          { error: "Variant weights must sum to 100" },
          { status: 400 }
        );
      }

      const nextBWeight = clampPercent(Number((variants as any)?.B?.weight ?? 50));
      nextTrafficSplit = nextBWeight / 100;
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (nextTrafficSplit !== null) updateData.traffic_split = nextTrafficSplit;
    if (variants) updateData.variants = variants;
    if (status) updateData.status = status;
    if (name) updateData.name = name;

    await supabase.from("ab_tests").upsert({ id: testId, ...updateData }, { onConflict: "id" });

    const { data: updatedTest } = await supabase.from("ab_tests").select("*").eq("id", testId).single();

    return NextResponse.json({
      success: true,
      test: normalizeTestForResponse(updatedTest, testId),
    });
  } catch (error) {
    console.error("Admin A/B test update error:", error);
    return NextResponse.json(
      { error: "Failed to update A/B test" },
      { status: 500 }
    );
  }
}

// Create new test
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testId, name, variants } = body;

    if (!testId || !name) {
      return NextResponse.json(
        { error: "testId and name are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase.from("ab_tests").select("id").eq("id", testId).single();
    if (existing) {
      return NextResponse.json(
        { error: "Test with this ID already exists" },
        { status: 400 }
      );
    }

    const splitFromPayload = variants
      ? clampPercent(Number((variants as any)?.B?.weight ?? 50)) / 100
      : 0.5;
    const testData = {
      id: testId,
      name,
      status: "active",
      traffic_split: splitFromPayload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await supabase.from("ab_tests").insert(testData);

    return NextResponse.json({
      success: true,
      test: normalizeTestForResponse(testData, testId),
    });
  } catch (error) {
    console.error("Admin A/B test create error:", error);
    return NextResponse.json(
      { error: "Failed to create A/B test" },
      { status: 500 }
    );
  }
}

// Delete test
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("testId");

    if (!testId) {
      return NextResponse.json({ error: "testId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    await supabase.from("ab_tests").delete().eq("id", testId);
    await supabase.from("ab_test_stats").delete().eq("id", `${testId}_A`);
    await supabase.from("ab_test_stats").delete().eq("id", `${testId}_B`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin A/B test delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete A/B test" },
      { status: 500 }
    );
  }
}
