export const partnerFunnels = [
  { key: "astrorekha", label: "Main AstroRekha funnel", paths: ["/", "/discover"] },
  { key: "soulmate", label: "Soulmate funnel", paths: ["/soulmate", "/soulmate/discover"] },
  { key: "us-soulmate", label: "US Soulmate funnel", paths: ["/us/soulmate", "/us/soulmate/discover"] },
] as const;

export type PartnerFunnel = (typeof partnerFunnels)[number]["key"];
