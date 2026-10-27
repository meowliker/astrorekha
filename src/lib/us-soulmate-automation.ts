/** US-only launch controls. Enable only when the owner explicitly requests activation.
 * Credentials alone must never start report generation or scheduled delivery.
 */
export const usSoulmateAutomation: Readonly<{ reportsEnabled: boolean; deliveryEnabled: boolean }> = Object.freeze({
  reportsEnabled: true,
  deliveryEnabled: true,
});
