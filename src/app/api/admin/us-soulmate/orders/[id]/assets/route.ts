import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin, validSoulmateId } from "@/lib/us-soulmate-admin";
import { SKETCH_BUCKET } from "@/lib/us-soulmate-fulfillment";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validSoulmateId(params.id)) return new NextResponse(null, { status: 400 });
  const result = await db.from("us_soulmate_order_assets").select("kind,storage_path,filename").eq("order_id", params.id);
  if (result.error) return NextResponse.json({ error: "Unable to read files" }, { status: 503 });
  const assets = await Promise.all(result.data.map(async (asset) => {
    const signed = await db.storage.from(SKETCH_BUCKET).createSignedUrl(asset.storage_path, 300);
    return { kind: asset.kind, filename: asset.filename, url: signed.data?.signedUrl || null };
  }));
  return NextResponse.json({ assets }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validSoulmateId(params.id)) return new NextResponse(null, { status: 400 });
  if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024) return NextResponse.json({ error: "Choose a file up to 3 MiB." }, { status: 413 });
  try {
    const order = await db.from("us_soulmate_orders").select("catalog_version,payment_status,review_status,entitlements").eq("id", params.id).single();
    if (order.error || order.data.catalog_version !== 2 || order.data.payment_status !== "paid" || order.data.review_status !== "pending") return NextResponse.json({ error: "This order is not awaiting file review." }, { status: 409 });
    const form = await request.formData();
    const kind = String(form.get("kind") || "");
    const file = form.get("file");
    if (!["sketch", "description", "timeline"].includes(kind) || !order.data.entitlements.required_assets.includes(kind) || !file || typeof file === "string" || file.size < 1 || file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "Choose a purchased deliverable and a file up to 3 MiB." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const png = buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = buffer[0]===255 && buffer[1]===216 && buffer[2]===255;
    const webp = buffer.toString("ascii",0,4)==="RIFF" && buffer.toString("ascii",8,12)==="WEBP";
    const pdf = buffer.toString("ascii",0,5)==="%PDF-";
    if (kind === "sketch" ? !pdf && !png && !jpg && !webp : !pdf) return NextResponse.json({ error: "Use PDF or PNG/JPEG/WebP for the sketch and PDF for written reports." }, { status: 400 });
    const extension = png ? "png" : jpg ? "jpg" : webp ? "webp" : "pdf";
    const contentType = pdf ? "application/pdf" : `image/${extension === "jpg" ? "jpeg" : extension}`;
    const storagePath = `${params.id}/${kind}-${crypto.randomUUID()}.${extension}`;
    const upload = await db.storage.from(SKETCH_BUCKET).upload(storagePath, buffer, { contentType, upsert: false });
    if (upload.error) throw new Error("Upload failed");
    const saved = await db.rpc("save_us_soulmate_order_asset", { p_order: params.id, p_kind: kind, p_path: storagePath, p_filename: `AstroRekha-${kind}-${params.id}.${extension}`, p_type: contentType, p_size: buffer.length, p_sha: crypto.createHash("sha256").update(buffer).digest("hex") });
    if (saved.error) { await db.storage.from(SKETCH_BUCKET).remove([storagePath]); return NextResponse.json({ error: "Could not attach file. The order may already be approved, or combined files exceed 7 MiB." }, { status: 409 }); }
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Unable to upload file. Please try again." }, { status: 503 }); }
}
