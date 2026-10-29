import { isPineLabsReportId } from "./pinelabs-api";
import { localPaymentGateway } from "./local-payment-gateway";
/** One server-prepared ₹1 order only; never available on Vercel or production builds. */
export function pineLabsLocalTestOrderId(): string | null {
  if (localPaymentGateway() !== "pinelabs" || !/^[a-f0-9]{64}$/.test(process.env.PINELABS_LOCAL_TEST_TOKEN || "")) return null;
  const id = process.env.PINELABS_LOCAL_TEST_ORDER_ID || "";
  return isPineLabsReportId(id) ? id : null;
}
