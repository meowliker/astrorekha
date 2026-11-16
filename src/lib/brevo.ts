import { BrevoClient, type Brevo } from "@getbrevo/brevo";
import { recordBrevoSendFailure } from "@/lib/brevo-send-monitoring";

// Transactional email only: receipts, invoices, authentication and paid-report delivery.

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "team@astrorekha.com";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "AstroRekha";

// ── API instances ───────────────────────────────────────────────────

function getClient() {
  // Preserve one send attempt: retry/reconciliation is owned by our workers.
  return new BrevoClient({ apiKey: BREVO_API_KEY, maxRetries: 0 });
}

function getTransactionalApi() {
  return getClient().transactionalEmails;
}

function brevoError(error: unknown) {
  return error && typeof error === "object"
    ? error as { statusCode?: number; status?: number; body?: unknown; message?: string }
    : { message: String(error) };
}

// ── Transactional emails ────────────────────────────────────────────

/**
 * Send a raw transactional email (no template).
 */
export async function sendEmail(
  to: { email: string; name?: string },
  subject: string,
  htmlContent: string
): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.warn("[Brevo] API key not configured, skipping sendEmail");
    await recordBrevoSendFailure();
    return false;
  }

  const api = getTransactionalApi();

  const email: Brevo.SendTransacEmailRequest = {};
  email.to = [{ email: to.email, name: to.name || to.email }];
  email.subject = subject;
  email.htmlContent = htmlContent;
  email.sender = { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME };

  try {
    await api.sendTransacEmail(email);
    return true;
  } catch (error: unknown) {
    const err = brevoError(error);
    console.error("[Brevo] sendEmail error:", err?.body || err?.message || err);
    await recordBrevoSendFailure();
    return false;
  }
}

export async function sendEmailWithAttachments(
  to: { email: string; name?: string },
  subject: string,
  htmlContent: string,
  attachments: Array<{ name: string; content: string }>
) {
  if (!BREVO_API_KEY) {
    console.warn("[Brevo] API key not configured, skipping sendEmailWithAttachments");
    await recordBrevoSendFailure();
    return;
  }

  const api = getTransactionalApi();

  const email: Brevo.SendTransacEmailRequest = {};
  email.to = [{ email: to.email, name: to.name || to.email }];
  email.subject = subject;
  email.htmlContent = htmlContent;
  email.sender = { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME };
  email.attachment = attachments;

  try {
    await api.sendTransacEmail(email);
  } catch (error: unknown) {
    const err = brevoError(error);
    console.error("[Brevo] sendEmailWithAttachments error:", err?.body || err?.message || err);
    await recordBrevoSendFailure();
  }
}
