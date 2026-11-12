import {NextRequest,NextResponse} from "next/server";
import {reportSessionUser} from "@/lib/report-session";
import {customerMarket} from "@/lib/customer-market";
import {calculateWesternChart,loadWesternAccountChart} from "@/lib/us-main/western-chart";
export async function GET(req:NextRequest) {
  const uid=reportSessionUser(req);
  if(!uid)return NextResponse.json({error:"Sign in required"},{status:401});
  try {
    if(await customerMarket(uid)!=="US")return NextResponse.json({error:"US account required"},{status:403});
    const chart=await loadWesternAccountChart(uid);
    return NextResponse.json({success:true,...chart},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"Please check your saved birth date, time and birthplace, then try again."},{status:503});}
}

/** Partner calculation: no profile, order or entitlement changes. */
export async function POST(req:NextRequest) {
  const uid=reportSessionUser(req);
  if(!uid)return NextResponse.json({error:"Sign in required"},{status:401});
  if(req.headers.get("sec-fetch-site")==="cross-site" || (req.headers.get("origin") && req.headers.get("origin")!==req.nextUrl.origin))return NextResponse.json({error:"Invalid origin"},{status:403});
  try {
    if(await customerMarket(uid)!=="US")return NextResponse.json({error:"US account required"},{status:403});
    const body=await req.json();
    if(body.knowsBirthTime!==true)return NextResponse.json({error:"Birth time is required for Moon compatibility."},{status:400});
    const chart=await calculateWesternChart(body);
    return NextResponse.json({success:true,...chart},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"Unable to calculate this chart. Check the birth date, time and birthplace, then try again."},{status:400});}
}
