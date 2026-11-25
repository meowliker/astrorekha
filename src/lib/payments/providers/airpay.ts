import crypto from "node:crypto";
import { airpayConfig, airpayOrigin, initiateAirpayCheckout } from "../../airpay-api";
import type { PaymentProvider } from "../types";
export const airpayProvider: PaymentProvider = {
  id: "airpay", mode: () => airpayConfig().mode,
  createReportId: () => `arp${crypto.randomBytes(12).toString("hex")}`,
  async assertReady(db, production) {
    if (process.env.AIRPAY_ENABLED !== "true") throw new Error("Airpay is not enabled");
    const config = airpayConfig(); airpayOrigin();
    if (production && (config.mode !== "live" || process.env.AIRPAY_PRODUCTION_VERIFIED !== "true")) throw new Error("Complete Airpay live verification before activation");
    const schema = await db.rpc("airpay_schema_version");
    if (schema.error || schema.data !== 1) throw new Error("Apply the Airpay database migration before checkout");
  },
  createCheckout: request => initiateAirpayCheckout(request.order),
};
