import type { Metadata } from "next";
import { SoulmatePaymentStatus } from "./payment-status";

export const metadata: Metadata = { title: "Your sketch order | Astro Rekha", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ searchParams: searchParamsPromise }: { searchParams: Promise<{ order?: string }> }) {
  const searchParams = await searchParamsPromise;
  return <SoulmatePaymentStatus orderId={searchParams.order || ""} />;
}
