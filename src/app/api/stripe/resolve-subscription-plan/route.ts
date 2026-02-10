import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function planFromPriceId(priceId?: string | null): "weekly" | "monthly" | "yearly" | null {
  if (!priceId) return null;
  if (process.env.STRIPE_PRICE_WEEKLY && priceId === process.env.STRIPE_PRICE_WEEKLY) return "weekly";
  if (process.env.STRIPE_PRICE_MONTHLY && priceId === process.env.STRIPE_PRICE_MONTHLY) return "monthly";
  if (process.env.STRIPE_PRICE_YEARLY && priceId === process.env.STRIPE_PRICE_YEARLY) return "yearly";
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { userId, subscriptionId } = await request.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    const adminDb = getAdminDb();

    let resolvedSubId = subscriptionId as string | undefined;
    let resolvedUserId = userId as string | undefined;

    if (!resolvedSubId && resolvedUserId) {
      const snap = await adminDb.collection("users").doc(resolvedUserId).get();
      if (snap.exists) {
        resolvedSubId = (snap.data() as any)?.stripeSubscriptionId || undefined;
      }
    }

    if (!resolvedSubId) {
      return NextResponse.json({ plan: null });
    }

    const subscription = await stripe.subscriptions.retrieve(resolvedSubId);
    const subData: any = subscription;

    const metaPlan = subData?.metadata?.plan || null;
    const priceId = subData?.items?.data?.[0]?.price?.id || null;

    const plan = (metaPlan === "weekly" || metaPlan === "monthly" || metaPlan === "yearly")
      ? metaPlan
      : planFromPriceId(priceId);

    if (resolvedUserId && plan) {
      const now = new Date().toISOString();
      await adminDb
        .collection("users")
        .doc(resolvedUserId)
        .set(
          {
            subscriptionPlan: plan,
            subscriptionStatus: subData.status || "active",
            stripeSubscriptionId: subscription.id,
            updatedAt: now,
          },
          { merge: true }
        );
    }

    return NextResponse.json({ plan });
  } catch (error: any) {
    console.error("Resolve subscription plan error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to resolve plan" },
      { status: 500 }
    );
  }
}
