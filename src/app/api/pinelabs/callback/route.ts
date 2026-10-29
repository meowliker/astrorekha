import { NextRequest } from "next/server";
import { pineLabsCallback } from "@/lib/pinelabs-notification";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export function POST(request: NextRequest) { return pineLabsCallback(request); }
export function GET(request: NextRequest) { return pineLabsCallback(request); }
