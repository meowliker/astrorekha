import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { headers } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { addContactToList, removeContactFromList, BREVO_LISTS } from "@/lib/brevo";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

function getPlanCoins(plan?: string | null) {
  // 1-week and 2-week trials give 15 coins each
  if (plan === "weekly" || plan === "monthly" || plan === "1week" || plan === "2week") return 15;
  // A/B Test Variant B - 1-week trial gives 15 coins
  if (plan === "1week-v2") return 15;
  // 4-week trial (monthly) and yearly plans give 30 coins
  if (plan === "yearly" || plan === "4week" || plan === "Yearly2") return 30;
  // A/B Test Variant B - 4-week and 12-week trials give 30 coins
  if (plan === "4week-v2" || plan === "12week-v2") return 30;
  return 0;
}

function offersToUnlockedFeatures(offers: string[]) {
  const updates: Record<string, boolean> = {};

  for (const offer of offers) {
    if (offer === "ultra-pack") {
      updates["prediction2026"] = true;
      updates["birthChart"] = true;
      updates["compatibilityTest"] = true;
      continue;
    }
    if (offer === "2026-predictions") updates["prediction2026"] = true;
    if (offer === "birth-chart") updates["birthChart"] = true;
    if (offer === "compatibility") updates["compatibilityTest"] = true;
  }

  return updates;
}

export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return NextResponse.json(
        { error: "Webhook signature verification failed" },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, plan, type, offers, coins, feature, bundleId, flow } = session.metadata || {};
        let resolvedUserId = (userId || "").trim();
        const now = new Date().toISOString();
        const customerEmail = (session.customer_details?.email || session.customer_email || "").toLowerCase().trim();

        console.log("Checkout completed - userId:", resolvedUserId, "email:", customerEmail, "plan:", plan, "type:", type, "bundleId:", bundleId, "flow:", flow);

        // If userId is missing, try to find user by email
        if (!resolvedUserId && customerEmail) {
          console.log("userId missing, attempting email lookup for:", customerEmail);
          try {
            const userQuery = await adminDb
              .collection("users")
              .where("email", "==", customerEmail)
              .limit(1)
              .get();
            
            if (!userQuery.empty) {
              resolvedUserId = userQuery.docs[0].id;
              console.log("Found user by email lookup:", resolvedUserId);
            } else {
              console.log("No user found with email:", customerEmail);
            }
          } catch (emailLookupErr) {
            console.error("Email lookup failed:", emailLookupErr);
          }
        }

        // Always store payment record (even if userId missing)
        try {
          const paymentRecord = {
            eventType: event.type,
            stripeEventId: event.id,
            sessionId: session.id,
            userId: resolvedUserId || null,
            type: type || null,
            plan: plan || null,
            offers: offers || null,
            feature: feature || null,
            coins: coins || null,
            customerEmail: customerEmail || null,
            amountTotal: session.amount_total ?? null,
            currency: session.currency || null,
            paymentStatus: session.payment_status || null,
            createdAt: now,
            // Flow B fields
            bundleId: bundleId || null,
            flow: flow || (type === "bundle_payment" ? "flow-b" : "flow-a"),
          };

          if (resolvedUserId) {
            await adminDb
              .collection("users")
              .doc(resolvedUserId)
              .collection("payments")
              .doc(session.id)
              .set(paymentRecord, { merge: true });
          }

          await adminDb.collection("payments").doc(session.id).set(paymentRecord, { merge: true });
        } catch (err) {
          console.error("Failed to persist payment record:", err);
        }

        if (!resolvedUserId) {
          console.log("No userId found even after email lookup, skipping user updates");
          break;
        }

        const userRef = adminDb.collection("users").doc(resolvedUserId);

        // Ensure base user fields exist
        await userRef.set(
          {
            email: (session.customer_details?.email || session.customer_email || "").toLowerCase() || null,
            updatedAt: now,
          },
          { merge: true }
        );

        if (type === "bundle_payment") {
          // Flow B: One-time bundle payment
          const { bundleId, flow, features: featuresJson } = session.metadata || {};
          const features = featuresJson ? JSON.parse(featuresJson) : [];
          
          console.log("Bundle payment completed - bundleId:", bundleId, "features:", features);
          
          // Build unlocked features object
          const unlockedFeatures: Record<string, boolean> = {};
          for (const feature of features) {
            unlockedFeatures[feature] = true;
          }
          
          // All bundles give 15 coins
          const coinsToAdd = 15;
          
          const updateData: any = {
            onboardingFlow: flow || "flow-b",
            purchaseType: "one-time",
            bundlePurchased: bundleId,
            unlockedFeatures,
            palmReading: features.includes("palmReading"),
            birthChart: features.includes("birthChart"),
            compatibilityTest: features.includes("compatibilityTest"),
            scansUsed: 0,
            scansAllowed: 1, // Bundle users get 1 scan only
            coins: FieldValue.increment(coinsToAdd),
            updatedAt: now,
          };
          
          // Start 24-hour timer if birth chart is included
          if (features.includes("birthChart")) {
            updateData.birthChartTimerActive = true;
            updateData.birthChartTimerStartedAt = now;
          }
          
          await userRef.set(updateData, { merge: true });
          
          // Update lead document
          if (customerEmail) {
            try {
              const leadsQuery = await adminDb
                .collection("leads")
                .where("email", "==", customerEmail)
                .orderBy("createdAt", "desc")
                .limit(1)
                .get();
              
              if (!leadsQuery.empty) {
                await leadsQuery.docs[0].ref.update({
                  onboardingFlow: flow || "flow-b",
                  bundlePurchased: bundleId,
                  purchasedAt: now,
                });
              }
            } catch (leadErr) {
              console.error("Failed to update lead for bundle purchase:", leadErr);
            }
          }
          
          console.log("Bundle purchase processed successfully for user:", resolvedUserId);
        } else if (type === "upsell") {
          const offerList = (offers || "").split(",").map((s) => s.trim()).filter(Boolean);
          const unlockUpdates = offersToUnlockedFeatures(offerList);
          
          const updateData: any = {
            unlockedFeatures: unlockUpdates,
            updatedAt: now,
          };
          
          // Start 24-hour timer if birth chart is included in upsell
          if (unlockUpdates.birthChart) {
            updateData.birthChartTimerActive = true;
            updateData.birthChartTimerStartedAt = now;
          }
          
          await userRef.set(updateData, { merge: true });
        } else if (type === "coins") {
          const coinsToAdd = parseInt(coins || "0", 10) || 0;
          if (coinsToAdd > 0) {
            await userRef.set(
              {
                coins: FieldValue.increment(coinsToAdd),
                updatedAt: now,
              },
              { merge: true }
            );
          }
        } else if (type === "report") {
          if (feature) {
            const updateData: any = {
              unlockedFeatures: {
                [feature]: true,
              },
              updatedAt: now,
            };
            
            // Start 24-hour timer for birth chart
            if (feature === "birthChart") {
              updateData.birthChartTimerActive = true;
              updateData.birthChartTimerStartedAt = now;
            }
            
            await userRef.set(updateData, { merge: true });
          }
        } else if (type === "trial_payment") {
          // Trial fee payment completed - now create the subscription with trial period
          const customerId = typeof session.customer === "string" ? session.customer : null;
          const { subscriptionPriceId, trialDays, abVariant } = session.metadata || {};
          
          console.log("Trial payment completed - creating subscription");
          console.log("Customer ID:", customerId, "Price ID:", subscriptionPriceId, "Trial days:", trialDays, "A/B Variant:", abVariant);
          
          if (customerId && subscriptionPriceId) {
            try {
              // Create subscription with trial period
              const trialEnd = Math.floor(Date.now() / 1000) + (parseInt(trialDays || "7", 10) * 24 * 60 * 60);
              
              // Retrieve the payment method from the trial payment so Stripe can charge it when trial ends
              let defaultPaymentMethod: string | undefined;
              const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
              if (paymentIntentId) {
                try {
                  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                  if (typeof paymentIntent.payment_method === "string") {
                    defaultPaymentMethod = paymentIntent.payment_method;
                    console.log("Retrieved payment method from trial payment:", defaultPaymentMethod);
                    
                    // Also set as customer's default payment method for invoices
                    await stripe.customers.update(customerId!, {
                      invoice_settings: {
                        default_payment_method: defaultPaymentMethod,
                      },
                    });
                    console.log("Set default payment method on customer:", customerId);
                  }
                } catch (pmErr) {
                  console.error("Failed to retrieve payment method from PaymentIntent:", pmErr);
                }
              }
              
              // Build subscription params
              const subParams: Stripe.SubscriptionCreateParams = {
                customer: customerId,
                items: [{ price: subscriptionPriceId }],
                trial_end: trialEnd,
                default_payment_method: defaultPaymentMethod,
                metadata: {
                  userId: resolvedUserId || "",
                  plan: plan || "",
                  abVariant: abVariant || "A",
                },
              };

              // If user applied a promo code at checkout, carry it to the subscription
              // so the discount applies to the first recurring billing after trial
              try {
                const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
                  expand: ["total_details.breakdown"],
                });
                const discounts = fullSession.total_details?.breakdown?.discounts;
                if (discounts && discounts.length > 0) {
                  const couponId = discounts[0].discount.coupon.id;
                  if (couponId) {
                    subParams.coupon = couponId;
                    console.log("Carrying over coupon from checkout to subscription:", couponId);
                  }
                }
              } catch (couponErr) {
                console.error("Failed to retrieve checkout discount:", couponErr);
              }

              const subscription = await stripe.subscriptions.create(subParams);
              
              // Update user with subscription info
              const coinsToAdd = getPlanCoins(plan || null);
              await userRef.set(
                {
                  subscriptionPlan: plan || null,
                  subscriptionStatus: "trialing",
                  subscriptionStartedAt: now,
                  subscriptionCancelled: false,
                  stripeSubscriptionId: subscription.id,
                  stripeCustomerId: customerId,
                  trialEndsAt: new Date(trialEnd * 1000).toISOString(),
                  abTestVariant: abVariant || "A", // Track A/B test variant
                  abTestId: "pricing-test-1",
                  updatedAt: now,
                },
                { merge: true }
              );
              
              if (coinsToAdd > 0) {
                await userRef.set(
                  {
                    coins: FieldValue.increment(coinsToAdd),
                    updatedAt: now,
                  },
                  { merge: true }
                );
              }
              
              // Track A/B test conversion
              if (abVariant) {
                try {
                  const trialAmount = plan === "1week-v2" ? 2.99 : plan === "4week-v2" ? 7.99 : plan === "12week-v2" ? 14.99 : plan === "1week" ? 1 : plan === "4week" ? 9.99 : 5.49;
                  await adminDb.collection("abTestEvents").add({
                    testId: "pricing-test-1",
                    variant: abVariant,
                    eventType: "conversion",
                    visitorId: resolvedUserId,
                    userId: resolvedUserId,
                    metadata: { plan, amount: trialAmount },
                    timestamp: now,
                    createdAt: now,
                  });
                  
                  // Update aggregated stats
                  const statsRef = adminDb.collection("abTestStats").doc(`pricing-test-1_${abVariant}`);
                  const statsDoc = await statsRef.get();
                  if (statsDoc.exists) {
                    await statsRef.set({
                      conversions: FieldValue.increment(1),
                      totalRevenue: FieldValue.increment(trialAmount),
                      updatedAt: now,
                    }, { merge: true });
                  } else {
                    await statsRef.set({
                      testId: "pricing-test-1",
                      variant: abVariant,
                      impressions: 0,
                      conversions: 1,
                      bounces: 0,
                      totalRevenue: trialAmount,
                      createdAt: now,
                      updatedAt: now,
                    });
                  }
                } catch (abErr) {
                  console.error("Failed to track A/B test conversion:", abErr);
                }
              }
              
              // Update lead document
              if (customerEmail) {
                try {
                  const leadsQuery = await adminDb
                    .collection("leads")
                    .where("email", "==", customerEmail)
                    .orderBy("createdAt", "desc")
                    .limit(1)
                    .get();
                  
                  if (!leadsQuery.empty) {
                    await leadsQuery.docs[0].ref.update({
                      subscriptionStatus: plan || "trialing",
                      subscribedAt: now,
                      abTestVariant: abVariant || "A",
                    });
                  }
                } catch (leadErr) {
                  console.error("Failed to update lead subscription status:", leadErr);
                }
              }
              
              // Add to Brevo Active Subscribers list & remove from Abandoned Checkout
              if (customerEmail) {
                try {
                  await addContactToList(customerEmail, BREVO_LISTS.ACTIVE_SUBSCRIBERS);
                  await removeContactFromList(customerEmail, BREVO_LISTS.ABANDONED_CHECKOUT);
                  console.log("Added to Active Subscribers list:", customerEmail);
                } catch (brevoErr) {
                  console.error("Failed to update Brevo lists:", brevoErr);
                }
              }
              
              console.log("Subscription created successfully:", subscription.id);
            } catch (subErr) {
              console.error("Failed to create subscription after trial payment:", subErr);
            }
          } else {
            console.log("Missing customerId or subscriptionPriceId for trial_payment");
          }
        } else if (type === "trial_subscription") {
          // Legacy: trial-based subscription created atomically by Stripe
          const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
          const customerId = typeof session.customer === "string" ? session.customer : null;
          
          console.log("Trial subscription checkout completed");
          console.log("Subscription ID:", subscriptionId, "Customer ID:", customerId);
          
          if (subscriptionId) {
            try {
              // Retrieve subscription to get trial end date
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              
              // Update user with subscription info
              const coinsToAdd = getPlanCoins(plan || null);
              await userRef.set(
                {
                  subscriptionPlan: plan || null,
                  subscriptionStatus: "trialing",
                  subscriptionStartedAt: now,
                  subscriptionCancelled: false,
                  stripeSubscriptionId: subscription.id,
                  stripeCustomerId: customerId,
                  trialEndsAt: subscription.trial_end 
                    ? new Date(subscription.trial_end * 1000).toISOString() 
                    : null,
                  updatedAt: now,
                },
                { merge: true }
              );
              
              if (coinsToAdd > 0) {
                await userRef.set(
                  {
                    coins: FieldValue.increment(coinsToAdd),
                    updatedAt: now,
                  },
                  { merge: true }
                );
              }
              
              // Update lead document
              if (customerEmail) {
                try {
                  const leadsQuery = await adminDb
                    .collection("leads")
                    .where("email", "==", customerEmail)
                    .orderBy("createdAt", "desc")
                    .limit(1)
                    .get();
                  
                  if (!leadsQuery.empty) {
                    await leadsQuery.docs[0].ref.update({
                      subscriptionStatus: plan || "trialing",
                      subscribedAt: now,
                    });
                  }
                } catch (leadErr) {
                  console.error("Failed to update lead subscription status:", leadErr);
                }
              }
              // Add to Brevo Active Subscribers list & remove from Abandoned Checkout
              if (customerEmail) {
                try {
                  await addContactToList(customerEmail, BREVO_LISTS.ACTIVE_SUBSCRIBERS);
                  await removeContactFromList(customerEmail, BREVO_LISTS.ABANDONED_CHECKOUT);
                  console.log("Added to Active Subscribers list:", customerEmail);
                } catch (brevoErr) {
                  console.error("Failed to update Brevo lists:", brevoErr);
                }
              }
            } catch (subErr) {
              console.error("Failed to retrieve subscription:", subErr);
            }
          } else {
            console.log("No subscription ID found in session");
          }
        } else {
          // Only treat as subscription if session mode is "subscription"
          // Skip if session mode is "payment" (one-time) to avoid overwriting bundle data
          if (session.mode === "subscription") {
            const coinsToAdd = getPlanCoins(plan || null);
            await userRef.set(
              {
                subscriptionPlan: plan || null,
                subscriptionStatus: "active",
                subscriptionStartedAt: now,
                subscriptionCancelled: false,
                stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
                stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
                updatedAt: now,
              },
              { merge: true }
            );
            
            // Update lead document with subscription status
            if (customerEmail) {
              try {
                const leadsQuery = await adminDb
                  .collection("leads")
                  .where("email", "==", customerEmail)
                  .orderBy("createdAt", "desc")
                  .limit(1)
                  .get();
                
                if (!leadsQuery.empty) {
                  await leadsQuery.docs[0].ref.update({
                    subscriptionStatus: plan || "subscribed",
                    subscribedAt: now,
                  });
                }
              } catch (leadErr) {
                console.error("Failed to update lead subscription status:", leadErr);
              }
            }
            if (coinsToAdd > 0) {
              await userRef.set(
                {
                  coins: FieldValue.increment(coinsToAdd),
                  updatedAt: now,
                },
                { merge: true }
              );
            }
            
            // Add to Brevo Active Subscribers list & remove from Abandoned Checkout
            if (customerEmail) {
              try {
                await addContactToList(customerEmail, BREVO_LISTS.ACTIVE_SUBSCRIBERS);
                await removeContactFromList(customerEmail, BREVO_LISTS.ABANDONED_CHECKOUT);
                console.log("Added to Active Subscribers list:", customerEmail);
              } catch (brevoErr) {
                console.error("Failed to update Brevo lists:", brevoErr);
              }
            }
          } else {
            console.log("Skipping subscription handling for non-subscription session mode:", session.mode, "type:", type);
          }
        }
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("Subscription created:", subscription.id);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const subData = subscription as any;
        let { userId } = subData.metadata || {};
        
        console.log("Subscription updated:", subscription.id, subData.status);
        
        // Resolve customer email for Brevo list management
        let subCustomerEmail = "";
        if (subscription.customer) {
          try {
            const customer = await stripe.customers.retrieve(subscription.customer as string);
            if (customer && !customer.deleted && (customer as any).email) {
              subCustomerEmail = (customer as any).email.toLowerCase();
            }
          } catch (_) {}
        }
        
        // If userId is missing, try to find by customer email
        if (!userId && subCustomerEmail) {
          try {
            const userQuery = await adminDb
              .collection("users")
              .where("email", "==", subCustomerEmail)
              .limit(1)
              .get();
            if (!userQuery.empty) {
              userId = userQuery.docs[0].id;
              console.log("Found user by email for subscription update:", userId);
            }
          } catch (lookupErr) {
            console.error("Email lookup failed for subscription update:", lookupErr);
          }
        }
        
        // Check if trial has ended
        if (subData.trial_end && new Date(subData.trial_end * 1000) <= new Date()) {
          // Trial has ended
          if (userId) {
            const now = new Date().toISOString();
            await adminDb
              .collection("users")
              .doc(userId)
              .set(
                {
                  trialCompleted: true,
                  trialEndedAt: new Date(subData.trial_end * 1000).toISOString(),
                  updatedAt: now,
                },
                { merge: true }
              );
          }
        }
        
        if (userId) {
          const now = new Date().toISOString();
          // Normalize Stripe's "canceled" to "cancelled" for consistency
          const normalizedStatus = subData.status === "canceled" ? "cancelled" : subData.status;
          
          const updateData: Record<string, any> = {
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
            subscriptionStatus: normalizedStatus,
            subscriptionPlan: subData.metadata?.plan || subData.items?.data?.[0]?.price?.lookup_key || null,
            currentPeriodEnd: subData.current_period_end
              ? new Date(subData.current_period_end * 1000).toISOString()
              : null,
            updatedAt: now,
          };
          
          // If status is canceled, also set cancellation flags and remove from Brevo Active Subscribers
          if (subData.status === "canceled") {
            updateData.subscriptionCancelled = true;
            updateData.subscriptionEndedAt = now;
            updateData.isSubscribed = false;
            
            // Remove from Active Subscribers so they stop getting daily emails
            if (subCustomerEmail) {
              try {
                await removeContactFromList(subCustomerEmail, BREVO_LISTS.ACTIVE_SUBSCRIBERS);
                console.log("Removed from Active Subscribers (subscription updated to canceled):", subCustomerEmail);
              } catch (brevoErr) {
                console.error("Failed to remove from Brevo Active Subscribers:", brevoErr);
              }
            }
          }
          
          await adminDb
            .collection("users")
            .doc(userId)
            .set(updateData, { merge: true });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subData = subscription as any;
        let { userId } = subData.metadata || {};
        
        console.log(`Subscription cancelled for user ${userId}`);
        
        // If userId is missing, try to find by customer email
        if (!userId && subscription.customer) {
          try {
            const customer = await stripe.customers.retrieve(subscription.customer as string);
            if (customer && !customer.deleted && (customer as any).email) {
              const email = (customer as any).email.toLowerCase();
              const userQuery = await adminDb
                .collection("users")
                .where("email", "==", email)
                .limit(1)
                .get();
              if (!userQuery.empty) {
                userId = userQuery.docs[0].id;
                console.log("Found user by email for subscription deleted:", userId);
              }
            }
          } catch (lookupErr) {
            console.error("Email lookup failed for subscription deleted:", lookupErr);
          }
        }
        
        // Remove from Brevo Active Subscribers so they stop getting daily emails
        if (subscription.customer) {
          try {
            const customer = await stripe.customers.retrieve(subscription.customer as string);
            if (customer && !customer.deleted && (customer as any).email) {
              const cancelledEmail = (customer as any).email.toLowerCase();
              await removeContactFromList(cancelledEmail, BREVO_LISTS.ACTIVE_SUBSCRIBERS);
              console.log("Removed from Active Subscribers (subscription deleted):", cancelledEmail);
            }
          } catch (brevoErr) {
            console.error("Failed to remove from Brevo Active Subscribers:", brevoErr);
          }
        }
        
        if (userId) {
          const now = new Date().toISOString();
          await adminDb
            .collection("users")
            .doc(userId)
            .set(
              {
                subscriptionStatus: "cancelled",
                subscriptionCancelled: true,
                subscriptionEndedAt: now,
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
                updatedAt: now,
              },
              { merge: true }
            );
        }
        break;
      }

      case "customer.subscription.trial_will_end": {
        // Trial is about to end (3 days before by default)
        const subscription = event.data.object as Stripe.Subscription;
        const subData = subscription as any;
        let { userId } = subData.metadata || {};
        
        console.log(`Trial ending soon for user ${userId}`);
        
        // If userId is missing, try to find by customer email
        if (!userId && subscription.customer) {
          try {
            const customer = await stripe.customers.retrieve(subscription.customer as string);
            if (customer && !customer.deleted && (customer as any).email) {
              const email = (customer as any).email.toLowerCase();
              const userQuery = await adminDb
                .collection("users")
                .where("email", "==", email)
                .limit(1)
                .get();
              if (!userQuery.empty) {
                userId = userQuery.docs[0].id;
                console.log("Found user by email for trial_will_end:", userId);
              }
            }
          } catch (lookupErr) {
            console.error("Email lookup failed for trial_will_end:", lookupErr);
          }
        }
        
        if (userId) {
          const now = new Date().toISOString();
          await adminDb
            .collection("users")
            .doc(userId)
            .set(
              {
                trialEndingSoon: true,
                trialEndDate: subData.trial_end ? new Date(subData.trial_end * 1000).toISOString() : null,
                updatedAt: now,
              },
              { merge: true }
            );
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceData = invoice as any;
        let { userId } = invoiceData.subscription_details?.metadata || {};
        
        console.log("Payment succeeded for invoice:", invoice.id);
        
        // If userId is missing, try to find by customer email
        if (!userId && invoice.customer_email) {
          try {
            const email = invoice.customer_email.toLowerCase();
            const userQuery = await adminDb
              .collection("users")
              .where("email", "==", email)
              .limit(1)
              .get();
            if (!userQuery.empty) {
              userId = userQuery.docs[0].id;
              console.log("Found user by email for payment_succeeded:", userId);
            }
          } catch (lookupErr) {
            console.error("Email lookup failed for payment_succeeded:", lookupErr);
          }
        }
        
        if (userId) {
          const now = new Date().toISOString();
          await adminDb
            .collection("users")
            .doc(userId)
            .set(
              {
                paymentStatus: "succeeded",
                lastPaymentDate: now,
                subscriptionStatus: "active",
                updatedAt: now,
              },
              { merge: true }
            );
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceData = invoice as any;
        let { userId } = invoiceData.subscription_details?.metadata || {};
        
        console.log("Payment failed for invoice:", invoice.id);
        
        // If userId is missing, try to find by customer email
        if (!userId && invoice.customer_email) {
          try {
            const email = invoice.customer_email.toLowerCase();
            const userQuery = await adminDb
              .collection("users")
              .where("email", "==", email)
              .limit(1)
              .get();
            if (!userQuery.empty) {
              userId = userQuery.docs[0].id;
              console.log("Found user by email for payment_failed:", userId);
            }
          } catch (lookupErr) {
            console.error("Email lookup failed for payment_failed:", lookupErr);
          }
        }
        
        if (userId) {
          const now = new Date().toISOString();
          await adminDb
            .collection("users")
            .doc(userId)
            .set(
              {
                paymentStatus: "failed",
                paymentFailedAt: now,
                subscriptionStatus: "past_due",
                updatedAt: now,
              },
              { merge: true }
            );
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook handler failed" },
      { status: 500 }
    );
  }
}
