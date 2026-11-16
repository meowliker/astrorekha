import { isCustomerAccountPath } from "./customer-account-path";

/** Only return to known customer pages. Never follow a caller-supplied external URL. */
export function customerReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/reports";
  try {
    const url = new URL(value, "https://astrorekha.com");
    if (url.origin !== "https://astrorekha.com" || !(isCustomerAccountPath(url.pathname) || url.pathname === "/coupon-checkout")) return "/reports";
    return url.pathname + url.search + url.hash;
  } catch { return "/reports"; }
}
export function customerLoginPath(next: string): string {
  return `/login?next=${encodeURIComponent(customerReturnPath(next))}`;
}
