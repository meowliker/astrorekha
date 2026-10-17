// Merchant-configured US checkout tax. Customer-facing text displays only "Tax".
export function usTaxCents(subtotalCents: number) {
  return Math.round(subtotalCents * 18 / 100);
}
