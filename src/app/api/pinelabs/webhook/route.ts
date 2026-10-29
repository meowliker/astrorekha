import { NextRequest } from "next/server";
import { pineLabsWebhook } from "@/lib/pinelabs-notification";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export function POST(request: NextRequest) { return pineLabsWebhook(request); }
