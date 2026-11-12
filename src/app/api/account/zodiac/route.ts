import {NextRequest,NextResponse} from "next/server";
import {reportSessionUser} from "@/lib/report-session";
import {customerMarket} from "@/lib/customer-market";
import {loadWesternAccountChart} from "@/lib/us-main/western-chart";
export async function GET(req:NextRequest){
 const uid=reportSessionUser(req);if(!uid)return NextResponse.json({error:"Sign in required"},{status:401});
 try{
  if(await customerMarket(uid)!=="US")return NextResponse.json({western:false});
  const {data}=await loadWesternAccountChart(uid);
  return NextResponse.json({western:true,sun:data.sun_sign,moon:data.moon_sign,ascendant:data.ascendant},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to calculate your signs. Please check your saved birth details."},{status:503});}
}
