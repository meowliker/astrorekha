import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/page-previews", "/payment/"] },
    sitemap: "https://astrorekha.com/sitemap.xml",
  };
}
