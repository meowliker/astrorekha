import type { Metadata } from "next";
import { SoulmatePaymentProblem } from "../payment-problem";
export const metadata: Metadata = { title: "Payment help | AstroRekha", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() { return <SoulmatePaymentProblem kind="unverified" />; }
