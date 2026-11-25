import crypto from "node:crypto";
import { shiprocketConfig, shiprocketOrigin } from "../../shiprocket-checkout-api";
import { initiateShiprocketCheckout } from "../../shiprocket-checkout";
import type { PaymentProvider } from "../types";
export const shiprocketProvider: PaymentProvider = {
  id: "shiprocket", mode: () => shiprocketConfig().mode,
  createReportId: () => `src${crypto.randomBytes(12).toString("hex")}`,
  async assertReady(db, production) {
    if (process.env.SHIPROCKET_CHECKOUT_ENABLED !== "true") throw new Error("Fastrr is not enabled");
    const config = shiprocketConfig(); shiprocketOrigin();
    if (production && (config.mode !== "live" || process.env.SHIPROCKET_CHECKOUT_PRODUCTION_VERIFIED !== "true")) throw new Error("Complete Fastrr live verification before activation");
    if (production && (process.env.SHIPROCKET_CHECKOUT_WEBHOOK_SECRET || "").length < 32) throw new Error("Configure the authenticated Fastrr webhook before activation");
    const schema = await db.rpc("shiprocket_checkout_schema_version");
    if (schema.error || schema.data !== 1) throw new Error("Apply the Fastrr database migration before checkout");
  },
  createCheckout: request => initiateShiprocketCheckout(request.order),
};
