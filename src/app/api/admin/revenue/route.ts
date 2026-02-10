import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    
    // Get session token and flow filter from query params
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const flowFilter = searchParams.get("flow") || "all"; // "all", "flow-a", "flow-b"
    const startDateParam = searchParams.get("startDate"); // YYYY-MM-DD
    const endDateParam = searchParams.get("endDate"); // YYYY-MM-DD
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized - No token provided" }, { status: 401 });
    }
    
    // Verify admin session token
    const sessionDoc = await adminDb.collection("admin_sessions").doc(token).get();
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: "Unauthorized - Invalid session" }, { status: 401 });
    }
    
    const sessionData = sessionDoc.data();
    if (new Date(sessionData?.expiresAt) < new Date()) {
      // Session expired, delete it
      await adminDb.collection("admin_sessions").doc(token).delete();
      return NextResponse.json({ error: "Session expired - Please login again" }, { status: 401 });
    }
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Fetch all payments
    const paymentsSnapshot = await adminDb.collection("payments").orderBy("createdAt", "desc").get();
    const allPayments: any[] = [];
    paymentsSnapshot.forEach(doc => {
      allPayments.push({ id: doc.id, ...doc.data() });
    });
    
    // Filter payments by flow
    const payments = flowFilter === "all" 
      ? allPayments 
      : allPayments.filter(p => {
          const paymentFlow = p.flow || (p.type === "bundle_payment" ? "flow-b" : "flow-a");
          return paymentFlow === flowFilter;
        });
    
    // Calculate flow breakdown for summary
    const flowAPayments = allPayments.filter(p => (p.flow || "flow-a") === "flow-a" && p.type !== "bundle_payment");
    const flowBPayments = allPayments.filter(p => p.flow === "flow-b" || p.type === "bundle_payment");
    
    const flowBreakdown = {
      flowA: {
        payments: flowAPayments.length,
        revenue: flowAPayments.reduce((sum, p) => sum + ((p.amountTotal || p.amount || 0) / 100), 0),
        type: "subscription",
      },
      flowB: {
        payments: flowBPayments.length,
        revenue: flowBPayments.reduce((sum, p) => sum + ((p.amountTotal || p.amount || 0) / 100), 0),
        type: "one-time",
      },
    };
    
    // Fetch subscriptions directly from Stripe for accurate data
    // Fetch ALL statuses separately to ensure we get everything
    const stripeSubscriptions: Map<string, any> = new Map();
    try {
      // Stripe statuses: trialing, active, past_due, canceled, unpaid, incomplete, incomplete_expired, paused
      const statusesToFetch: Stripe.SubscriptionListParams["status"][] = [
        "trialing",
        "active", 
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
      ];
      
      const allSubscriptions: Stripe.Subscription[] = [];
      
      for (const status of statusesToFetch) {
        const subs = await stripe.subscriptions.list({
          limit: 100,
          status,
          expand: ["data.customer"],
        });
        allSubscriptions.push(...subs.data);
      }
      
      // Priority order for duplicate emails: active > trialing > past_due > others > canceled
      const statusPriority: Record<string, number> = {
        active: 5,
        trialing: 4,
        past_due: 3,
        unpaid: 2,
        incomplete: 1,
        canceled: 0,
      };
      
      for (const sub of allSubscriptions) {
        const customer = sub.customer as Stripe.Customer;
        if (customer && customer.email) {
          const email = customer.email.toLowerCase();
          const existing = stripeSubscriptions.get(email);
          const currentPriority = statusPriority[sub.status] ?? 0;
          const existingPriority = existing ? (statusPriority[existing.status] ?? 0) : -1;
          
          // Only store if higher priority or not present
          if (currentPriority > existingPriority) {
            stripeSubscriptions.set(email, {
              id: sub.id,
              status: sub.status, // trialing, active, canceled, past_due, etc.
              plan: (sub as any).metadata?.plan || null,
              currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
              currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
              trialStart: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
              trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
              created: new Date(sub.created * 1000).toISOString(),
              cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
              canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
              cancelAtPeriodEnd: sub.cancel_at_period_end, // true if scheduled to cancel at period end
            });
          }
        }
      }
      
      console.log(`Fetched ${stripeSubscriptions.size} unique subscriptions from Stripe`);
    } catch (stripeErr) {
      console.error("Failed to fetch Stripe subscriptions:", stripeErr);
    }
    
    // Fetch all users for subscriber data
    const usersSnapshot = await adminDb.collection("users").get();
    const users: any[] = [];
    const anonUsersWithSubscription: any[] = [];
    usersSnapshot.forEach(doc => {
      const userData = { id: doc.id, ...doc.data() };
      // Filter out anonymous users (they get migrated to real users after registration)
      // Anonymous users have IDs like "anon_123456" and should not be counted in metrics
      // to avoid double-counting the same subscriber
      if (!doc.id.startsWith("anon_")) {
        users.push(userData);
      } else if ((userData as any).subscriptionStatus === "active" || (userData as any).subscriptionStatus === "trialing") {
        // Track anonymous users who have subscriptions but haven't registered yet
        anonUsersWithSubscription.push(userData);
      }
    });
    
    // Helper to get payment amount (amountTotal is in cents from Stripe)
    const getAmount = (p: any) => {
      const amt = p.amountTotal || p.amount || 0;
      // Stripe amounts are ALWAYS in cents, so always convert to dollars
      return amt / 100;
    };
    
    // Calculate metrics
    const totalRevenue = payments.reduce((sum, p) => sum + getAmount(p), 0);
    
    // Revenue by period
    const revenueToday = payments
      .filter(p => new Date(p.createdAt) >= startOfToday)
      .reduce((sum, p) => sum + getAmount(p), 0);
    
    const revenueThisWeek = payments
      .filter(p => new Date(p.createdAt) >= startOfWeek)
      .reduce((sum, p) => sum + getAmount(p), 0);
    
    const revenueThisMonth = payments
      .filter(p => new Date(p.createdAt) >= startOfMonth)
      .reduce((sum, p) => sum + getAmount(p), 0);
    
    const revenueThisYear = payments
      .filter(p => new Date(p.createdAt) >= startOfYear)
      .reduce((sum, p) => sum + getAmount(p), 0);
    
    const revenueLastMonth = payments
      .filter(p => {
        const date = new Date(p.createdAt);
        return date >= startOfLastMonth && date <= endOfLastMonth;
      })
      .reduce((sum, p) => sum + getAmount(p), 0);
    
    // Billing cycle conversion constants (mathematically correct)
    const WEEKLY_TO_MONTHLY = 52 / 12; // 4.333
    const BIWEEKLY_TO_MONTHLY = 26 / 12; // 2.1667
    const FOURWEEKLY_TO_MONTHLY = 13 / 12; // 1.0833
    
    // NOTE: MRR calculation moved after Stripe enrichment to use accurate data
    // Placeholder values - will be calculated after enrichment
    let mrr = 0;
    let projectedMrr = 0;
    let arr = 0;
    let projectedArr = 0;
    
    // Revenue growth rate
    const momGrowth = revenueLastMonth > 0 
      ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(1)
      : "N/A";
    
    // Revenue by plan tier (including new trial plans)
    const revenueByPlan = {
      weekly: payments.filter(p => p.plan === "weekly").reduce((sum, p) => sum + getAmount(p), 0),
      monthly: payments.filter(p => p.plan === "monthly").reduce((sum, p) => sum + getAmount(p), 0),
      yearly: payments.filter(p => p.plan === "yearly").reduce((sum, p) => sum + getAmount(p), 0),
      "1week": payments.filter(p => p.plan === "1week").reduce((sum, p) => sum + getAmount(p), 0),
      "2week": payments.filter(p => p.plan === "2week").reduce((sum, p) => sum + getAmount(p), 0),
      "4week": payments.filter(p => p.plan === "4week").reduce((sum, p) => sum + getAmount(p), 0),
    };
    
    // Revenue by type (trial_subscription and trial_payment count as subscription)
    const revenueByType = {
      subscription: payments.filter(p => p.type === "subscription" || p.type === "trial_subscription" || p.type === "trial_payment" || !p.type).reduce((sum, p) => sum + getAmount(p), 0),
      coins: payments.filter(p => p.type === "coins").reduce((sum, p) => sum + getAmount(p), 0),
      reports: payments.filter(p => p.type === "report").reduce((sum, p) => sum + getAmount(p), 0),
      upsells: payments.filter(p => p.type === "upsell").reduce((sum, p) => sum + getAmount(p), 0),
    };
    
    // Subscriber counts - placeholder, will be calculated after Stripe enrichment
    let totalActiveSubscribers = 0;
    const newSubscribersThisMonth = users.filter(u => {
      const startedAt = u.subscriptionStartedAt ? new Date(u.subscriptionStartedAt) : null;
      return startedAt && startedAt >= startOfMonth && (u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing");
    }).length;
    
    const churnedSubscribersCount = users.filter(u => u.subscriptionCancelled === true).length;
    
    // ARPU (Average Revenue Per User)
    const uniquePayingUsers = new Set(payments.map(p => p.userId)).size;
    const arpu = uniquePayingUsers > 0 ? (totalRevenue / uniquePayingUsers).toFixed(2) : "0";
    
    // LTV (simplified: ARPU * average subscription length)
    const avgSubscriptionMonths = 6; // Estimate
    const ltv = (parseFloat(arpu) * avgSubscriptionMonths).toFixed(2);
    
    // Churn rate - placeholder, will be recalculated after Stripe enrichment
    let churnRate = "0";
    let retentionRate = "100";
    
    // Payment status breakdown
    const successfulPayments = payments.filter(p => p.status === "succeeded" || !p.status).length;
    const failedPayments = payments.filter(p => p.status === "failed").length;
    const refunds = payments.filter(p => p.status === "refunded").length;
    
    // Trial conversions - placeholder, will be recalculated after Stripe enrichment
    let trialsStarted = 0;
    let trialsConverted = 0;
    let trialConversionRate = "0";
    
    // Upsell analytics - breakdown by offer type
    const upsellPayments = payments.filter(p => p.type === "upsell");
    const upsellAnalytics: { [key: string]: { count: number; revenue: number } } = {};
    
    upsellPayments.forEach(p => {
      const offers = p.offers ? p.offers.split(",").map((s: string) => s.trim()) : ["unknown"];
      const amount = getAmount(p);
      
      offers.forEach((offer: string) => {
        if (!upsellAnalytics[offer]) {
          upsellAnalytics[offer] = { count: 0, revenue: 0 };
        }
        upsellAnalytics[offer].count += 1;
        upsellAnalytics[offer].revenue += amount / offers.length; // Split revenue among offers
      });
    });
    
    // Sort upsells by revenue (highest first)
    const upsellBreakdown = Object.entries(upsellAnalytics)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
    
    // Revenue over time (last 30 days) - use proper date comparison
    const revenueOverTime: { date: string; revenue: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const dateStr = dayStart.toISOString().split("T")[0];
      const dayRevenue = payments
        .filter(p => {
          if (!p.createdAt) return false;
          const paymentDate = new Date(p.createdAt);
          return paymentDate >= dayStart && paymentDate <= dayEnd;
        })
        .reduce((sum, p) => sum + getAmount(p), 0);
      revenueOverTime.push({ date: dateStr, revenue: dayRevenue });
    }
    
    // Subscription distribution - placeholder, will be recalculated after Stripe enrichment
    let subscriptionDistribution: Record<string, number> = {
      weekly: 0,
      monthly: 0,
      yearly: 0,
      "1week": 0,
      "2week": 0,
      "4week": 0,
    };
    
    // Cancelled subscribers list
    const cancelledSubscribers = users.filter(u => u.subscriptionCancelled === true);
    
    // Monthly churn rate (users who cancelled THIS MONTH)
    const churnedThisMonth = users.filter(u => {
      if (!u.subscriptionEndedAt || !u.subscriptionCancelled) return false;
      const endedAt = new Date(u.subscriptionEndedAt);
      return endedAt >= startOfMonth;
    }).length;
    const subscribersAtStartOfMonth = totalActiveSubscribers + churnedThisMonth;
    const monthlyChurnRate = subscribersAtStartOfMonth > 0 
      ? ((churnedThisMonth / subscribersAtStartOfMonth) * 100).toFixed(1)
      : "0";
    
    // Subscriber lists for tabs - merge Firebase data with Stripe data for accuracy
    // First, enrich user data with Stripe subscription info
    const firebaseEmails = new Set(users.map(u => (u.email || "").toLowerCase()));
    
    const enrichedUsers = users.map(u => {
      const email = (u.email || "").toLowerCase();
      const stripeSub = stripeSubscriptions.get(email);
      
      if (stripeSub) {
        // Use Stripe data as source of truth for subscription status and dates
        return {
          ...u,
          subscriptionStatus: stripeSub.status, // trialing, active, canceled, etc.
          subscriptionStartedAt: u.subscriptionStartedAt || stripeSub.created,
          trialEndsAt: stripeSub.trialEnd || u.trialEndsAt,
          currentPeriodEnd: stripeSub.currentPeriodEnd || u.currentPeriodEnd,
          stripeSubscriptionId: stripeSub.id,
          subscriptionPlan: u.subscriptionPlan || stripeSub.plan,
          cancelAtPeriodEnd: stripeSub.cancelAtPeriodEnd, // scheduled to cancel
          canceledAt: stripeSub.canceledAt, // when it was actually canceled
          subscriptionCancelled: stripeSub.status === "canceled", // override Firebase with Stripe truth
        };
      }
      return u;
    });
    
    // Add Stripe subscribers who don't have Firebase accounts (paid but not registered)
    // This ensures we show ALL subscribers from Stripe, not just those with Firebase accounts
    for (const [email, stripeSub] of stripeSubscriptions.entries()) {
      if (!firebaseEmails.has(email)) {
        // Create a virtual user entry for this Stripe subscriber
        enrichedUsers.push({
          id: `stripe_${stripeSub.id}`,
          email: email,
          name: "",
          subscriptionStatus: stripeSub.status,
          subscriptionStartedAt: stripeSub.created,
          trialEndsAt: stripeSub.trialEnd,
          currentPeriodEnd: stripeSub.currentPeriodEnd,
          stripeSubscriptionId: stripeSub.id,
          subscriptionPlan: stripeSub.plan,
          cancelAtPeriodEnd: stripeSub.cancelAtPeriodEnd,
          canceledAt: stripeSub.canceledAt,
          subscriptionCancelled: stripeSub.status === "canceled",
          isStripeOnly: true, // Flag to indicate no Firebase account
        });
      }
    }
    
    // Recalculate counts with enriched data
    // IMPORTANT: Only include users who have a verified Stripe subscription
    // This prevents showing users with stale Firebase data who don't exist in Stripe
    
    // Active = status is "active" AND exists in Stripe
    const enrichedActivePayingSubscribers = enrichedUsers.filter(u => {
      const email = (u.email || "").toLowerCase();
      const hasStripeSubscription = stripeSubscriptions.has(email);
      return hasStripeSubscription && u.subscriptionStatus === "active";
    });
    
    // Trialing = status is "trialing" AND exists in Stripe
    const enrichedTrialingSubscribers = enrichedUsers.filter(u => {
      const email = (u.email || "").toLowerCase();
      const hasStripeSubscription = stripeSubscriptions.has(email);
      return hasStripeSubscription && u.subscriptionStatus === "trialing";
    });
    
    // Cancelled = status is "canceled" AND exists in Stripe
    const enrichedCancelledSubscribers = enrichedUsers.filter(u => {
      const email = (u.email || "").toLowerCase();
      const hasStripeSubscription = stripeSubscriptions.has(email);
      return hasStripeSubscription && u.subscriptionStatus === "canceled";
    });
    
    // Past Due = status is "past_due" AND exists in Stripe
    const enrichedPastDueSubscribers = enrichedUsers.filter(u => {
      const email = (u.email || "").toLowerCase();
      const hasStripeSubscription = stripeSubscriptions.has(email);
      return hasStripeSubscription && u.subscriptionStatus === "past_due";
    });
    
    // NOW calculate MRR using Stripe-enriched data (accurate subscription status)
    mrr = enrichedActivePayingSubscribers.reduce((sum, u) => {
      // Legacy plans
      if (u.subscriptionPlan === "weekly") return sum + (4.99 * WEEKLY_TO_MONTHLY);
      if (u.subscriptionPlan === "monthly") return sum + 9.99;
      if (u.subscriptionPlan === "yearly") return sum + (49.99 / 12);
      // Yearly2 plan ($49.99/year)
      if (u.subscriptionPlan === "Yearly2") return sum + (49.99 / 12);
      // New trial plans (after trial, they pay recurring)
      if (u.subscriptionPlan === "1week" || u.subscriptionPlan === "2week") return sum + (19.99 * BIWEEKLY_TO_MONTHLY);
      if (u.subscriptionPlan === "4week") return sum + (29.99 * FOURWEEKLY_TO_MONTHLY);
      // A/B Test Variant B plans - all convert to $49.99/month
      if (u.subscriptionPlan === "1week-v2" || u.subscriptionPlan === "4week-v2" || u.subscriptionPlan === "12week-v2") return sum + 49.99;
      return sum;
    }, 0);
    
    // Projected MRR includes trialing users (if they all convert)
    projectedMrr = enrichedTrialingSubscribers.reduce((sum, u) => {
      if (u.subscriptionPlan === "1week" || u.subscriptionPlan === "2week") return sum + (19.99 * BIWEEKLY_TO_MONTHLY);
      if (u.subscriptionPlan === "4week") return sum + (29.99 * FOURWEEKLY_TO_MONTHLY);
      // A/B Test Variant B plans - all convert to $49.99/month
      if (u.subscriptionPlan === "1week-v2" || u.subscriptionPlan === "4week-v2" || u.subscriptionPlan === "12week-v2") return sum + 49.99;
      // Yearly2 has no trial, so it won't be in trialing list
      return sum;
    }, mrr);
    
    arr = mrr * 12;
    projectedArr = projectedMrr * 12;
    
    // Update totalActiveSubscribers with enriched data (include past_due as they're still technically subscribed)
    totalActiveSubscribers = enrichedActivePayingSubscribers.length + enrichedTrialingSubscribers.length + enrichedPastDueSubscribers.length;
    
    // Sync Firebase with Stripe data for users with mismatched status
    // This ensures Firebase stays in sync with Stripe (source of truth)
    const firebaseSyncPromises: Promise<any>[] = [];
    for (const u of enrichedUsers) {
      const email = (u.email || "").toLowerCase();
      const stripeSub = stripeSubscriptions.get(email);
      
      if (stripeSub && u.id) {
        // Check if Firebase status differs from Stripe status
        const stripeStatus = stripeSub.status === "canceled" ? "cancelled" : stripeSub.status;
        const firebaseStatus = u.subscriptionStatus;
        
        if (firebaseStatus !== stripeStatus && firebaseStatus !== "cancelled") {
          // Update Firebase to match Stripe
          const updateData: Record<string, any> = {
            subscriptionStatus: stripeStatus,
            updatedAt: new Date().toISOString(),
          };
          
          if (stripeSub.status === "canceled") {
            updateData.subscriptionCancelled = true;
            updateData.subscriptionEndedAt = stripeSub.canceledAt || new Date().toISOString();
            updateData.isSubscribed = false;
          }
          
          firebaseSyncPromises.push(
            adminDb.collection("users").doc(u.id).set(updateData, { merge: true })
              .catch(err => console.error(`Failed to sync user ${u.id}:`, err))
          );
        }
      }
    }
    
    // Execute Firebase sync in background (don't wait)
    if (firebaseSyncPromises.length > 0) {
      Promise.all(firebaseSyncPromises).catch(err => console.error("Firebase sync errors:", err));
    }
    
    // NOW calculate churn rate using Stripe-enriched data
    const enrichedChurnedCount = enrichedCancelledSubscribers.length;
    const enrichedTotalEver = enrichedActivePayingSubscribers.length + enrichedTrialingSubscribers.length + enrichedPastDueSubscribers.length + enrichedChurnedCount;
    churnRate = enrichedTotalEver > 0
      ? ((enrichedChurnedCount / enrichedTotalEver) * 100).toFixed(1)
      : "0";
    retentionRate = (100 - parseFloat(churnRate)).toFixed(1);
    
    // NOW calculate trial conversions using Stripe-enriched data
    // Trials started = all users who have/had a trial (trialing + active who were trialing + cancelled who were trialing)
    // For simplicity: count users in Stripe with trial_end set
    trialsStarted = enrichedTrialingSubscribers.length + enrichedActivePayingSubscribers.length;
    // Trials converted = users who are now "active" (completed trial and paying)
    trialsConverted = enrichedActivePayingSubscribers.length;
    trialConversionRate = trialsStarted > 0 
      ? ((trialsConverted / trialsStarted) * 100).toFixed(1)
      : "0";
    
    // NOW calculate subscription distribution using Stripe-enriched data
    const allActiveAndTrialing = [...enrichedActivePayingSubscribers, ...enrichedTrialingSubscribers];
    subscriptionDistribution = {
      weekly: allActiveAndTrialing.filter(u => u.subscriptionPlan === "weekly").length,
      monthly: allActiveAndTrialing.filter(u => u.subscriptionPlan === "monthly").length,
      yearly: allActiveAndTrialing.filter(u => u.subscriptionPlan === "yearly").length,
      "1week": allActiveAndTrialing.filter(u => u.subscriptionPlan === "1week").length,
      "2week": allActiveAndTrialing.filter(u => u.subscriptionPlan === "2week").length,
      "4week": allActiveAndTrialing.filter(u => u.subscriptionPlan === "4week").length,
      "Yearly2": allActiveAndTrialing.filter(u => u.subscriptionPlan === "Yearly2").length,
      // A/B Test Variant B plans
      "1week-v2": allActiveAndTrialing.filter(u => u.subscriptionPlan === "1week-v2").length,
      "4week-v2": allActiveAndTrialing.filter(u => u.subscriptionPlan === "4week-v2").length,
      "12week-v2": allActiveAndTrialing.filter(u => u.subscriptionPlan === "12week-v2").length,
    };
    
    // A/B Test breakdown
    const abTestBreakdown = {
      variantA: {
        subscribers: allActiveAndTrialing.filter(u => u.abTestVariant === "A" || !u.abTestVariant).length,
        plans: {
          "1week": allActiveAndTrialing.filter(u => u.subscriptionPlan === "1week").length,
          "2week": allActiveAndTrialing.filter(u => u.subscriptionPlan === "2week").length,
          "Yearly2": allActiveAndTrialing.filter(u => u.subscriptionPlan === "Yearly2").length,
        },
      },
      variantB: {
        subscribers: allActiveAndTrialing.filter(u => u.abTestVariant === "B").length,
        plans: {
          "1week-v2": allActiveAndTrialing.filter(u => u.subscriptionPlan === "1week-v2").length,
          "4week-v2": allActiveAndTrialing.filter(u => u.subscriptionPlan === "4week-v2").length,
          "12week-v2": allActiveAndTrialing.filter(u => u.subscriptionPlan === "12week-v2").length,
        },
      },
    };
    
    const activeSubscribersList = enrichedActivePayingSubscribers.map(u => ({
      id: u.id,
      email: u.email || "Unknown",
      name: u.name || "",
      plan: u.subscriptionPlan || "Unknown",
      status: u.subscriptionStatus,
      startedAt: u.subscriptionStartedAt || null,
      currentPeriodEnd: u.currentPeriodEnd || null,
    }));
    
    const trialingSubscribersList = enrichedTrialingSubscribers.map(u => ({
      id: u.id,
      email: u.email || "Unknown",
      name: u.name || "",
      plan: u.subscriptionPlan || "Unknown",
      status: u.subscriptionStatus,
      startedAt: u.subscriptionStartedAt || null,
      trialEndsAt: u.trialEndsAt || null,
    }));
    
    const cancelledSubscribersList = enrichedCancelledSubscribers.map(u => ({
      id: u.id,
      email: u.email || "Unknown",
      name: u.name || "",
      plan: u.subscriptionPlan || "Unknown",
      status: "cancelled",
      startedAt: u.subscriptionStartedAt || null,
      cancelledAt: u.canceledAt || u.subscriptionEndedAt || null,
    }));
    
    const pastDueSubscribersList = enrichedPastDueSubscribers.map(u => ({
      id: u.id,
      email: u.email || "Unknown",
      name: u.name || "",
      plan: u.subscriptionPlan || "Unknown",
      status: "past_due",
      startedAt: u.subscriptionStartedAt || null,
      currentPeriodEnd: u.currentPeriodEnd || null,
    }));
    
    // Create a map of userId to user data for quick lookup
    const userMap = new Map<string, { email?: string; name?: string }>();
    users.forEach(u => {
      userMap.set(u.id, { email: u.email, name: u.name });
    });
    
    // Custom date range filtering
    let customDateRevenue: number | null = null;
    let customDatePaymentCount: number | null = null;
    let customDateTransactions: any[] = [];
    
    if (startDateParam) {
      const customStart = new Date(startDateParam + "T00:00:00");
      const customEnd = endDateParam 
        ? new Date(endDateParam + "T23:59:59.999") 
        : new Date(startDateParam + "T23:59:59.999");
      
      const customPayments = payments.filter(p => {
        if (!p.createdAt) return false;
        const d = new Date(p.createdAt);
        return d >= customStart && d <= customEnd;
      });
      
      customDateRevenue = customPayments.reduce((sum, p) => sum + getAmount(p), 0);
      customDatePaymentCount = customPayments.length;
      customDateTransactions = customPayments.map(p => {
        const userData = userMap.get(p.userId) || {};
        return {
          id: p.id,
          date: p.createdAt,
          userId: p.userId,
          userEmail: (userData as any).email || p.customerEmail || "Unknown",
          userName: (userData as any).name || "Unknown",
          amount: getAmount(p),
          plan: p.plan,
          type: p.type,
          status: p.paymentStatus || p.status || "succeeded",
        };
      });
    }

    // All transactions with user email/name (needed for client-side date filtering)
    const recentTransactions = payments.map(p => {
      const userData = userMap.get(p.userId) || {};
      return {
        id: p.id,
        date: p.createdAt,
        userId: p.userId,
        userEmail: userData.email || p.customerEmail || "Unknown",
        userName: userData.name || "Unknown",
        amount: getAmount(p),
        plan: p.plan,
        type: p.type,
        status: p.paymentStatus || p.status || "succeeded",
      };
    });
    
    // Bundle revenue breakdown (Flow B only)
    const bundleBreakdown = {
      "bundle-palm": {
        count: flowBPayments.filter(p => p.bundleId === "bundle-palm").length,
        revenue: flowBPayments.filter(p => p.bundleId === "bundle-palm").reduce((sum, p) => sum + ((p.amountTotal || p.amount || 0) / 100), 0),
      },
      "bundle-palm-birth": {
        count: flowBPayments.filter(p => p.bundleId === "bundle-palm-birth").length,
        revenue: flowBPayments.filter(p => p.bundleId === "bundle-palm-birth").reduce((sum, p) => sum + ((p.amountTotal || p.amount || 0) / 100), 0),
      },
      "bundle-full": {
        count: flowBPayments.filter(p => p.bundleId === "bundle-full").length,
        revenue: flowBPayments.filter(p => p.bundleId === "bundle-full").reduce((sum, p) => sum + ((p.amountTotal || p.amount || 0) / 100), 0),
      },
    };
    
    return NextResponse.json({
      // Primary KPIs
      mrr: flowFilter === "flow-b" ? "N/A" : mrr.toFixed(2), // No MRR for one-time payments
      arr: flowFilter === "flow-b" ? "N/A" : arr.toFixed(2), // No ARR for one-time payments
      projectedMrr: flowFilter === "flow-b" ? "N/A" : projectedMrr.toFixed(2),
      projectedArr: flowFilter === "flow-b" ? "N/A" : projectedArr.toFixed(2),
      activePayingSubscribers: enrichedActivePayingSubscribers.length,
      trialingSubscribers: enrichedTrialingSubscribers.length,
      totalRevenue: totalRevenue.toFixed(2),
      revenueToday: revenueToday.toFixed(2),
      revenueThisWeek: revenueThisWeek.toFixed(2),
      revenueThisMonth: revenueThisMonth.toFixed(2),
      revenueThisYear: revenueThisYear.toFixed(2),
      revenueLastMonth: revenueLastMonth.toFixed(2),
      momGrowth,
      
      // Subscription breakdown
      revenueByPlan,
      revenueByType,
      arpu,
      ltv,
      
      // Subscriber counts
      totalActiveSubscribers: enrichedActivePayingSubscribers.length + enrichedTrialingSubscribers.length,
      newSubscribersThisMonth,
      churnedSubscribers: enrichedCancelledSubscribers.length,
      netSubscriberChange: newSubscribersThisMonth - enrichedCancelledSubscribers.length,
      
      // Churn & Retention
      churnRate,
      monthlyChurnRate,
      retentionRate,
      
      // Transaction activity
      successfulPayments,
      failedPayments,
      refunds,
      trialsStarted,
      trialsConverted,
      trialConversionRate,
      
      // Charts data
      revenueOverTime,
      subscriptionDistribution,
      
      // A/B Test breakdown
      abTestBreakdown,
      
      // Upsell analytics
      upsellBreakdown,
      totalUpsellRevenue: upsellPayments.reduce((sum, p) => sum + getAmount(p), 0),
      totalUpsellCount: upsellPayments.length,
      
      // Recent transactions
      recentTransactions,
      
      // Subscriber lists for tabs
      activeSubscribersList,
      trialingSubscribersList,
      cancelledSubscribersList,
      pastDueSubscribersList,
      pastDueSubscribers: enrichedPastDueSubscribers.length,
      
      // Meta
      totalPayments: payments.length,
      totalUsers: users.length,
      uniquePayingUsers,
      
      // Debug: Anonymous users with active subscriptions (paid but not registered)
      unregisteredSubscribers: anonUsersWithSubscription.length,
      
      // Stripe sync info
      stripeSubscriptionsCount: stripeSubscriptions.size,
      
      // Flow breakdown
      flowFilter,
      flowBreakdown,
      bundleBreakdown,
      
      // Custom date range
      ...(customDateRevenue !== null && {
        customDateRevenue: customDateRevenue.toFixed(2),
        customDatePaymentCount,
        customDateTransactions,
        customDateRange: { start: startDateParam, end: endDateParam || startDateParam },
      }),
    });
  } catch (error: any) {
    console.error("Admin revenue API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch revenue data" },
      { status: 500 }
    );
  }
}
