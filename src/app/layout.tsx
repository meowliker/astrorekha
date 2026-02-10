import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { MetaPixel } from "@/components/MetaPixel";
import { Clarity } from "@/components/Clarity";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "PalmCosmic - Discover Your Destiny",
  description: "AI-powered palm reading and cosmic insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${cormorant.variable} font-sans antialiased min-h-screen`}
      >
        <MetaPixel />
        <GoogleAnalytics />
        <Clarity />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
