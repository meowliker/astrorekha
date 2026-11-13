/** Standalone funnels have their own order workspaces, even when mirrored in payments.
 * Product names are deliberately ignored: main-funnel bundles/add-ons can include a Soulmate Sketch.
 */
export function isStandaloneSoulmatePayment(row: { id?: unknown; payu_txn_id?: unknown }): boolean {
  return [row.id, row.payu_txn_id].some((value) => /^(?:pay_)?(?:sm_|us_sm_)/.test(String(value || "")));
}
