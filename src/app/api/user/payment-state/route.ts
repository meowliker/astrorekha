import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { reconcilePaidPaymentsForEmail } from "@/lib/payment-reconciliation";

export const dynamic = "force-dynamic";

const SUCCESS_STATUSES = ["paid", "success", "captured"];
const BUNDLE_PAYMENT_TYPES = ["bundle", "bundle_payment"];

export async function GET(request: NextRequest) {
  try {
    const emailParam = request.nextUrl.searchParams.get("email");
    const userIdParam = request.nextUrl.searchParams.get("userId");
    if (!emailParam && !userIdParam) {
      return NextResponse.json({ error: "email or userId is required" }, { status: 400 });
    }

    const email = emailParam?.toLowerCase().trim() || "";
    const userId = userIdParam?.trim() || "";
    if (!email && !userId) {
      return NextResponse.json({ error: "Invalid email or userId" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    let user: any = null;

    if (email) {
      const { data } = await supabase
        .from("users")
        .select("id, email, password_hash, bundle_purchased, payment_status")
        .eq("email", email)
        .limit(1)
        .maybeSingle();
      if (data) user = data;
    }

    if (!user && userId) {
      const { data } = await supabase
        .from("users")
        .select("id, email, password_hash, bundle_purchased, payment_status")
        .eq("id", userId)
        .limit(1)
        .maybeSingle();
      if (data) user = data;
    }

    const paidByEmailPromise = email
      ? supabase
          .from("payments")
          .select("id, type, bundle_id, payment_status, user_id, created_at")
          .eq("customer_email", email)
          .in("payment_status", SUCCESS_STATUSES)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as any[] });

    const paidByUserPromise = userId
      ? supabase
          .from("payments")
          .select("id, type, bundle_id, payment_status, user_id, created_at")
          .eq("user_id", userId)
          .in("payment_status", SUCCESS_STATUSES)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as any[] });

    const pendingByEmailPromise = email
      ? supabase
          .from("payments")
          .select("id")
          .eq("customer_email", email)
          .in("payment_status", ["created", "pending"])
          .limit(20)
      : Promise.resolve({ data: [] as any[] });

    const pendingByUserPromise = userId
      ? supabase
          .from("payments")
          .select("id")
          .eq("user_id", userId)
          .in("payment_status", ["created", "pending"])
          .limit(20)
      : Promise.resolve({ data: [] as any[] });

    const [{ data: paidByEmail }, { data: paidByUser }, { data: pendingByEmail }, { data: pendingByUser }] =
      await Promise.all([paidByEmailPromise, paidByUserPromise, pendingByEmailPromise, pendingByUserPromise]);

    const paidMap = new Map<string, any>();
    [...(paidByEmail || []), ...(paidByUser || [])].forEach((row: any) => {
      if (row?.id) paidMap.set(row.id, row);
    });
    const paidPayments = Array.from(paidMap.values());

    const pendingMap = new Map<string, any>();
    [...(pendingByEmail || []), ...(pendingByUser || [])].forEach((row: any) => {
      if (row?.id) pendingMap.set(row.id, row);
    });
    const pendingPayments = Array.from(pendingMap.values());

    const hasPaidPayment = paidPayments.length > 0;
    const hasPaidBundlePayment = paidPayments.some((payment: any) => {
      const type = (payment?.type || "").toLowerCase().trim();
      return BUNDLE_PAYMENT_TYPES.includes(type);
    });
    const hasPendingPayment = pendingPayments.length > 0;

    let latestBundleId: string | null = null;
    for (const p of paidPayments) {
      if ((p.type === "bundle" || p.type === "bundle_payment") && p.bundle_id) {
        latestBundleId = p.bundle_id;
        break;
      }
    }

    if (hasPaidPayment && user?.id && email) {
      try {
        const reconciliation = await reconcilePaidPaymentsForEmail({
          supabase,
          userId: user.id,
          email,
        });
        if (!latestBundleId && reconciliation.latestBundleId) {
          latestBundleId = reconciliation.latestBundleId;
        }
      } catch (error) {
        console.error("[payment-state] reconciliation error:", error);
      }
    }

    return NextResponse.json({
      success: true,
      email: email || null,
      requestedUserId: userId || null,
      hasPaidPayment,
      hasPaidBundlePayment,
      hasPendingPayment,
      hasRegisteredAccount: !!user?.password_hash,
      latestBundleId,
      userId: user?.id || null,
      paymentStatus: user?.payment_status || null,
    });
  } catch (error: any) {
    console.error("[payment-state] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to check payment state" },
      { status: 500 }
    );
  }
}
