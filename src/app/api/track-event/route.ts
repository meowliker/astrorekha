import { NextRequest, NextResponse } from "next/server";
import {
  trackEvent,
  upsertContact,
  addContactToList,
  removeContactFromList,
  BREVO_LISTS,
} from "@/lib/brevo";

/**
 * POST /api/track-event
 *
 * Proxies frontend events to Brevo for automation triggers.
 *
 * Body:
 *   - email: string (required)
 *   - event: string (required) — e.g. "checkout_started", "checkout_completed"
 *   - properties?: Record<string, any> — extra data for the event
 *   - attributes?: Record<string, any> — contact attributes to upsert (e.g. SUN_SIGN)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, event, properties, attributes } = body;

    if (!email || !event) {
      return NextResponse.json(
        { error: "email and event are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Ensure the contact exists in Brevo with any provided attributes
    await upsertContact(normalizedEmail, attributes);

    // Handle specific events with list management
    switch (event) {
      case "checkout_started":
        // Add to abandoned checkout list (automation will wait 30 min then check)
        await addContactToList(normalizedEmail, BREVO_LISTS.ABANDONED_CHECKOUT);
        break;

      case "checkout_completed":
        // Remove from abandoned checkout list (they converted!)
        await removeContactFromList(normalizedEmail, BREVO_LISTS.ABANDONED_CHECKOUT);
        // Add to active subscribers list for daily emails
        await addContactToList(normalizedEmail, BREVO_LISTS.ACTIVE_SUBSCRIBERS);
        break;

      case "subscription_cancelled":
        // Remove from active subscribers list
        await removeContactFromList(normalizedEmail, BREVO_LISTS.ACTIVE_SUBSCRIBERS);
        break;
    }

    // Track the event for Brevo automations
    await trackEvent(normalizedEmail, event, properties);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[track-event] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to track event" },
      { status: 500 }
    );
  }
}
