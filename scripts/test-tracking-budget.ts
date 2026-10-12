import assert from "node:assert/strict";
import { budgetAmountInput, parseBudgetAmount } from "../src/lib/tracking-budget-amount";
import { changeMetaBudget, MetaBudgetError, readMetaBudget } from "../src/lib/tracking-meta-budget";

async function main() {
  assert.equal(parseBudgetAmount("150000.50", 2), 15_000_050);
  assert.equal(parseBudgetAmount("0", 2), null);
  assert.equal(parseBudgetAmount("1.001", 2), null);
  assert.equal(budgetAmountInput(15_000_050, 2), "150000.50");

  const originalFetch = global.fetch;
  const credential = { accountId: "123456789", accessToken: "test-token" };
  let current = "15000000";
  let objectAccount = "123456789";
  let writes = 0;
  global.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("act_123456789")) return Response.json({ currency: "INR" });
    if (init?.method === "POST") {
      writes++;
      assert.equal(init.headers && (init.headers as Record<string, string>).Authorization, "Bearer test-token");
      assert.equal(String(init.body), "daily_budget=20000000");
      current = "20000000";
      return Response.json({ success: true });
    }
    return Response.json({ id: "987654321", name: "Test campaign", account_id: objectAccount, daily_budget: current });
  };
  try {
    const before = await readMetaBudget(credential, "campaign", "987654321");
    assert.equal(before.amountMinor, 15_000_000);
    await assert.rejects(changeMetaBudget(credential, "campaign", "987654321", { type: "daily", amountMinor: 1 }, 20_000_000), (error: unknown) => error instanceof MetaBudgetError && error.status === 409);
    assert.equal(writes, 0);
    const after = await changeMetaBudget(credential, "campaign", "987654321", { type: "daily", amountMinor: 15_000_000 }, 20_000_000);
    assert.equal(after.amountMinor, 20_000_000);
    assert.equal(writes, 1);
    objectAccount = "111111111";
    await assert.rejects(readMetaBudget(credential, "campaign", "987654321"), (error: unknown) => error instanceof MetaBudgetError && error.status === 403);
    assert.equal(writes, 1);
  } finally { global.fetch = originalFetch; }
  console.log("Tracking budget checks passed");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
