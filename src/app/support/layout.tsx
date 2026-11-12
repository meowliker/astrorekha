import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "AstroRekha Support",
  robots: { index: false, follow: false },
};
export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
