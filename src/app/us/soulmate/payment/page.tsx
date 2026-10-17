import type { Metadata } from "next";
import { SoulmatePaymentStatus } from "./payment-status";

export const metadata: Metadata = { title: "Your sketch order | Astro Rekha", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page({ searchParams }: { searchParams: { order?: string } }) {
  return <SoulmatePaymentStatus orderId={searchParams.order || ""} />;
}
