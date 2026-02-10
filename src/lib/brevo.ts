import * as SibApiV3Sdk from "@getbrevo/brevo";

// ── Brevo (Sendinblue) integration ──────────────────────────────────
// Used for:
//   1. Abandoned checkout emails (30-min delay automation)
//   2. Daily horoscope/tips emails to active subscribers

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";

// ── API instances ───────────────────────────────────────────────────

function getContactsApi() {
  const api = new SibApiV3Sdk.ContactsApi();
  api.setApiKey(SibApiV3Sdk.ContactsApiApiKeys.apiKey, BREVO_API_KEY);
  return api;
}

function getTransactionalApi() {
  const api = new SibApiV3Sdk.TransactionalEmailsApi();
  api.setApiKey(
    SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
    BREVO_API_KEY
  );
  return api;
}

// ── Brevo List IDs (create these in Brevo Dashboard → Contacts → Lists) ──
// Update these after creating the lists in your Brevo dashboard
export const BREVO_LISTS = {
  ABANDONED_CHECKOUT: Number(process.env.BREVO_LIST_ABANDONED_CHECKOUT || 2),
  ACTIVE_SUBSCRIBERS: Number(process.env.BREVO_LIST_ACTIVE_SUBSCRIBERS || 3),
};

// ── Brevo Template IDs (create these in Brevo Dashboard → Campaigns → Templates) ──
// Update these after creating the email templates in your Brevo dashboard
export const BREVO_TEMPLATES = {
  ABANDONED_CHECKOUT: Number(process.env.BREVO_TEMPLATE_ABANDONED_CHECKOUT || 1),
  DAILY_HOROSCOPE: Number(process.env.BREVO_TEMPLATE_DAILY_HOROSCOPE || 2),
};

// ── Contact management ──────────────────────────────────────────────

/**
 * Create or update a contact in Brevo with custom attributes.
 */
export async function upsertContact(
  email: string,
  attributes?: Record<string, string | number | boolean>,
  listIds?: number[]
) {
  if (!BREVO_API_KEY) {
    console.warn("[Brevo] API key not configured, skipping upsertContact");
    return;
  }

  const api = getContactsApi();

  const createContact = new SibApiV3Sdk.CreateContact();
  createContact.email = email;
  createContact.updateEnabled = true;
  if (attributes) createContact.attributes = attributes;
  if (listIds && listIds.length > 0) createContact.listIds = listIds;

  try {
    await api.createContact(createContact);
  } catch (err: any) {
    // 409 = contact already exists (handled by updateEnabled)
    if (err?.statusCode !== 409 && err?.status !== 409) {
      console.error("[Brevo] upsertContact error:", err?.body || err?.message || err);
    }
  }
}

/**
 * Add an existing contact to a specific list.
 */
export async function addContactToList(email: string, listId: number) {
  if (!BREVO_API_KEY) return;

  const api = getContactsApi();
  const contactEmails = new SibApiV3Sdk.AddContactToList();
  contactEmails.emails = [email];

  try {
    await api.addContactToList(listId, contactEmails);
  } catch (err: any) {
    console.error("[Brevo] addContactToList error:", err?.body || err?.message || err);
  }
}

/**
 * Remove a contact from a specific list.
 */
export async function removeContactFromList(email: string, listId: number) {
  if (!BREVO_API_KEY) return;

  const api = getContactsApi();
  const contactEmails = new SibApiV3Sdk.RemoveContactFromList();
  contactEmails.emails = [email];

  try {
    await api.removeContactFromList(listId, contactEmails);
  } catch (err: any) {
    console.error("[Brevo] removeContactFromList error:", err?.body || err?.message || err);
  }
}

// ── Event tracking (for automation triggers) ────────────────────────

/**
 * Track a custom event in Brevo for automation triggers.
 * Events like "checkout_started" and "checkout_completed" drive the
 * abandoned-checkout automation.
 */
export async function trackEvent(
  email: string,
  eventName: string,
  properties?: Record<string, string | number | boolean>
) {
  if (!BREVO_API_KEY) {
    console.warn("[Brevo] API key not configured, skipping trackEvent:", eventName);
    return;
  }

  // Brevo Events API uses a direct HTTP call
  try {
    const response = await fetch("https://in-automate.brevo.com/api/v2/trackEvent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ma-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        email,
        event: eventName,
        properties: properties || {},
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[Brevo] trackEvent error:", response.status, text);
    }
  } catch (err: any) {
    console.error("[Brevo] trackEvent fetch error:", err?.message || err);
  }
}

// ── Transactional emails ────────────────────────────────────────────

/**
 * Send a transactional email using a Brevo template.
 */
export async function sendTemplateEmail(
  to: { email: string; name?: string },
  templateId: number,
  params?: Record<string, string | number | boolean>
) {
  if (!BREVO_API_KEY) {
    console.warn("[Brevo] API key not configured, skipping sendTemplateEmail");
    return;
  }

  const api = getTransactionalApi();

  const email = new SibApiV3Sdk.SendSmtpEmail();
  email.to = [{ email: to.email, name: to.name || to.email }];
  email.templateId = templateId;
  if (params) email.params = params;

  try {
    await api.sendTransacEmail(email);
  } catch (err: any) {
    console.error("[Brevo] sendTemplateEmail error:", err?.body || err?.message || err);
  }
}

/**
 * Send a raw transactional email (no template).
 */
export async function sendEmail(
  to: { email: string; name?: string },
  subject: string,
  htmlContent: string
) {
  if (!BREVO_API_KEY) {
    console.warn("[Brevo] API key not configured, skipping sendEmail");
    return;
  }

  const api = getTransactionalApi();

  const email = new SibApiV3Sdk.SendSmtpEmail();
  email.to = [{ email: to.email, name: to.name || to.email }];
  email.subject = subject;
  email.htmlContent = htmlContent;
  email.sender = { email: "hello@palmcosmic.com", name: "PalmCosmic" };

  try {
    await api.sendTransacEmail(email);
  } catch (err: any) {
    console.error("[Brevo] sendEmail error:", err?.body || err?.message || err);
  }
}
