import { getSupabaseAdmin } from "@/lib/supabase-admin";

const PREFIX = "storage://palm-images/";

export function isPrivateSketchImage(source: string): boolean {
  return source.startsWith("storage:");
}

export function sketchImageReference(path: string, userId: string): string {
  const parts = path.split("/");
  if (
    parts.length !== 3 ||
    parts[0] !== "recovered_sketches" ||
    parts[1] !== userId ||
    !/^[a-zA-Z0-9_-]+$/.test(userId) ||
    !/^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(parts[2])
  )
    throw new Error("Invalid private sketch reference");
  return PREFIX + path;
}

// Store a durable object reference, not an expiring signed URL or a public URL
// for a private bucket. Only authenticated callers may resolve the reference.
export async function resolveSketchImage(
  source: string,
  userId: string,
): Promise<string> {
  if (!isPrivateSketchImage(source)) return source;
  if (!source.startsWith(PREFIX))
    throw new Error("Invalid private sketch bucket");
  const path = source.slice(PREFIX.length);
  sketchImageReference(path, userId);
  const { data, error } = await getSupabaseAdmin()
    .storage.from("palm-images")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl)
    throw new Error("Private sketch image unavailable");
  return data.signedUrl;
}
