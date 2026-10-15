import type { Metadata } from "next";
import { SoulmateCheckout } from "../soulmate-checkout";

export const metadata: Metadata = {
  title: "Your Sketch · Secure Checkout | Astro Rekha",
  robots: { index: false, follow: false },
};

export default function CheckoutPage({ searchParams }: { searchParams: { plan?: string } }) {
  const planId = searchParams.plan === "express" ? "express" : "standard";
  return <SoulmateCheckout key={planId} planId={planId} />;
}
