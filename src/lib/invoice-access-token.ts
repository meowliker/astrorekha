import crypto from "crypto";

type InvoiceTokenPayload = {
  txnIds: string[];
  exp: number;
};

function getInvoiceSecret(): string {
  return (
    process.env.INVOICE_PDF_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.PAYU_MERCHANT_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createInvoiceAccessToken(txnIds: string[], ttlSeconds = 60 * 60 * 24 * 14): string {
  const secret = getInvoiceSecret();
  if (!secret) {
    throw new Error("Missing invoice token signing secret.");
  }

  const payload: InvoiceTokenPayload = {
    txnIds: Array.from(new Set(txnIds.map((txnId) => txnId.trim()).filter(Boolean))),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyInvoiceAccessToken(token: string): string[] {
  const secret = getInvoiceSecret();
  if (!secret) {
    throw new Error("Missing invoice token signing secret.");
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid invoice token.");
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw new Error("Invalid invoice token signature.");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as InvoiceTokenPayload;
  if (!Array.isArray(payload.txnIds) || !payload.txnIds.length) {
    throw new Error("Invoice token has no transactions.");
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Invoice token has expired.");
  }

  return payload.txnIds.map((txnId) => txnId.trim()).filter(Boolean);
}
