const configuredAssetBaseUrl = process.env.NEXT_PUBLIC_ASSET_BASE_URL?.replace(/\/+$/, "");

export function assetUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!configuredAssetBaseUrl) {
    return normalizedPath;
  }

  return `${configuredAssetBaseUrl}${normalizedPath}`;
}

export const ASTROREKHA_ASSETS = {
  logo: assetUrl("/logo.webp"),
  elysia: assetUrl("/elysia.webp"),
  palmScanner: assetUrl("/palmscanner-optimized.mp4"),
  palmOutline: assetUrl("/palmoutline.webp"),
  male: assetUrl("/male.webp"),
  female: assetUrl("/female.webp"),
};

// The uploaded folder is named "soulmate lander" in the existing R2 bucket.
// Keep this scoped: other app assets retain their existing base URL and paths.
const soulmateAssetBaseUrl = (
  process.env.NEXT_PUBLIC_SOULMATE_ASSET_BASE_URL ||
  "https://pub-4f25ef2777b741de8ca7d6f9d52414dc.r2.dev/soulmate%20lander"
).replace(/\/+$/, "");

export function soulmateAssetUrl(path: string) {
  if (!path.startsWith("/soulmate/")) throw new Error("Expected a public soulmate image path");
  const key = path.slice("/soulmate/".length).split("/").map(encodeURIComponent).join("/");
  return `${soulmateAssetBaseUrl}/${key}`;
}
