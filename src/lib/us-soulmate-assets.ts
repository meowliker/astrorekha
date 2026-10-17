// US artwork is isolated; the shared artist portrait has no US replacement yet.
const base = (process.env.NEXT_PUBLIC_US_SOULMATE_ASSET_BASE_URL ||
  "https://pub-4f25ef2777b741de8ca7d6f9d52414dc.r2.dev/us-soulmate-lander").replace(/\/+$/, "");
export function soulmateAssetUrl(path: string) {
  if (!path.startsWith("/soulmate/")) throw new Error("Expected a public soulmate image path");
  if (path === "/soulmate/astrorekha-artist.png") return "https://pub-4f25ef2777b741de8ca7d6f9d52414dc.r2.dev/soulmate%20lander/astrorekha-artist.png";
  return `${base}/${path.slice("/soulmate/".length).split("/").map(encodeURIComponent).join("/")}`;
}
