import { airpayConfig, fetchAirpayStatus, isAirpayReference, validateAirpayStatus } from "./airpay-api";
import { fulfillPayUPayment } from "./payu-fulfillment";
import { reconcileGatewayOrder } from "./payments/reconcile";
export async function reconcileAirpayOrder(id: string) {
  return reconcileGatewayOrder(id, {
    id: "airpay", label: "Airpay", leaseMs: 90000, validReference: isAirpayReference,
    assertOrder(order) { if (order.payment_mode !== airpayConfig().mode) throw new Error("Airpay order environment mismatch"); },
    async verify(order) { return validateAirpayStatus(order, await fetchAirpayStatus(order.id, order.payment_mode)); },
    async fulfillReports(order, result) {
      const fulfilled = await fulfillPayUPayment({ txnid: order.id, mihpayid: result.transactionId, status: "success", amount: (order.amount / 100).toFixed(2),
        email: order.customer_email, phone: order.customer_phone, firstname: order.customer_name, productinfo: order.product_name }, { verifiedByAirpayApi: true, paidAt: result.paidAt });
      if (!fulfilled.success) throw new Error("Unable to save report access");
    },
  });
}
