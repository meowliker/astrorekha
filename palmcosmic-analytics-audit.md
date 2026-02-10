# PalmCosmic Analytics Audit Report

**Date:** February 1, 2026  
**Prepared for:** Meow (Visionary Era)  
**Subject:** Revenue Analytics Code Review & Fixes

---

## Executive Summary

After reviewing your revenue analytics implementation (`revenueroute.ts`, `webhook.ts`, `create-checkout.ts`, `create-upsell-checkout.ts`), I identified **7 critical issues** that are causing inaccurate metrics in your dashboard. This document details each issue, explains why it's wrong, and provides the corrected code.

---

## Revenue Model Overview

Before diving into the issues, here's your complete revenue structure:

### Subscription Plans (Recurring)

| Plan | Trial Fee | Trial Period | Post-Trial Price | Billing Cycle |
|------|-----------|--------------|------------------|---------------|
| 1-Week Trial | $1.00 | 7 days | $19.99 | Every 2 weeks |
| 2-Week Trial | $5.49 | 14 days | $19.99 | Every 2 weeks |
| 4-Week Trial | $9.99 | 28 days | $29.99 | Every 4 weeks |

### Upsells (One-Time)

| Product | Price | Location |
|---------|-------|----------|
| 2026 Predictions | $6.99 | Upsell Page + Dashboard |
| Birth Chart | $6.99 | Upsell Page + Dashboard |
| Compatibility | $6.99 | Upsell Page + Dashboard |
| Ultra Pack (All 3) | $9.99 | Upsell Page Only |

### Chat Coins (One-Time)

| Package | Price | Price Per Coin |
|---------|-------|----------------|
| 50 Coins | $4.99 | $0.10 |
| 150 Coins | $12.99 | $0.087 |
| 300 Coins | $19.99 | $0.067 |
| 500 Coins | $29.99 | $0.060 |

---

## Issue #1: MRR Calculation Uses Wrong Multiplier

### Severity: 🔴 Critical

### Current Code (revenueroute.ts, lines 91-99)

```typescript
const mrr = activePayingSubscribers.reduce((sum, u) => {
  // Legacy plans
  if (u.subscriptionPlan === "weekly") return sum + (4.99 * 4);
  if (u.subscriptionPlan === "monthly") return sum + 9.99;
  if (u.subscriptionPlan === "yearly") return sum + (49.99 / 12);
  // New trial plans
  if (u.subscriptionPlan === "1week" || u.subscriptionPlan === "2week") return sum + (19.99 * 2);
  if (u.subscriptionPlan === "4week") return sum + 29.99;
  return sum;
}, 0);
```

### Problem

The calculation `19.99 * 2 = $39.98/month` is mathematically incorrect.

**Why it's wrong:**

- Bi-weekly billing means 26 billing cycles per year (52 weeks ÷ 2)
- Monthly equivalent = 26 ÷ 12 = **2.1667 cycles per month**
- Correct MRR = $19.99 × 2.1667 = **$43.31/month** (not $39.98)

Similarly, the 4-week plan:

- 4-week billing means 13 billing cycles per year (52 weeks ÷ 4)
- Monthly equivalent = 13 ÷ 12 = **1.0833 cycles per month**
- Correct MRR = $29.99 × 1.0833 = **$32.49/month** (not $29.99)

### Impact

You're **underreporting MRR by ~8%** for bi-weekly subscribers and ~8% for 4-week subscribers.

### Corrected Code

```typescript
// Constants for billing cycle conversion
const BIWEEKLY_TO_MONTHLY = 26 / 12; // 2.1667
const FOURWEEKLY_TO_MONTHLY = 13 / 12; // 1.0833

const mrr = activePayingSubscribers.reduce((sum, u) => {
  // Legacy plans
  if (u.subscriptionPlan === "weekly") return sum + (4.99 * 4.33); // 52/12
  if (u.subscriptionPlan === "monthly") return sum + 9.99;
  if (u.subscriptionPlan === "yearly") return sum + (49.99 / 12);
  
  // New trial plans (after trial, recurring charges)
  if (u.subscriptionPlan === "1week" || u.subscriptionPlan === "2week") {
    return sum + (19.99 * BIWEEKLY_TO_MONTHLY); // $43.31/month
  }
  if (u.subscriptionPlan === "4week") {
    return sum + (29.99 * FOURWEEKLY_TO_MONTHLY); // $32.49/month
  }
  return sum;
}, 0);
```

---

## Issue #2: Trial Conversion Rate Checks Non-Existent Field

### Severity: 🔴 Critical

### Current Code (revenueroute.ts, lines 157-160)

```typescript
const trialsStarted = users.filter(u => u.trialStartedAt).length;
const trialsConverted = users.filter(u => u.trialStartedAt && u.subscriptionStatus === "active").length;
const trialConversionRate = trialsStarted > 0 
  ? ((trialsConverted / trialsStarted) * 100).toFixed(1)
  : "0";
```

### Problem

Your webhook **never sets `trialStartedAt`**. Looking at webhook.ts lines 213-224:

```typescript
await userRef.set({
  subscriptionPlan: plan || null,
  subscriptionStatus: "trialing",
  subscriptionStartedAt: now,      // ✓ This is set
  subscriptionCancelled: false,
  stripeSubscriptionId: subscription.id,
  stripeCustomerId: customerId,
  trialEndsAt: new Date(trialEnd * 1000).toISOString(),  // ✓ This is set
  updatedAt: now,
  // ❌ trialStartedAt is NEVER set!
}, { merge: true });
```

### Impact

Your trial conversion rate is always **0%** because `trialsStarted` filter returns 0 users.

### Fix Option A: Update Webhook (Recommended)

Add `trialStartedAt` to the webhook when creating trial subscriptions:

```typescript
await userRef.set({
  subscriptionPlan: plan || null,
  subscriptionStatus: "trialing",
  subscriptionStartedAt: now,
  trialStartedAt: now,  // ← ADD THIS LINE
  subscriptionCancelled: false,
  stripeSubscriptionId: subscription.id,
  stripeCustomerId: customerId,
  trialEndsAt: new Date(trialEnd * 1000).toISOString(),
  updatedAt: now,
}, { merge: true });
```

### Fix Option B: Update Revenue Route Query

If you can't update the webhook (existing users won't have the field), modify the filter:

```typescript
// Count users who have a trial end date (indicates they started a trial)
const trialsStarted = users.filter(u => u.trialEndsAt).length;

// Users who started trial AND are now active (converted)
const trialsConverted = users.filter(u => 
  u.trialEndsAt && u.subscriptionStatus === "active"
).length;
```

---

## Issue #3: Churn Rate Shows Lifetime, Not Monthly

### Severity: 🟡 Medium

### Current Code (revenueroute.ts, lines 147-150)

```typescript
const churnRate = totalActiveSubscribers + churnedSubscribers > 0
  ? ((churnedSubscribers / (totalActiveSubscribers + churnedSubscribers)) * 100).toFixed(1)
  : "0";
```

### Problem

This calculates **lifetime churn**, not **monthly churn rate**. If you've ever had 100 subscribers and 20 have churned over 6 months, this will always show 20%—even if nobody churned this month.

### Why This Matters

- **Lifetime churn** is a cumulative metric that always increases
- **Monthly churn** tells you the health of your business month-over-month
- Investors and industry benchmarks use **monthly churn rate**

### Corrected Code

```typescript
// Monthly churn = users who cancelled THIS MONTH / subscribers at start of month
const churnedThisMonth = users.filter(u => {
  if (!u.subscriptionEndedAt || !u.subscriptionCancelled) return false;
  const endedAt = new Date(u.subscriptionEndedAt);
  return endedAt >= startOfMonth;
}).length;

// For accurate start-of-month count, you'd need historical snapshots
// Approximation: active + churned this month ≈ start of month count
const subscribersAtStartOfMonth = totalActiveSubscribers + churnedThisMonth;

const monthlyChurnRate = subscribersAtStartOfMonth > 0 
  ? ((churnedThisMonth / subscribersAtStartOfMonth) * 100).toFixed(1)
  : "0";

// Also calculate lifetime churn for reference
const lifetimeChurnRate = totalActiveSubscribers + churnedSubscribers > 0
  ? ((churnedSubscribers / (totalActiveSubscribers + churnedSubscribers)) * 100).toFixed(1)
  : "0";
```

---

## Issue #4: Coin Purchases Not Being Tracked

### Severity: 🔴 Critical

### Problem

Your revenue route expects `type: "coins"` payments:

```typescript
coins: payments.filter(p => p.type === "coins").reduce((sum, p) => sum + getAmount(p), 0),
```

But there's **no coin checkout endpoint** in your codebase. You have:

- `create-checkout.ts` → Subscriptions
- `create-upsell-checkout.ts` → Upsells

**Missing:** Coin purchase handler

### Impact

Coin revenue is showing as **$0** even if users are buying coins.

### Solution: Create Coin Checkout Endpoint

Create a new file `create-coin-checkout.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const COIN_PACKAGES: Record<string, { priceId: string; coins: number; amount: number }> = {
  "50": {
    priceId: process.env.STRIPE_PRICE_50_COINS || "",
    coins: 50,
    amount: 499, // $4.99 in cents
  },
  "150": {
    priceId: process.env.STRIPE_PRICE_150_COINS || "",
    coins: 150,
    amount: 1299, // $12.99
  },
  "300": {
    priceId: process.env.STRIPE_PRICE_300_COINS || "",
    coins: 300,
    amount: 1999, // $19.99
  },
  "500": {
    priceId: process.env.STRIPE_PRICE_500_COINS || "",
    coins: 500,
    amount: 2999, // $29.99
  },
};

export async function POST(request: NextRequest) {
  try {
    const { packageId, userId, email, successPath, cancelPath } = await request.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    const coinPackage = COIN_PACKAGES[packageId];
    if (!coinPackage) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "https://palmcosmic-web-app.vercel.app";
    
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    
    if (coinPackage.priceId) {
      lineItems.push({ price: coinPackage.priceId, quantity: 1 });
    } else {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: `${coinPackage.coins} Chat Coins` },
          unit_amount: coinPackage.amount,
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url: `${baseUrl}${successPath || "/dashboard"}?coins_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}${cancelPath || "/dashboard"}?coins_cancelled=true`,
      metadata: {
        userId: userId || "",
        type: "coins",  // ← CRITICAL: This must be "coins"
        coins: String(coinPackage.coins),
      },
      ...(email && email.includes("@") ? { customer_email: email } : {}),
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      coins: coinPackage.coins,
    });
  } catch (error: any) {
    console.error("Coin checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
```

---

## Issue #5: ARPU Shows Lifetime Instead of Monthly

### Severity: 🟡 Medium

### Current Code (revenueroute.ts, lines 143-145)

```typescript
const uniquePayingUsers = new Set(payments.map(p => p.userId)).size;
const arpu = uniquePayingUsers > 0 ? (totalRevenue / uniquePayingUsers).toFixed(2) : "0";
```

### Problem

This divides **total lifetime revenue** by **unique users ever**, giving you lifetime ARPU. As your business grows, this number keeps increasing—which isn't useful for month-over-month comparison.

### Corrected Code

```typescript
// Lifetime ARPU (for reference)
const lifetimeArpu = uniquePayingUsers > 0 
  ? (totalRevenue / uniquePayingUsers).toFixed(2) 
  : "0";

// Monthly ARPU (more useful for tracking)
const monthlyArpu = totalActiveSubscribers > 0 
  ? (revenueThisMonth / totalActiveSubscribers).toFixed(2) 
  : "0";
```

---

## Issue #6: Date Matching for Revenue Chart is Fragile

### Severity: 🟡 Medium

### Current Code (revenueroute.ts, lines 173-177)

```typescript
const dayRevenue = payments
  .filter(p => p.createdAt && p.createdAt.startsWith(dateStr))
  .reduce((sum, p) => sum + getAmount(p), 0);
```

### Problem

This assumes `createdAt` is always in `YYYY-MM-DD...` format. If stored differently (e.g., different timezone representations or epoch timestamps), payments will be missed.

### Corrected Code

```typescript
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
```

---

## Issue #7: Subscription Distribution Ignores New Plans

### Severity: 🔴 Critical

### Current Code (revenueroute.ts, lines 180-184)

```typescript
const subscriptionDistribution = {
  weekly: users.filter(u => u.subscriptionPlan === "weekly" && u.subscriptionStatus === "active").length,
  monthly: users.filter(u => u.subscriptionPlan === "monthly" && u.subscriptionStatus === "active").length,
  yearly: users.filter(u => u.subscriptionPlan === "yearly" && u.subscriptionStatus === "active").length,
};
```

### Problem

This completely ignores your new trial-based plans (`1week`, `2week`, `4week`). If all your users are on new plans, your pie chart shows 0 subscribers.

### Corrected Code

```typescript
const subscriptionDistribution = {
  // Legacy plans
  weekly: users.filter(u => 
    u.subscriptionPlan === "weekly" && 
    u.subscriptionStatus === "active"
  ).length,
  monthly: users.filter(u => 
    u.subscriptionPlan === "monthly" && 
    u.subscriptionStatus === "active"
  ).length,
  yearly: users.filter(u => 
    u.subscriptionPlan === "yearly" && 
    u.subscriptionStatus === "active"
  ).length,
  
  // New trial-based plans (include both active and trialing)
  "1week": users.filter(u => 
    u.subscriptionPlan === "1week" && 
    (u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing")
  ).length,
  "2week": users.filter(u => 
    u.subscriptionPlan === "2week" && 
    (u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing")
  ).length,
  "4week": users.filter(u => 
    u.subscriptionPlan === "4week" && 
    (u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing")
  ).length,
};
```

**Note:** Update your `RevenueData` interface and frontend to handle the new plan keys.

---

## Summary of All Issues

| # | Issue | Severity | Impact | File to Fix |
|---|-------|----------|--------|-------------|
| 1 | MRR uses wrong multiplier | 🔴 Critical | ~8% underreporting | revenueroute.ts |
| 2 | Trial conversion checks missing field | 🔴 Critical | Always shows 0% | webhook.ts + revenueroute.ts |
| 3 | Churn rate is lifetime, not monthly | 🟡 Medium | Misleading metric | revenueroute.ts |
| 4 | Coin purchases not tracked | 🔴 Critical | Coin revenue = $0 | New file needed |
| 5 | ARPU is lifetime, not monthly | 🟡 Medium | Not useful for trends | revenueroute.ts |
| 6 | Date matching is fragile | 🟡 Medium | Missing payments in chart | revenueroute.ts |
| 7 | Subscription distribution ignores new plans | 🔴 Critical | Pie chart shows 0 | revenueroute.ts |

---

## Recommended Implementation Order

1. **Fix MRR calculation** (5 min) — Immediate revenue reporting accuracy
2. **Add `trialStartedAt` to webhook** (5 min) — Fix trial conversion tracking
3. **Update subscription distribution** (10 min) — Show correct plan breakdown
4. **Create coin checkout endpoint** (20 min) — Track coin revenue
5. **Fix date matching** (10 min) — Accurate revenue chart
6. **Update churn to monthly** (15 min) — Industry-standard metric
7. **Add monthly ARPU** (5 min) — Better trend tracking

---

## Additional Recommendations

### 1. Add Revenue by Source Breakdown

Currently you track `revenueByType` but could add more granular breakdown:

```typescript
const revenueBreakdown = {
  // Subscription revenue (recurring)
  subscriptionTrialFees: payments
    .filter(p => p.type === "trial_payment")
    .reduce((sum, p) => sum + getAmount(p), 0),
  subscriptionRecurring: payments
    .filter(p => p.type === "subscription" || p.type === "trial_subscription")
    .reduce((sum, p) => sum + getAmount(p), 0),
  
  // One-time revenue
  upsells: payments
    .filter(p => p.type === "upsell")
    .reduce((sum, p) => sum + getAmount(p), 0),
  coins: payments
    .filter(p => p.type === "coins")
    .reduce((sum, p) => sum + getAmount(p), 0),
  reports: payments
    .filter(p => p.type === "report")
    .reduce((sum, p) => sum + getAmount(p), 0),
};
```

### 2. Track Upsell Attachment Rate

```typescript
// Users who saw upsell page (completed subscription checkout)
const usersWhoSawUpsell = users.filter(u => 
  u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing"
).length;

// Users who bought any upsell
const usersWhoBoughtUpsell = new Set(
  payments.filter(p => p.type === "upsell").map(p => p.userId)
).size;

const upsellAttachmentRate = usersWhoSawUpsell > 0
  ? ((usersWhoBoughtUpsell / usersWhoSawUpsell) * 100).toFixed(1)
  : "0";
```

### 3. Calculate True LTV

Your current LTV uses a hardcoded 6-month estimate. For accuracy:

```typescript
// Calculate actual average subscription length from data
const subscribersWithEndDates = users.filter(u => 
  u.subscriptionStartedAt && u.subscriptionEndedAt
);

const avgSubscriptionDays = subscribersWithEndDates.length > 0
  ? subscribersWithEndDates.reduce((sum, u) => {
      const start = new Date(u.subscriptionStartedAt);
      const end = new Date(u.subscriptionEndedAt);
      return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    }, 0) / subscribersWithEndDates.length
  : 180; // Default to 6 months if no data

const avgSubscriptionMonths = avgSubscriptionDays / 30;
const ltv = (parseFloat(monthlyArpu) * avgSubscriptionMonths).toFixed(2);
```

---

## Questions?

If you need help implementing any of these fixes or want me to provide the complete corrected `revenueroute.ts` file, let me know!