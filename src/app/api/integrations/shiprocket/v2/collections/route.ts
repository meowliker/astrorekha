import { NextRequest } from "next/server";
import { shiprocketFeedResponse } from "@/lib/shiprocket-catalogue/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return shiprocketFeedResponse(request, "collections");
}
