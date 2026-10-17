import {NextRequest,NextResponse} from "next/server";
import {soulmateAdmin} from "@/lib/us-soulmate-admin";
import {readSoulmateInvoice,invoicePdf} from "@/lib/us-soulmate-invoice";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:{id:string}}){
  if(!await soulmateAdmin(request))return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!/^[a-f0-9-]{36}$/i.test(params.id))return new NextResponse(null,{status:400});
  try{const invoice=await readSoulmateInvoice(params.id);const pdf=await invoicePdf(invoice);return new NextResponse(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`${request.nextUrl.searchParams.get("download")==="1"?"attachment":"inline"}; filename="${invoice.invoice_number}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}catch{return NextResponse.json({error:"Invoice PDF is not available yet"},{status:404});}
}
