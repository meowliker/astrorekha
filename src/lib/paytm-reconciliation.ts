import { isPaytmOrderId } from "./paytm-order-id";
import { fetchPaytmStatus, validatePaytmStatus } from "./paytm-api";
import { fulfillPayUPayment } from "./payu-fulfillment";
import { reconcileGatewayOrder } from "./payments/reconcile";

export function paytmPaidAt(value?: string, now = new Date()) {
  const date = value ? new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(" ", "T") + "+05:30") : now;
  return Number.isFinite(date.getTime()) && date <= now ? date.toISOString() : now.toISOString();
}
/** Compatibility entry point used by existing callbacks and cron jobs. */
export async function reconcilePaytmOrder(id: string) {
  return reconcileGatewayOrder(id, {
    id: "paytm", label: "Paytm", leaseMs: 45000, validReference: isPaytmOrderId,
    async verify(order) {
      const remote = await fetchPaytmStatus(order.id, order.payment_mode);
      return { status: validatePaytmStatus(order, remote), transactionId: remote.txnId,
        paidAt: paytmPaidAt(remote.txnDate) };
    },
    async fulfillReports(order, result) {
      const fulfilled = await fulfillPayUPayment({ txnid: order.id, mihpayid: result.transactionId, status: "success",
        amount: (order.amount / 100).toFixed(2), email: order.customer_email, phone: order.customer_phone,
        firstname: order.customer_name, productinfo: order.product_name }, { verifiedByPaytmApi: true, paidAt: result.paidAt });
      if (!fulfilled.success) throw new Error("Unable to save report access");
    },
  });
}
