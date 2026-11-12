import { type PricingConfig } from '@/lib/pricing';
import { isReportAvailableForPurchase } from '@/lib/customer-report-visibility';
import snapshot from './inr-catalog-snapshot.json';
const DEFAULT_PRICING = snapshot as PricingConfig;
export const US_MAIN_FUNNEL = 'us_main';
export type UsProduct = { id: string; name: string; type: 'bundle' | 'upsell'; cents: number | null; features: string[]; coins: number };
export type UsPrices = Record<string, number>;
// Fixed introductory USD list: Indian final checkout value / 93.75 INR per USD.
// Never treat INR as dollars or recalculate existing order amounts.
export const INTRO_USD_INR = 93.75;
export const INTRO_PRICES: UsPrices = Object.fromEntries([...DEFAULT_PRICING.bundles, ...DEFAULT_PRICING.upsells].map(p => [p.id, Math.round(p.price * 1.18 / INTRO_USD_INR * 100)]));
export function usCatalog(prices: UsPrices = {}): UsProduct[] {
  return [
    ...DEFAULT_PRICING.bundles.filter(b => b.active).map(b => ({ id: b.id, name: b.name, type: 'bundle' as const, features: b.features, coins: b.id === 'palm-reading' || b.id === 'palm-birth' ? 15 : 30 })),
    ...DEFAULT_PRICING.upsells.filter(p => p.active && isReportAvailableForPurchase(p.feature)).map(p => ({ id: p.id, name: p.name, type: 'upsell' as const, features: [p.feature], coins: 0 })),
  ].map(p => ({ ...p, cents: Number.isSafeInteger(prices[p.id]) && prices[p.id] >= 50 && prices[p.id] <= 100000 ? prices[p.id] : null }));
}
export function usPricing(prices: UsPrices = {}): PricingConfig {
  const convert = <T extends {id: string}>(p: T) => ({ ...p, price: (prices[p.id] || 0) / 100, displayPrice: (prices[p.id] || 0) / 100, originalPrice: 0, discount: '' });
  return { bundles: DEFAULT_PRICING.bundles.map(convert), upsells: DEFAULT_PRICING.upsells.map(convert), reports: [], coinPackages: [] };
}
export function quoteUsBasket(ids: string[], type: 'bundle' | 'upsell', prices: UsPrices) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 12 || new Set(ids).size !== ids.length || (type === 'bundle' && ids.length !== 1)) throw new Error('Invalid basket');
  const catalog = usCatalog(prices);
  const lines = ids.map(id => {
    const p = catalog.find(p => p.id === id && p.type === type);
    if (!p || p.cents === null) throw new Error('USD pricing is not configured for this product');
    return p;
  });
  return { lines, cents: lines.reduce((s,p) => s + p.cents!, 0), features: [...new Set(lines.flatMap(p => p.features))], coins: lines.reduce((s,p) => s + p.coins, 0) };
}
