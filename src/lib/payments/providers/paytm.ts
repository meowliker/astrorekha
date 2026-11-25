import { paytmConfig, initiatePaytmCheckout } from "../../paytm-api";
import { createPaytmOrderId } from "../../paytm-order-id";
import type { PaymentProvider } from "../types";
export const paytmProvider: PaymentProvider = {
  id: "paytm", mode: () => paytmConfig().mode, createReportId: createPaytmOrderId,
  async assertReady(db, production) {
    if (process.env.PAYTM_ENABLED !== "true") throw new Error("Paytm backup is not enabled");
    if (production && paytmConfig().mode !== "live") throw new Error("Paytm production setup is not enabled");
    paytmConfig();
    if (production) {
      const schema = await db.rpc("paytm_backup_schema_version");
      if (schema.error || schema.data !== 1) throw new Error("Apply the Paytm database migration first");
    }
  },
  createCheckout: request => initiatePaytmCheckout(request.order),
};
