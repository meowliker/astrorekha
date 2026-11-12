// Tests the real API boundary with a bounded in-memory database; no customer writes.
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  return resolve.call(
    this,
    request.startsWith("@/")
      ? path.join(process.cwd(), "src", request.slice(2))
      : request,
    parent,
    ...rest,
  );
};
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "node",
    jsx: "react-jsx",
  },
});
process.env.ANTHROPIC_API_KEY = "test-key-not-used";
const { digest } = require("../../src/lib/support/auth");
const rows = { support_sessions: [], support_staff: [] };
for (const [id, role, kind] of [
  ["staff", "support", "api"],
  ["owner", "owner", "api"],
  ["browser", "owner", "browser"],
  ["disabled", "support", "api"],
]) {
  rows.support_sessions.push({
    token_hash: digest("ar_support_" + id),
    staff_id: id,
    kind,
    expires_at: new Date(Date.now() + 60000).toISOString(),
  });
  rows.support_staff.push({
    id,
    email: id + "@example.invalid",
    name: id,
    role,
    active: id !== "disabled",
  });
}
function query(table) {
  let filters = [];
  const q = {
    select() {
      return q;
    },
    eq(k, v) {
      filters.push((r) => r[k] === v);
      return q;
    },
    maybeSingle() {
      return Promise.resolve({
        data:
          (rows[table] || []).find((r) => filters.every((f) => f(r))) || null,
        error: null,
      });
    },
    single() {
      return q.maybeSingle();
    },
  };
  return q;
}
require("../../src/lib/supabase-admin").getSupabaseAdmin = () => ({
  from: query,
  rpc: () => Promise.resolve({ data: true, error: null }),
});
const { GET, POST } = require("../../src/app/api/support/[...path]/route");
const { NextRequest } = require("next/server");
const policy = require("../../src/lib/support/policy");
let count = 0;
async function request(
  endpoint,
  { token, body, origin, cookie } = {},
  expected,
) {
  const headers = {};
  if (token) headers.authorization = "Bearer ar_support_" + token;
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = "ar_support=" + cookie;
  if (body) headers["content-type"] = "application/json";
  const req = new NextRequest(
    "https://astrorekha.com/api/support/" + endpoint,
    {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const response = await (body ? POST : GET)(req);
  assert.equal(
    response.status,
    expected,
    `${endpoint}: ${await response.clone().text()}`,
  );
  count++;
  return response.json();
}
(async () => {
  await request("me", {}, 401);
  await request("me", { token: "invalid" }, 401);
  await request("me", { token: "disabled" }, 403);
  const me = await request("me", { token: "staff" }, 200);
  assert.equal(me.staff.role, "support");
  assert.equal(me.staff.password_hash, undefined);
  await request(
    "team",
    { token: "staff", body: { email: "new@example.invalid", name: "New" } },
    403,
  );
  await request(
    "actions/123",
    { token: "owner", body: { decision: "approve" } },
    403,
  );
  await request(
    "actions/123",
    { token: "staff", body: { decision: "approve" } },
    403,
  );
  await request(
    "tokens",
    { token: "staff", body: { name: "Escalation" } },
    403,
  );
  await request("team", { token: "staff" }, 403);
  await request(
    "cases",
    { token: "staff", body: { mailbox: "another@gmail.com" } },
    400,
  );
  await request(
    "cases",
    {
      cookie: "ar_support_browser",
      body: { subject: "CSRF" },
      origin: "https://evil.example",
    },
    403,
  );
  await request(
    "cases",
    { cookie: "ar_support_browser", body: { subject: "CSRF" } },
    403,
  );
  await request("bootstrap", { body: {}, origin: "https://evil.example" }, 403);
  assert.throws(() => policy.identifier("id,role.eq.owner"));
  assert.throws(() =>
    policy.emailAddress("x@example.com\nBcc: bad@example.com"),
  );
  assert.throws(() => policy.makeReply("A", "a@example.com", []));
  assert.equal(
    policy.reportReady(
      "palmReading",
      { reading: { love: "x" }, deleted_at: "2026-11-12" },
      true,
    ),
    false,
  );
  assert.equal(
    policy.reportReady(
      "birthChart",
      { status: "complete", sections: {} },
      true,
    ),
    false,
  );
  assert.equal(
    policy.reportReady(
      "birthChart",
      { status: "complete", sections: { career: "x" } },
      false,
    ),
    false,
  );
  assert.equal(
    policy.reportReady(
      "birthChart",
      { status: "generating", sections: { career: "x" } },
      true,
    ),
    false,
  );
  assert.equal(
    policy.reportReady(
      "birthChart",
      { status: "complete", sections: { career: "x" } },
      true,
    ),
    true,
  );
  const text = policy.makeReply("A", "a@example.com", ["Birth Chart"]);
  policy.validateDraft(text);
  for (const prohibited of [
    "Your payment failed",
    "Your report is processing",
    "Please request a refund",
    "On Tuesday Customer wrote:\n> complaint",
    "We can replace your palm",
  ])
    assert.throws(() =>
      policy.validateDraft(prohibited + "\n" + policy.CLOSING),
    );
  console.log(
    `PASS: ${count} API boundary checks; report readiness, input validation and reply-policy checks.`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
