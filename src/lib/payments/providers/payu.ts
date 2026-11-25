import crypto from "node:crypto";
import type { PaymentProvider } from "../types";

export const payuProvider: PaymentProvider = {
  id: "payu",
  mode(kind) {
    const mode = process.env.PAYU_MODE;
    // Soulmate has always required an explicit mode before saving its receipt.
    if (kind === "soulmate" && (!process.env.PAYU_MERCHANT_KEY || !process.env.PAYU_MERCHANT_SALT || (mode !== "live" && mode !== "test"))) {
      throw new Error("Payment configuration unavailable");
    }
    return mode === "live" ? "live" : "test";
  },
  createReportId: () => `pay_${Date.now().toString(36)}${crypto.randomBytes(5).toString("hex")}`,
  async assertReady(_db, production) {
    // Keep legacy checkout readiness; the checkout validates credentials separately.
    if (production && (!process.env.PAYU_MERCHANT_KEY || !process.env.PAYU_MERCHANT_SALT)) throw new Error("PayU is not configured");
  },
  async createCheckout(request) {
    if (request.kind === "soulmate") {
      const { checkoutParameters } = await import("../../soulmate-payu");
      return checkoutParameters(request.order, request.origin);
    }
    const p = request.payu, salt = process.env.PAYU_MERCHANT_SALT;
    if (!p || !salt || !p.key || p.key !== process.env.PAYU_MERCHANT_KEY) throw new Error("PayU not configured");
    if (p.txnid !== request.order.id || Math.round(Number(p.amount) * 100) !== request.order.amount) throw new Error("PayU checkout does not match saved order");
    const hash = crypto.createHash("sha512").update(`${p.key}|${p.txnid}|${p.amount}|${p.productinfo}|${p.firstname}|${p.email}|${p.udf1 || ""}|${p.udf2 || ""}|${p.udf3 || ""}|${p.udf4 || ""}|${p.udf5 || ""}||||||${salt}`).digest("hex");
    return { txnId: p.txnid, amount: p.amount, productInfo: p.productinfo, hash, key: p.key,
      firstName: p.firstname, email: p.email, phone: p.phone,
      udf1: p.udf1, udf2: p.udf2, udf3: p.udf3, udf4: p.udf4, udf5: p.udf5 };
  },
};
