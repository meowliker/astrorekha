/** Display labels are independent of immutable payment snapshots and gateway hashes. */
export const COMPLETE_SOULMATE_NAME = "Complete Soulmate Vision";
export const COMPLETE_SOULMATE_TITLE = `${COMPLETE_SOULMATE_NAME}: Fast Delivery + Description + Color Upgrade`;
export function soulmateItemName(item: { id: string; name: string }) {
  return item.id === "soulmate_express" ? COMPLETE_SOULMATE_TITLE : item.name;
}

/** Receipts omit checkout merchandising labels without changing purchased items. */
export function soulmateReceiptItemName(item: { id: string; name: string }) {
  return soulmateItemName(item).replace(/\s*\[(?:RECOMMENDED|POPULAR)\]/gi, "").trim();
}
