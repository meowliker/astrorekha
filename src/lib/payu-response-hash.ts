import crypto from "crypto";

export type SignedPayUResponse = {
  hash?: string;
  key?: string;
  txnid?: string;
  amount?: string;
  productinfo?: string;
  firstname?: string;
  email?: string;
  status?: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  additionalCharges?: string;
  additional_charges?: string;
};

/** PayU's signed callback uses the reverse of the request hash sequence. */
export function verifyPayUResponseHash(
  response: SignedPayUResponse,
  merchantKey: string,
  merchantSalt: string
): boolean {
  if (!response.hash || !response.txnid || !response.status ||
      !response.amount || !response.productinfo || !response.firstname || !response.email ||
      (response.key && response.key !== merchantKey)) return false;

  const additionalCharges = response.additionalCharges || response.additional_charges;
  const sequence = [
    ...(additionalCharges ? [additionalCharges] : []),
    merchantSalt, response.status, "", "", "", "", "",
    response.udf5 || "", response.udf4 || "", response.udf3 || "",
    response.udf2 || "", response.udf1 || "", response.email,
    response.firstname, response.productinfo, response.amount,
    response.txnid, merchantKey,
  ].join("|");
  const expected = crypto.createHash("sha512").update(sequence).digest("hex");
  const received = response.hash.toLowerCase();
  return /^[a-f0-9]{128}$/.test(received) &&
    crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}
