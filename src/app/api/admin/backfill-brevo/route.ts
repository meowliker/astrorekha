import { withAdminAccess } from "@/lib/admin-access";
import { NextResponse } from "next/server";

// Retired list backfill: keep old admin requests from enrolling any contacts.
export const POST = withAdminAccess(async () => NextResponse.json(
  { error: "Contact-list syncing has been removed." }, { status: 410 },
));
