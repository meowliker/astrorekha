import type { Metadata } from "next";
import "./fonts.css";
import "./globals.css";
import { AppTelemetry } from "@/components/AppTelemetry";

export const metadata: Metadata = {
  title: "AstroRekha - Discover Your Destiny",
  description: "AI-powered palm reading and cosmic insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preload" href="/fonts/e4af272ccee01ff0-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/7b89a4fd5e90ede0-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body
        className={"astrorekha-fonts font-sans antialiased min-h-screen"}
      >
        <AppTelemetry>{children}</AppTelemetry>
      </body>
    </html>
  );
}
