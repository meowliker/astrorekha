// Reuse the existing public artwork without inheriting India funnel configuration.
const base = (process.env.NEXT_PUBLIC_US_SOULMATE_ASSET_BASE_URL ||
  "https://pub-4f25ef2777b741de8ca7d6f9d52414dc.r2.dev/soulmate%20lander").replace(/\/+$/, "");
export function soulmateAssetUrl(path: string) {
  if (!path.startsWith("/soulmate/")) throw new Error("Expected a public soulmate image path");
  return `${base}/${path.slice("/soulmate/".length).split("/").map(encodeURIComponent).join("/")}`;
}
