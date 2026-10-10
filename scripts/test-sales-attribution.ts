import assert from "node:assert/strict";
import crypto from "node:crypto";
import { gaSessionCookieName, parseGaClientId, parseGaSessionId } from "../src/lib/ga-cookie-parsers";
import { verifyPayUResponseHash } from "../src/lib/payu-response-hash";

assert.equal(parseGaClientId("GA1.1.123456789.1760000000"), "123456789.1760000000");
assert.equal(parseGaClientId("broken"), null);
assert.equal(parseGaSessionId("GS1.1.1760001234.2.0.0"), "1760001234");
assert.equal(parseGaSessionId("GS2.1.s1760001234$o2$g1$t1760001250"), "1760001234");
assert.equal(parseGaSessionId("GS2.1.s1760001234%24o2"), "1760001234");
assert.equal(parseGaSessionId("other"), null);
assert.equal(gaSessionCookieName("G-ABCD1234"), "_ga_ABCD1234");

const payuResponse = {
  key: "test-key",
  txnid: "pay_test123",
  amount: "100.00",
  productinfo: "Test Report",
  firstname: "Buyer",
  email: "buyer@example.com",
  status: "success",
  udf1: "TEST", udf2: "TESTSET", udf3: "TESTAD", udf4: "pay_test123", udf5: "",
};
// Six pipes precede the empty udf5, then one more precedes udf4.
const reverseString = "test-salt|success|||||||pay_test123|TESTAD|TESTSET|TEST|buyer@example.com|Buyer|Test Report|100.00|pay_test123|test-key";
const hash = crypto.createHash("sha512").update(reverseString).digest("hex");
assert.equal(verifyPayUResponseHash({ ...payuResponse, hash }, "test-key", "test-salt"), true);
const chargedHash = crypto.createHash("sha512").update(`7.50|${reverseString}`).digest("hex");
assert.equal(verifyPayUResponseHash({ ...payuResponse, additionalCharges: "7.50", hash: chargedHash }, "test-key", "test-salt"), true);
assert.equal(verifyPayUResponseHash({ ...payuResponse, amount: "101.00", hash }, "test-key", "test-salt"), false);
assert.equal(verifyPayUResponseHash({ ...payuResponse, hash: "bad" }, "test-key", "test-salt"), false);

console.log("Sales attribution parser and PayU hash checks passed");
