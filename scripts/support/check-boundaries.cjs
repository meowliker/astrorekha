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
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-rules-signing-key";
const { digest } = require("../../src/lib/support/auth");
const { DEFAULT_RULE_SETTINGS } = require("../../src/lib/support/rules-config");
const rulesModule = require("../../src/lib/support/rules");
const rows = {
  support_sessions: [],
  support_staff: [],
  support_rule_versions: [
    {
      version: 1,
      content: "Initial support instructions ".repeat(8),
      settings: DEFAULT_RULE_SETTINGS,
    },
  ],
};
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
rows.support_staff[0].password_hash = require("bcryptjs").hashSync(
  "test-only-correct-password",
  12,
);
function query(table) {
  let filters = [];
  const q = {
    insert(row) {
      (rows[table] ||= []).push(row);
      return Promise.resolve({ data: null, error: null });
    },
    select() {
      return q;
    },
    order() {
      return q;
    },
    limit() {
      return q;
    },
    range() {
      return Promise.resolve({ data: rows[table] || [], error: null });
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
const {
  getBirthTime24,
  normalizeBirthDetailsSnapshot,
} = require("../../src/lib/birth-details");
let count = 0;
async function request(
  endpoint,
  { token, body, origin, cookie, rulesReceipt = "auto" } = {},
  expected,
) {
  const headers = {};
  if (token) headers.authorization = "Bearer ar_support_" + token;
  if (token && rulesReceipt !== null)
    headers["x-support-rules-receipt"] =
      rulesReceipt === "auto"
        ? rulesModule.issueRulesReceipt(
            digest("ar_support_" + token),
            rows.support_rule_versions[0].version,
          )
        : rulesReceipt;
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
  const signedIn = await POST(
    new NextRequest("https://astrorekha.com/api/support/login", {
      method: "POST",
      headers: {
        origin: "https://astrorekha.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "staff@example.invalid",
        password: "test-only-correct-password",
      }),
    }),
  );
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=strict/i);
  assert.match(cookie, /Path=\/api\/support/i);
  const body = await signedIn.json();
  assert.equal(body.staff.role, "support");
  assert.equal(body.staff.password_hash, undefined);
  const token = cookie.match(/ar_support=([^;]+)/)[1];
  await request("me", { cookie: token }, 200);
  await request("rules",{cookie:token,origin:"https://astrorekha.com",body:{content:"Staff cannot publish"}},403);
  await request("rules",{cookie:"ar_support_browser",origin:"https://astrorekha.com",body:{baseVersion:1,content:"too short"}},400);
  await request(
    "login",
    {
      body: { email: "staff@example.invalid", password: "incorrect" },
      origin: "https://astrorekha.com",
    },
    401,
  );
  await request("me", {}, 401);
  await request("me", { token: "invalid" }, 401);
  await request("me", { token: "disabled" }, 403);
  const capabilitiesResponse = await request("rules", { token: "staff", rulesReceipt: null }, 200);
  assert.equal(capabilitiesResponse.capabilities.correctSketch.kind, "correct_sketch");
  assert.equal(capabilitiesResponse.capabilities.correctSketch.requiresOwnerApproval, false);
  rows.users = [{id:"customer",unlocked_features:{soulmateSketch:true}}];
  rows.soulmate_sketches = [{user_id:"customer",status:"complete",sketch_image_url:"https://example.invalid/saved.jpg",question_answers:{age_group:"35-40"},provider_job_id:"private-provider-id",prompt:"private-generation-prompt"}];
  await request("customers/customer/reports/soulmateSketch", {}, 401);
  await request("customers/customer/reports/soulmateSketch", {token:"staff",rulesReceipt:null}, 409);
  await request("customers/customer/reports/password_hash", {token:"staff"}, 404);
  const inspected = await request("customers/customer/reports/soulmateSketch", {token:"staff"}, 200);
  assert.equal(inspected.answers.age_group,"35-40");
  assert.equal(inspected.ready,true);
  assert.equal(inspected.provider_job_id,undefined);
  assert.equal(inspected.prompt,undefined);
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
  const live = await request(
    "rules",
    { token: "staff", rulesReceipt: null },
    200,
  );
  assert.equal(live.version, 1);
  assert.ok(live.receipt);
  assert.equal(live.settings.specificLabel, "For Santushti");
  await request(
    "search?q=a%40example.com",
    { token: "staff", rulesReceipt: null },
    409,
  );
  await request(
    "cases",
    {
      token: "staff",
      body: { mailbox: "another@gmail.com" },
      rulesReceipt: live.receipt,
    },
    400,
  );
  rows.support_rule_versions[0].version = 2;
  await request(
    "cases",
    {
      token: "staff",
      body: { mailbox: "another@gmail.com" },
      rulesReceipt: live.receipt,
    },
    409,
  );
  await request(
    "rules",
    { token: "owner", body: { content: "Cannot publish from API" } },
    403,
  );
  const receipt = rulesModule.issueRulesReceipt(
    digest("ar_support_staff"),
    2,
    1000000,
  );
  assert.equal(
    rulesModule.validRulesReceipt(
      receipt,
      digest("ar_support_staff"),
      2,
      1001000,
    ),
    true,
  );
  assert.equal(
    rulesModule.validRulesReceipt(
      receipt,
      digest("ar_support_owner"),
      2,
      1001000,
    ),
    false,
  );
  assert.equal(
    rulesModule.validRulesReceipt(
      receipt,
      digest("ar_support_staff"),
      3,
      1001000,
    ),
    false,
  );
  assert.equal(
    rulesModule.validRulesReceipt(
      receipt,
      digest("ar_support_staff"),
      2,
      3000000,
    ),
    false,
  );
  assert.equal(
    rulesModule.validRulesReceipt(
      receipt + "x",
      digest("ar_support_staff"),
      2,
      1001000,
    ),
    false,
  );
  assert.throws(() =>
    rulesModule.validateRuleSettings({
      ...DEFAULT_RULE_SETTINGS,
      specificLabel: "INBOX",
    }),
  );
  assert.throws(() =>
    rulesModule.validateRuleSettings({
      ...DEFAULT_RULE_SETTINGS,
      specificLabel: DEFAULT_RULE_SETTINGS.loginLabel,
    }),
  );
  const custom = {
    ...DEFAULT_RULE_SETTINGS,
    closing: "Contact our team with any questions.",
    signature: "Thanks, AstroRekha Support",
    blockedTopics: [],
  };
  const customReply = policy.makeReply(
    "A",
    "a@example.com",
    ["Birth Chart"],
    custom,
  );
  policy.validateDraft(customReply, custom);
  assert.ok(customReply.includes(custom.closing));
  assert.ok(!customReply.includes(policy.CLOSING));
  policy.validateDraft(customReply + "\nRefund", custom);
  assert.throws(() => policy.validateDraft(customReply, DEFAULT_RULE_SETTINGS));
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
  assert.equal(
    getBirthTime24({
      birthHour: "12",
      birthMinute: "00",
      birthPeriod: "AM",
      knowsBirthTime: true,
    }),
    "00:00",
  );
  assert.equal(
    getBirthTime24({
      birthHour: "12",
      birthMinute: "00",
      birthPeriod: "PM",
      knowsBirthTime: true,
    }),
    "12:00",
  );
  assert.equal(
    getBirthTime24({
      birthHour: "12",
      birthMinute: "00",
      birthPeriod: "PM",
      knowsBirthTime: false,
    }),
    null,
  );
  assert.equal(
    normalizeBirthDetailsSnapshot({
      birthYear: "2003",
      birthMonth: "6",
      birthDay: "28",
    }).completeForPalm,
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
      policy.validateDraft(
        prohibited +
          "\n" +
          policy.CLOSING +
          "\n" +
          DEFAULT_RULE_SETTINGS.signature,
      ),
    );
  console.log(
    `PASS: ${count} API boundary checks; report readiness, input validation and reply-policy checks.`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
