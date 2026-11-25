import { shiprocketConfig, fetchShiprocketOrder, isShiprocketReference, validateShiprocketOrder } from "./shiprocket-checkout-api";
import { shiprocketSession } from "./shiprocket-checkout";
import { fulfillPayUPayment } from "./payu-fulfillment";
import { reconcileGatewayOrder } from "./payments/reconcile";
export async function reconcileShiprocketOrder(id: string) {
  return reconcileGatewayOrder(id, {
    id: "shiprocket", label: "Fastrr", leaseMs: 60000, validReference: isShiprocketReference,
    assertOrder(order) { if (order.payment_mode !== shiprocketConfig().mode) throw new Error("Fastrr order environment mismatch"); },
    async verify(order) {
      const session = await shiprocketSession(order.id);
      if (!session?.provider_order_id) return { status: "pending" };
      if (order.gateway_order_id && order.gateway_order_id !== session.provider_order_id) throw new Error("Fastrr order binding mismatch");
      const result = validateShiprocketOrder({ ...order, gateway_order_id: session.provider_order_id }, await fetchShiprocketOrder(session.provider_order_id, order.payment_mode), session.variant_id);
      return { ...result, providerOrderId: session.provider_order_id };
    },
    async fulfillReports(order, result) {
      const fulfilled = await fulfillPayUPayment({ txnid: order.id, mihpayid: result.transactionId, status: "success", amount: (order.amount / 100).toFixed(2),
        email: order.customer_email, phone: order.customer_phone, firstname: order.customer_name, productinfo: order.product_name }, { verifiedByShiprocketApi: true, paidAt: result.paidAt });
      if (!fulfilled.success) throw new Error("Unable to save report access");
    },
  });
}
