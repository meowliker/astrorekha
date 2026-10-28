import { NextRequest } from "next/server";
import { paytmNotification } from "@/lib/paytm-notification";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function POST(request: NextRequest) { return paytmNotification(request, false); }
