import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/discover", "/soulmate", "/us/soulmate", "/soulmate/discover", "/us/soulmate/discover", "/Terms/about-us.html", "/Terms/contact-us.html",
    "/Terms/privacy-policy.html", "/Terms/terms-of-service.html", "/Terms/billing-terms.html", "/Terms/money-back-policy.html"]
    .map(path => ({ url: `https://astrorekha.com${path}` }));
}
