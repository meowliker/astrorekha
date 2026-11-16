import { NextResponse } from "next/server";

import { clearPasswordGrant } from "@/lib/purchase-access/security";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // Clear the session cookie
  response.cookies.set({
    name: "ar_access",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0, // Expire immediately
  });

  response.cookies.set("ar_report_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return clearPasswordGrant(response);
}
