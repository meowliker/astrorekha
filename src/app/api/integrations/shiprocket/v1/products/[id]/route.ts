import { NextRequest } from "next/server";
import { catalogueResponse } from "@/lib/shiprocket-catalogue/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return catalogueResponse(request, "product", id);
}
