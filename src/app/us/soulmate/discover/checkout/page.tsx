import type { Metadata } from "next";
import CheckoutPage from "../../checkout/page";
import { SoulmateDiscoverProvider } from "@/components/soulmate-discover/Experience";
export const metadata: Metadata = { title: "AI Sketch Secure Card Checkout | AstroRekha", robots: { index: false, follow: false } };
export default function DiscoverUSCheckout(props: Parameters<typeof CheckoutPage>[0]) {
  return <SoulmateDiscoverProvider region="us"><CheckoutPage {...props} /></SoulmateDiscoverProvider>;
}
