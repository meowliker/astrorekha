/** Keep report inputs private, out of gateway metadata and analytics payloads. */
export function validCheckoutPalm(value: unknown): value is string {
  return typeof value === "string" && value.length <= 1500000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
