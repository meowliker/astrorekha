import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoulmatePaymentProblem } from "../payment-problem";
import { SoulmateOrderConfirmation } from "../order-confirmation";

export const metadata: Metadata = { title: "Order confirmation preview | AstroRekha", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams: searchParamsPromise }: { searchParams: Promise<{ state?: string }> }) {
  const searchParams = await searchParamsPromise;
  if (process.env.NODE_ENV !== "development") notFound();
  if (["failed", "pending", "unverified"].includes(searchParams.state || "")) return <SoulmatePaymentProblem kind={searchParams.state as "failed" | "pending" | "unverified"} orderId="us_sm_preview_order" />;
  return <SoulmateOrderConfirmation orderId="us_sm_preview_order" />;
}
