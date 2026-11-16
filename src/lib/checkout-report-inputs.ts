import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validCheckoutPalm } from "@/lib/report-input-snapshot";
/** Save before payment handoff. Retries never replace an order's original photo. */
export async function saveCheckoutReportInputs(market: "IN" | "US", orderId: string, palmImage: unknown) {
  if(palmImage == null) return;
  if(!validCheckoutPalm(palmImage)) throw new Error("Unable to save the palm photo. Please retry the upload.");
  const {error}=await getSupabaseAdmin().from("checkout_report_inputs").upsert({market,order_id:orderId,palm_image:palmImage},{onConflict:"market,order_id",ignoreDuplicates:true});
  if(error) throw new Error("Unable to save report inputs. Please retry before paying.");
}
