import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Partner Analytics | AstroRekha",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PartnerAnalyticsLayout({ children }: { children: ReactNode }) {
  return children;
}
