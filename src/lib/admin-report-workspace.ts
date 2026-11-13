/** Workspace identity is in the URL, never in shared browser storage. */
export function reportSource(path: string): "meta" | "google" {
  return path === "/admin/google" || path.startsWith("/admin/google/") ? "google" : "meta";
}
export function reportWorkspaceUrl(url: string, source: string): string {
  const parsed = new URL(url, "https://astrorekha.com");
  if (source === "google" && parsed.pathname.startsWith("/admin/") && !parsed.pathname.startsWith("/admin/google/")) {
    const match = parsed.pathname.match(/^\/admin\/(?:(soulmate|us-soulmate|us-main)\/)?(revenue|orders|tracking|profit|analytics)(\/.*)?$/);
    if (match) parsed.pathname = `/admin/google/${match[1] || "astrorekha"}/${match[2]}${match[3] || ""}`;
  }
  if (url === "/admin" && source === "google") return "/admin/google";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
