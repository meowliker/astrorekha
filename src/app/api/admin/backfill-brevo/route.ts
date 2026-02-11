import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addContactToList, BREVO_LISTS } from "@/lib/brevo";

export async function POST(request: NextRequest) {
  try {
    // Verify admin token
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    
    if (!token || token !== process.env.ADMIN_SYNC_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    
    const { data: allUsers } = await supabase.from("users").select("id, email, subscription_status");
    
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const userData of (allUsers || [])) {
      const email = userData.email;
      const status = userData.subscription_status;
      
      // Only add users who are trialing or active and have an email
      if (!email) {
        skipped++;
        continue;
      }
      
      if (status !== "trialing" && status !== "active") {
        skipped++;
        continue;
      }

      try {
        await addContactToList(email, BREVO_LISTS.ACTIVE_SUBSCRIBERS);
        added++;
        console.log(`Backfilled: ${email} (${status})`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err: any) {
        errors.push(`${email}: ${err.message || "unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Backfill complete. Added ${added} contacts, skipped ${skipped}.`,
      added,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { error: error.message || "Backfill failed" },
      { status: 500 }
    );
  }
}
