import { NextRequest } from "next/server";
import { catalogueResponse } from "@/lib/shiprocket-catalogue/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return catalogueResponse(request, "collections");
}
