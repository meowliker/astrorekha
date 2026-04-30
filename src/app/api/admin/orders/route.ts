import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING, normalizePricing, type PricingConfig } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PaymentRow = {
  id: string;
  user_id: string | null;
  type: string | null;
  bundle_id: string | null;
  feature: string | null;
  coins: number | null;
  customer_email: string | null;
  amount: number | null;
  currency: string | null;
  created_at: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
};

const PAID_PAYMENT_STATUSES = ["paid", "success", "captured"];
const IST_OFFSET_MINUTES = 330;

function normalizeType(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bundle") return "bundle_payment";
  return normalized || "unknown";
}

function formatType(value: unknown): string {
  const normalized = normalizeType(value);
  const labels: Record<string, string> = {
    bundle_payment: "Bundle",
    upsell: "Upsell",
    coins: "Coins",
    report: "Report",
    unknown: "Unknown",
  };
  return labels[normalized] || normalized.replace(/_/g, " ");
}

function amountPaiseToInr(value: unknown): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

async function getPricingConfig(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<PricingConfig> {
  const { data } = await supabase.from("settings").select("value").eq("key", "pricing").maybeSingle();
  return normalizePricing(data?.value || DEFAULT_PRICING);
}

function findNameById<T extends { id: string; name: string }>(rows: T[], id: string): string | null {
  return rows.find((row) => row.id === id)?.name || null;
}

function featureToName(feature: string): string {
  const labels: Record<string, string> = {
    palmReading: "Palm Reading",
    prediction2026: "2026 Future Predictions",
    birthChart: "Birth Chart Report",
    compatibilityTest: "Compatibility Report",
    soulmateSketch: "Soulmate Sketch",
    futurePartnerReport: "Future Partner Report",
  };
  return labels[feature] || feature.replace(/([A-Z])/g, " $1").trim();
}

function splitTokens(value: string | null | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getIstBoundaryUtcIso(isoDate: string, endOfDay = false): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number(part));
  const istBoundaryUtcMs = Date.UTC(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  ) - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(istBoundaryUtcMs).toISOString();
}

function resolveItems(payment: PaymentRow, pricing: PricingConfig): string[] {
  const type = normalizeType(payment.type);
  const bundleTokens = splitTokens(payment.bundle_id);
  const featureTokens = splitTokens(payment.feature);

  if (type === "bundle_payment") {
    const bundleId = bundleTokens[0] || "";
    return [findNameById(pricing.bundles, bundleId) || featureToName(bundleId) || "Bundle Purchase"];
  }

  if (type === "coins") {
    const coins = Number(payment.coins || 0);
    const packageName = bundleTokens[0]
      ? findNameById(
          pricing.coinPackages.map((pkg) => ({ id: pkg.id, name: `${pkg.coins} Coins` })),
          bundleTokens[0]
        )
      : null;
    return [packageName || `${coins || "Coin"} Coins`];
  }

  if (type === "report") {
    const reportItems = bundleTokens
      .map((id) => findNameById(pricing.reports, id) || null)
      .filter((name): name is string => !!name);
    const featureItems = featureTokens.map(featureToName);
    return [...reportItems, ...featureItems].filter(Boolean);
  }

  if (type === "upsell") {
    const upsellItems = bundleTokens.map((id) => {
      return (
        findNameById(pricing.upsells, id) ||
        findNameById(pricing.reports, id) ||
        featureToName(id)
      );
    });
    const featureItems = featureTokens.map(featureToName);
    return [...upsellItems, ...featureItems].filter(Boolean);
  }

  const fallbackItems = [...bundleTokens, ...featureTokens].map(featureToName).filter(Boolean);
  return fallbackItems.length > 0 ? fallbackItems : ["Order item"];
}

function matchesSearch(order: {
  id: string;
  userId: string;
  email: string;
  type: string;
  items: string[];
}, search: string): boolean {
  if (!search) return true;
  const haystack = [
    order.id,
    order.userId,
    order.email,
    order.type,
    ...order.items,
  ].join(" ").toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to fetch orders";
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: sessionData } = await supabase
      .from("admin_sessions")
      .select("id, expires_at")
      .eq("id", token)
      .maybeSingle();

    if (!sessionData || new Date(sessionData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const search = searchParams.get("search")?.trim() || "";
    const typeFilter = normalizeType(searchParams.get("type") || "all");
    let startDate = searchParams.get("startDate") || "";
    let endDate = searchParams.get("endDate") || "";
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 50)));

    if (startDate && !isIsoDate(startDate)) {
      return NextResponse.json({ error: "Invalid startDate format. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (endDate && !isIsoDate(endDate)) {
      return NextResponse.json({ error: "Invalid endDate format. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (startDate && !endDate) endDate = startDate;
    if (startDate && endDate && endDate < startDate) {
      [startDate, endDate] = [endDate, startDate];
    }

    let paymentsQuery = supabase
      .from("payments")
      .select("id, user_id, type, bundle_id, feature, coins, customer_email, amount, currency, created_at")
      .in("payment_status", PAID_PAYMENT_STATUSES);

    if (startDate) {
      paymentsQuery = paymentsQuery.gte("created_at", getIstBoundaryUtcIso(startDate, false));
    }
    if (endDate) {
      paymentsQuery = paymentsQuery.lte("created_at", getIstBoundaryUtcIso(endDate, true));
    }

    const [pricing, paymentsResult, usersResult] = await Promise.all([
      getPricingConfig(supabase),
      paymentsQuery
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("users").select("id, email, name"),
    ]);

    if (paymentsResult.error) {
      throw paymentsResult.error;
    }

    const userMap = new Map<string, UserRow>();
    for (const user of (usersResult.data || []) as UserRow[]) {
      userMap.set(user.id, user);
    }

    const orders = ((paymentsResult.data || []) as PaymentRow[])
      .map((payment) => {
        const user = payment.user_id ? userMap.get(payment.user_id) : null;
        const items = resolveItems(payment, pricing);
        const type = normalizeType(payment.type);
        return {
          id: payment.id,
          userId: payment.user_id || "-",
          email: user?.email || payment.customer_email || "Unknown",
          customerName: user?.name || "",
          dateOfPurchase: payment.created_at,
          type,
          typeLabel: formatType(type),
          amount: amountPaiseToInr(payment.amount),
          currency: payment.currency || "INR",
          items,
          itemCount: items.length,
        };
      })
      .filter((order) => {
        if (typeFilter !== "all" && order.type !== typeFilter) return false;
        return matchesSearch(order, search);
      });

    const total = orders.length;
    const start = (page - 1) * pageSize;
    const pagedOrders = orders.slice(start, start + pageSize);

    return NextResponse.json({
      orders: pagedOrders,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error: unknown) {
    console.error("Admin orders API error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
