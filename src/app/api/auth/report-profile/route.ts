import { NextRequest, NextResponse } from "next/server";
import { reportSessionUser } from "@/lib/report-session";
import { loadPaidReportProfile } from "@/lib/paid-report-profile";
export async function GET(req: NextRequest) {
  const uid=reportSessionUser(req), headers={"Cache-Control":"private, no-store"};
  if(!uid) return NextResponse.json({error:"unauthorized"},{status:401,headers});
  try { const profile=await loadPaidReportProfile(uid);
    delete profile.palm_image;
    return NextResponse.json({profile},{headers});
  } catch { return NextResponse.json({error:"Unable to load saved details. Please retry."},{status:503,headers}); }
}
