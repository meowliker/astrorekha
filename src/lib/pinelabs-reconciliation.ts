import { fetchPineLabsOrder, pineLabsConfig, isPineLabsReference, validatePineLabsOrder, type PineLabsOrder } from "./pinelabs-api";
import { fulfillPayUPayment } from "./payu-fulfillment";
import { reconcileGatewayOrder } from "./payments/reconcile";

/** The optional remote order is server-fetched by the authenticated notification handler. */
export async function reconcilePineLabsOrder(id: string, verifiedRemote?: PineLabsOrder) {
  return reconcileGatewayOrder(id, {
    id: "pinelabs", label: "Pine Labs", leaseMs: 90000, validReference: isPineLabsReference,
    assertOrder(order) {
      if (order.payment_mode !== pineLabsConfig().mode) throw new Error("Pine Labs order environment mismatch");
    },
    async verify(order) {
      const remote = verifiedRemote || await fetchPineLabsOrder(order.id, order.payment_mode);
      return { ...validatePineLabsOrder(order, remote), providerOrderId: remote.order_id };
    },
    async fulfillReports(order, result) {
      const fulfilled = await fulfillPayUPayment({ txnid: order.id, mihpayid: result.transactionId, status: "success",
        amount: (order.amount / 100).toFixed(2), email: order.customer_email, phone: order.customer_phone,
        firstname: order.customer_name, productinfo: order.product_name }, { verifiedByPineLabsApi: true, paidAt: result.paidAt });
      if (!fulfilled.success) throw new Error("Unable to save report access");
    },
  });
}
