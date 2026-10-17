import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/us-soulmate-admin";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  const db=await soulmateAdmin(request);if(!db)return NextResponse.json({error:"Unauthorized"},{status:401});
  const page=Math.floor(Math.max(0,Math.min(10000,Number(request.nextUrl.searchParams.get("page"))||0)));
  let query=db.from("us_soulmate_order_invoices").select("id,order_id,source,invoice_number,issued_at,snapshot,status,storage_path,sent_at,last_error",{count:"exact"});
  const order=request.nextUrl.searchParams.get("order");if(order)query=query.eq("order_id",order);
  const result=await query.order("issued_at",{ascending:false}).range(page*20,page*20+19);
  if(result.error)return NextResponse.json({error:"Unable to read invoices"},{status:503});
  return NextResponse.json({invoices:result.data.map(({storage_path,...row})=>({...row,pdfReady:!!storage_path})),total:result.count},{headers:{"Cache-Control":"no-store"}});
}
