import type { SoulmateEntitlements, SoulmateLineItem, SoulmateAssetKind } from "./us-soulmate-cart";
export type SoulmateOrderView = {
  id: string; plan: string; product_info: string; checkout_environment: "local" | "preview" | "production" | "unknown"; customer_name: string; customer_email: string; customer_phone: string | null;
  answers: Record<string,string>; answer_revision: number; answers_updated_at: string | null; catalog_version: number; line_items: SoulmateLineItem[]; add_ons: string[];
  entitlements: SoulmateEntitlements; base_amount: number; gst_amount: number; amount: number;
  payment_status: string; payment_mode: string; stripe_payment_id: string | null; paid_at: string | null;
  created_at: string; scheduled_send_at: string | null; delivery_due_at: string | null;
  review_status: string; reviewed_at: string | null; review_note: string | null; fulfillment_status: string;
  delivered_at: string | null;
  generation: { status: string; generation_attempts: number; last_error: string | null; storage_path: string | null } | null;
  email: { status: string; scheduled_at: string; submitted_at: string | null; sent_at: string | null; delivered_at: string | null; last_error: string | null } | null;
  assets: { kind: SoulmateAssetKind; filename: string; uploaded_at: string; size_bytes: number }[];
};
