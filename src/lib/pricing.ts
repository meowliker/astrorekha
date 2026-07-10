// Pricing utility functions
// Fetches dynamic pricing from database with fallback to defaults

export interface BundlePlan {
  id: string;
  name: string;
  price: number;
  displayPrice: number; // Price shown on paywall (can differ from actual PayU price)
  originalPrice: number;
  discount: string;
  description: string;
  features: string[];
  featureList: string[];
  popular?: boolean;
  limitedOffer?: boolean;
  active: boolean;
}

export interface UpsellPlan {
  id: string;
  name: string;
  price: number;
  displayPrice: number;
  originalPrice: number;
  discount: string;
  description: string;
  feature: string;
  active: boolean;
}

export interface ReportPlan {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  feature: string;
  active: boolean;
}

export interface CoinPackage {
  id: string;
  coins: number;
  price: number;
  displayPrice: number;
  originalPrice: number;
  active: boolean;
}

export interface PricingConfig {
  bundles: BundlePlan[];
  upsells: UpsellPlan[];
  reports: ReportPlan[];
  coinPackages: CoinPackage[];
}

function mergeById<T extends { id: string }>(defaults: T[], incoming?: T[]): T[] {
  const incomingList = Array.isArray(incoming) ? incoming : [];
  const incomingMap = new Map(incomingList.map((item) => [item.id, item]));
  const mergedDefaults = defaults.map((d) => ({ ...d, ...(incomingMap.get(d.id) || {}) }));
  const extraIncoming = incomingList.filter((item) => !defaults.some((d) => d.id === item.id));
  return [...mergedDefaults, ...extraIncoming];
}

function canonicalizeBundleFeatures(bundleId: string, features: string[]): string[] {
  const unique = new Set(features || []);

  if (bundleId === "palm-birth-compat") {
    unique.add("palmReading");
    unique.add("birthChart");
    unique.add("compatibilityTest");
    unique.add("futurePartnerReport");
    return ["palmReading", "birthChart", "compatibilityTest", "futurePartnerReport"];
  }

  if (bundleId === "palm-birth-sketch") {
    unique.add("palmReading");
    unique.add("birthChart");
    unique.add("soulmateSketch");
    unique.add("futurePartnerReport");
    return ["palmReading", "birthChart", "soulmateSketch", "futurePartnerReport"];
  }

  return Array.from(unique);
}

function applyBundleOverrides(bundles: BundlePlan[]): BundlePlan[] {
  return bundles.map((bundle) => {
    if (bundle.id === "palm-birth-compat") {
      return {
        ...bundle,
        name: "Palm + Birth Chart + Compatibility Report + Future Partner Report",
        description: "Complete cosmic package with compatibility + future partner report.",
        features: canonicalizeBundleFeatures(bundle.id, bundle.features),
        featureList: [
          "Everything in Palm + Birth Chart",
          "Full compatibility analysis",
          "Future partner report",
        ],
        active: false,
      };
    }

    if (bundle.id === "palm-birth-sketch") {
      return {
        ...bundle,
        name: "Palm + Birth Chart + Soulmate Sketch + Future Partner Report",
        description: "Palm reading + birth chart + soulmate sketch + future partner report.",
        features: canonicalizeBundleFeatures(bundle.id, bundle.features),
        featureList: [
          "Everything in Palm + Birth Chart",
          "One AI soulmate sketch",
          "Future partner report",
        ],
        active: true,
      };
    }

    return {
      ...bundle,
      features: canonicalizeBundleFeatures(bundle.id, bundle.features),
    };
  });
}

export function normalizePricing(raw?: Partial<PricingConfig> | null): PricingConfig {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_PRICING;
  }

  const mergedBundles = mergeById(DEFAULT_PRICING.bundles, raw.bundles as BundlePlan[] | undefined);

  return {
    bundles: applyBundleOverrides(mergedBundles),
    upsells: mergeById(DEFAULT_PRICING.upsells, raw.upsells as UpsellPlan[] | undefined),
    reports: mergeById(DEFAULT_PRICING.reports, raw.reports as ReportPlan[] | undefined),
    coinPackages: mergeById(DEFAULT_PRICING.coinPackages, raw.coinPackages as CoinPackage[] | undefined),
  };
}

// Default pricing (fallback)
export const DEFAULT_PRICING: PricingConfig = {
  bundles: [
    {
      id: "palm-reading",
      name: "Palm Reading",
      price: 559,
      displayPrice: 559,
      originalPrice: 699,
      discount: "20% OFF",
      description: "Personalized palm reading report delivered instantly.",
      features: ["palmReading"],
      featureList: [
        "Complete palm line analysis",
        "Life, heart, head line insights",
        "Personality traits revealed",
      ],
      popular: false,
      limitedOffer: false,
      active: true,
    },
    {
      id: "palm-birth",
      name: "Palm + Birth Chart",
      price: 839,
      displayPrice: 839,
      originalPrice: 1199,
      discount: "30% OFF",
      description: "Deep palm insights plus your full zodiac reading.",
      features: ["palmReading", "birthChart"],
      featureList: [
        "Everything in Palm Reading",
        "Complete birth chart analysis",
        "Planetary positions & houses",
      ],
      popular: true,
      limitedOffer: false,
      active: true,
    },
    {
      id: "palm-birth-compat",
      name: "Palm + Birth Chart + Compatibility Report + Future Partner Report",
      price: 1599,
      displayPrice: 1599,
      originalPrice: 3199,
      discount: "50% OFF",
      description: "Complete cosmic package with compatibility + future partner report.",
      features: ["palmReading", "birthChart", "compatibilityTest", "futurePartnerReport"],
      featureList: [
        "Everything in Palm + Birth Chart",
        "Full compatibility analysis",
        "Future partner report",
      ],
      popular: false,
      limitedOffer: true,
      active: false,
    },
    {
      id: "palm-birth-sketch",
      name: "Palm + Birth Chart + Soulmate Sketch + Future Partner Report",
      price: 1599,
      displayPrice: 1599,
      originalPrice: 3199,
      discount: "50% OFF",
      description: "Palm reading + birth chart + soulmate sketch + future partner report.",
      features: ["palmReading", "birthChart", "soulmateSketch", "futurePartnerReport"],
      featureList: [
        "Everything in Palm + Birth Chart",
        "One AI soulmate sketch",
        "Future partner report",
      ],
      popular: false,
      limitedOffer: true,
      active: true,
    },
  ],
  upsells: [
    {
      id: "2026-predictions",
      name: "2026 Future Predictions",
      price: 499,
      displayPrice: 499,
      originalPrice: 999,
      discount: "50% OFF",
      description: "Detailed predictions for your 2026 journey.",
      feature: "prediction2026",
      active: true,
    },
    {
      id: "compatibility",
      name: "Compatibility Report",
      price: 499,
      displayPrice: 499,
      originalPrice: 999,
      discount: "50% OFF",
      description: "Check your love match and relationship chemistry.",
      feature: "compatibilityTest",
      active: true,
    },
    {
      id: "birth-chart",
      name: "Birth Chart Report",
      price: 499,
      displayPrice: 499,
      originalPrice: 999,
      discount: "50% OFF",
      description: "Unlock your complete astrological blueprint.",
      feature: "birthChart",
      active: true,
    },
    {
      id: "soulmate-sketch",
      name: "Soulmate Sketch",
      price: 499,
      displayPrice: 499,
      originalPrice: 999,
      discount: "50% OFF",
      description: "Generate your one-time AI soulmate portrait.",
      feature: "soulmateSketch",
      active: true,
    },
    {
      id: "vastu-shastra-guide",
      name: "Complete Vastu Shastra Guide Ebook",
      price: 297,
      displayPrice: 297,
      originalPrice: 999,
      discount: "70% OFF",
      description: "150+ page PDF guide for home, entrance, remedies, office, and business Vastu.",
      feature: "vastuShastraGuide",
      active: true,
    },
  ],
  reports: [
    {
      id: "report-2026",
      name: "2026 Future Predictions",
      price: 582,
      originalPrice: 999,
      feature: "prediction2026",
      active: true,
    },
    {
      id: "report-birth-chart",
      name: "Birth Chart Report",
      price: 582,
      originalPrice: 999,
      feature: "birthChart",
      active: true,
    },
    {
      id: "report-compatibility",
      name: "Compatibility Report",
      price: 582,
      originalPrice: 999,
      feature: "compatibilityTest",
      active: true,
    },
    {
      id: "report-soulmate-sketch",
      name: "Soulmate Sketch",
      price: 582,
      originalPrice: 999,
      feature: "soulmateSketch",
      active: true,
    },
    {
      id: "report-future-partner",
      name: "Future Partner Report",
      price: 582,
      originalPrice: 999,
      feature: "futurePartnerReport",
      active: true,
    },
    {
      id: "report-vastu-shastra-guide",
      name: "Complete Vastu Shastra Guide Ebook",
      price: 297,
      originalPrice: 999,
      feature: "vastuShastraGuide",
      active: true,
    },
  ],
  coinPackages: [
    { id: "coins-50", coins: 50, price: 416, displayPrice: 416, originalPrice: 500, active: true },
    { id: "coins-150", coins: 150, price: 1082, displayPrice: 1082, originalPrice: 1500, active: true },
    { id: "coins-300", coins: 300, price: 1666, displayPrice: 1666, originalPrice: 2500, active: true },
    { id: "coins-500", coins: 500, price: 2499, displayPrice: 2499, originalPrice: 3500, active: true },
  ],
};

// Server-side function to get pricing
export async function getPricing(): Promise<PricingConfig> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/pricing`, {
      cache: 'no-store',
    });
    const data = await response.json();
    return normalizePricing(data.pricing);
  } catch {
    return DEFAULT_PRICING;
  }
}

// Get bundle by ID
export function getBundleById(pricing: PricingConfig, bundleId: string): BundlePlan | undefined {
  return pricing.bundles.find(b => b.id === bundleId);
}

// Get upsell by ID
export function getUpsellById(pricing: PricingConfig, upsellId: string): UpsellPlan | undefined {
  return pricing.upsells.find(u => u.id === upsellId);
}

// Get report by ID
export function getReportById(pricing: PricingConfig, reportId: string): ReportPlan | undefined {
  return pricing.reports.find(r => r.id === reportId);
}

// Get coin package by ID
export function getCoinPackageById(pricing: PricingConfig, packageId: string): CoinPackage | undefined {
  return pricing.coinPackages.find(c => c.id === packageId);
}
