import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin, validSoulmateId } from "@/lib/us-soulmate-admin";
export async function POST(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validSoulmateId(params.id)) return new NextResponse(null, { status: 400 });
  try {
    const body = await request.json();
    const { error } = await db.rpc("approve_us_soulmate_order", { p_order: params.id, p_note: typeof body.note === "string" ? body.note.slice(0,2000) : "" });
    if (error) return NextResponse.json({ error: "Approval needs a paid order with every purchased deliverable uploaded." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Unable to approve order" }, { status: 503 }); }
}
