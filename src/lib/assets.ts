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
