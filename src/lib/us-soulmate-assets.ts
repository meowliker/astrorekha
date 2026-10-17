// All US artwork, including the artist portrait, uses the dedicated R2 folder.
const base = (process.env.NEXT_PUBLIC_US_SOULMATE_ASSET_BASE_URL ||
  "https://pub-4f25ef2777b741de8ca7d6f9d52414dc.r2.dev/us-soulmate-lander").replace(/\/+$/, "");
export function soulmateAssetUrl(path: string) {
  if (!path.startsWith("/soulmate/")) throw new Error("Expected a public soulmate image path");
  return `${base}/${path.slice("/soulmate/".length).split("/").map(encodeURIComponent).join("/")}`;
}
