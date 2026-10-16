import type { SoulmateOrderView } from "./soulmate-order-view";

export type SoulmateOrderStage = "ordered" | "generated" | "scheduled" | "delivered" | "failed";

export type SoulmateOrderStageView = {
  id: SoulmateOrderStage;
  label: "Ordered" | "Generated" | "Scheduled" | "Delivered" | "Failed";
  detail: string;
  timestamp: string | null;
};

function hasEveryRequiredAsset(order: SoulmateOrderView) {
  const required = order.entitlements?.required_assets || [];
  return required.length > 0 && required.every((kind) => order.assets.some((asset) => asset.kind === kind));
}

export function soulmateOrderStage(order: SoulmateOrderView): SoulmateOrderStageView {
  if (order.payment_status === "failed" || order.generation?.status === "needs_review" || order.email?.status === "needs_review") {
    return {
      id: "failed",
      label: "Failed",
      detail: order.generation?.last_error || order.email?.last_error || "Payment or delivery needs attention",
      timestamp: null,
    };
  }

  if (order.fulfillment_status === "delivered" || order.email?.status === "delivered") {
    return {
      id: "delivered",
      label: "Delivered",
      detail: "Delivery confirmed",
      timestamp: order.delivered_at || order.email?.delivered_at || null,
    };
  }

  if (["scheduled", "sent", "submitting"].includes(order.email?.status || "")) {
    return {
      id: "scheduled",
      label: "Scheduled",
      detail: order.email?.status === "sent" ? "Sent; awaiting delivery confirmation" : "Delivery email scheduled",
      timestamp: order.email?.scheduled_at || order.scheduled_send_at,
    };
  }

  if (order.review_status === "approved" || order.generation?.status === "ready" || hasEveryRequiredAsset(order)) {
    const uploadedAt = order.assets.reduce<string | null>((latest, asset) => {
      if (!latest || Date.parse(asset.uploaded_at) > Date.parse(latest)) return asset.uploaded_at;
      return latest;
    }, null);
    return {
      id: "generated",
      label: "Generated",
      detail: order.review_status === "approved" ? "Files approved for delivery" : "Purchased files prepared",
      timestamp: order.reviewed_at || uploadedAt,
    };
  }

  return {
    id: "ordered",
    label: "Ordered",
    detail: order.payment_status === "paid" ? "Payment confirmed" : `Payment ${order.payment_status}`,
    timestamp: order.paid_at || order.created_at,
  };
}
