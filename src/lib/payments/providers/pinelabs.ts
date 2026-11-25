import crypto from "node:crypto";
import { pineLabsConfig, pineLabsSigningConfigured, initiatePineLabsCheckout } from "../../pinelabs-api";
import type { PaymentProvider } from "../types";
export const pineLabsProvider: PaymentProvider = {
  id: "pinelabs", mode: () => pineLabsConfig().mode,
  createReportId: () => `pnl${crypto.randomBytes(12).toString("hex")}`,
  async assertReady(db, production) {
    if (process.env.PINELABS_ENABLED !== "true") throw new Error("Pine Labs backup is not enabled");
    if (production && pineLabsConfig().mode !== "live") throw new Error("Pine Labs production setup is not enabled");
    pineLabsConfig();
    if (!pineLabsSigningConfigured()) throw new Error("Pine Labs signing keys are not configured");
    const schema = await db.rpc("pinelabs_backup_schema_version");
    if (schema.error || schema.data !== 1) throw new Error("Apply the Pine Labs database migration before checkout");
  },
  createCheckout: request => initiatePineLabsCheckout(request.order),
};
