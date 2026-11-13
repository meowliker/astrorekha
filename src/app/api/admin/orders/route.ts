import {withAdminAccess} from "@/lib/admin-access";
import { parseAdSource, matchesAdSource, acquisitionChannel, acquisitionTouch, isAcquisitionTest } from "@/lib/admin-acquisition";
import { NextRequest, NextResponse } from "next/server";
import { isStandaloneSoulmatePayment } from "@/lib/admin-order-funnel";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING, normalizePricing, type PricingConfig } from "@/lib/pricing";
import { CHAT_UNLIMITED_PASS_NAME, CHAT_UNLIMITED_PASS_TYPE } from "@/lib/chat-unlimited-pass";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PaymentRow = {
  id: string;
  payu_txn_id: string | null;
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
    coins: "Questions",
    chat_pass: "Chat Pass",
    report: "Report",
    unknown: "Unknown",
  };
  return labels[normalized] || normalized.replace(/_/g, " ");
}

function coinsToQuestionCount(coins: number): number {
  return Math.floor(Math.max(0, coins) / 3);
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
    vastuShastraGuide: "Complete Vastu Shastra Guide Ebook",
    auraColorReport: "Aura Color Quiz",
    astrocartographyReport: "Astrocartography",
    pastLifeReport: "Past Life Report",
    numerologyReport: "Numerology Report",
    spiritAnimalReport: "Spirit Animal Report",
    witchArchetypeReport: "Witch Archetype Report",
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
          pricing.coinPackages.map((pkg) => ({ id: pkg.id, name: `${coinsToQuestionCount(pkg.coins)} Questions` })),
          bundleTokens[0]
        )
      : null;
    const questions = coinsToQuestionCount(coins);
    return [packageName || `${questions || "Question"} Questions`];
  }

  if (type === CHAT_UNLIMITED_PASS_TYPE) {
    return [CHAT_UNLIMITED_PASS_NAME];
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

async function handleGET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const token = request.headers.get("x-admin-session") || searchParams.get("token");

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

    const adSource = parseAdSource(searchParams);
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

    const pricing = await getPricingConfig(supabase);
    const names = Object.fromEntries([
      ...pricing.bundles, ...pricing.upsells, ...pricing.reports,
      ...pricing.coinPackages.map(pkg => ({id:pkg.id,name:`${coinsToQuestionCount(pkg.coins)} Questions`})),
    ].map(item => [item.id, item.name]));
    for (const feature of ["palmReading","birthChart","prediction2026","compatibilityTest","soulmateSketch","futurePartnerReport","vastuShastraGuide","auraColorReport","astrocartographyReport","pastLifeReport","numerologyReport","spiritAnimalReport","witchArchetypeReport"]) names[feature] = featureToName(feature);
    // Supabase filters and paginates the authoritative records; no stale copies or payment hooks.
    const fast = await supabase.rpc("read_admin_main_orders", {
      p_source:adSource, p_start:startDate ? getIstBoundaryUtcIso(startDate) : null,
      p_end:endDate ? getIstBoundaryUtcIso(endDate,true) : null,
      p_type:typeFilter, p_search:search, p_page:page, p_size:pageSize, p_names:names,
    });
    if (!fast.error) {
      const total = Number(fast.data.total);
      const orders = (fast.data.rows as (PaymentRow & {email:string;customer_name:string;ad_source:string})[]).map(payment => {
        const items=resolveItems(payment,pricing), type=normalizeType(payment.type);
        return {id:payment.id,userId:payment.user_id || "-",email:payment.email,customerName:payment.customer_name,
          dateOfPurchase:payment.created_at,type,typeLabel:formatType(type),amount:amountPaiseToInr(payment.amount),
          currency:payment.currency || "INR",items,itemCount:items.length,ad_source:payment.ad_source};
      });
      return NextResponse.json({orders,total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize))});
    }
    // Allows safe code rollback/rolling deploy. Other DB errors must not masquerade as empty orders.
    if (!["PGRST202","42883"].includes(fast.error.code)) throw fast.error;
    // Read all matching pages before filtering/counting; Supabase caps each response.
    async function readPayments(): Promise<PaymentRow[]> {
      const rows: PaymentRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        if (offset >= 100000) throw new Error("Choose a shorter date range to view these orders.");
        let query = supabase.from("payments")
          .select("id, payu_txn_id, user_id, type, bundle_id, feature, coins, customer_email, amount, currency, created_at, landing_url, landing_path, utm_source, utm_medium, utm_campaign, meta_campaign_id, meta_adset_id, meta_ad_id, last_touch")
          .in("payment_status", PAID_PAYMENT_STATUSES);
        if (startDate) query = query.gte("created_at", getIstBoundaryUtcIso(startDate, false));
        if (endDate) query = query.lte("created_at", getIstBoundaryUtcIso(endDate, true));
        const result = await query.order("created_at", { ascending: false }).order("id")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        rows.push(...(result.data as PaymentRow[]).filter((row) => !isStandaloneSoulmatePayment(row) && matchesAdSource(row, adSource)));
        if (result.data.length < 1000) return rows;
      }
    }

    const payments = await readPayments();

    const users: UserRow[] = [];
    const userIds = [...new Set(payments.map(p=>p.user_id).filter((id): id is string=>!!id))];
    for(let i=0;i<userIds.length;i+=200) {
      const result=await supabase.from("users").select("id,email,name").in("id",userIds.slice(i,i+200));
      if(result.error) throw result.error;
      users.push(...(result.data || []));
    }
    const userMap = new Map<string, UserRow>();
    for (const user of users) {
      userMap.set(user.id, user);
    }

    const orders = payments
      .map((payment) => {
        const user = payment.user_id ? userMap.get(payment.user_id) : null;
        const items = resolveItems(payment, pricing);
        const type = normalizeType(payment.type);
        return {
          ad_source: isAcquisitionTest(payment) ? "test" : acquisitionChannel(acquisitionTouch(payment)),
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

export const GET=withAdminAccess(handleGET);
