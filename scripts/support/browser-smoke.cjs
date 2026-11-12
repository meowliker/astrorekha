const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const outbound = [];
  page.on("request", (r) => {
    if (/google-analytics|facebook.net|clarity|vercel-insights/.test(r.url()))
      outbound.push(r.url());
  });
  await page.goto("http://localhost:3013/support");
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  await page.screenshot({
    path: "/tmp/astrorekha-support-login.png",
    fullPage: true,
  });
  assert.equal(
    await page.getByRole("textbox", { name: "Work email" }).count(),
    1,
  );
  const staff = {
    id: "owner",
    name: "Support Owner",
    email: "owner@example.invalid",
    role: "owner",
  };
  const customer = {
    user: {
      id: "test-customer",
      name: "Astro Rekha",
      email: "customer@example.invalid",
      coins: 30,
      birth_day: "28",
      birth_month: "6",
      birth_year: "2003",
      birth_hour: "12",
      birth_minute: "30",
      birth_period: "PM",
      birth_place: "Raipur, Chhattisgarh, India",
      unlocked_features: {
        palmReading: true,
        birthChart: true,
        soulmateSketch: true,
      },
    },
    profile: null,
    payments: [
      {
        id: "pay_test",
        user_id: "test-customer",
        type: "bundle",
        bundle_id: "palm-birth-sketch",
        amount: 188682,
        currency: "INR",
        payment_status: "paid",
        fulfilled_at: "2026-11-12T10:00:00Z",
        payu_payment_id: "123456789",
      },
    ],
    reports: [
      {
        key: "palmReading",
        name: "Palm Reading",
        unlocked: true,
        ready: true,
        status: "complete",
        savedInputs: true,
        generatedAt: "2026-11-12T10:00:00Z",
      },
      {
        key: "birthChart",
        name: "Birth Chart",
        unlocked: true,
        ready: true,
        status: "complete",
        generatedAt: "2026-11-12T10:00:00Z",
      },
      {
        key: "soulmateSketch",
        name: "Soulmate Sketch",
        unlocked: true,
        ready: false,
        status: "missing",
        savedInputs: true,
      },
      {
        key: "pastLifeReport",
        name: "Past Life Report",
        unlocked: false,
        ready: false,
        status: "missing",
      },
    ],
    actions: [],
    login: { passwordConfigured: true, codeRequestedAt: null },
    evidence: [],
    verifiedAt: new Date().toISOString(),
  };
  let cases = [];
  let requests = [];
  await page.route("**/api/support/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/api/support/")[1];
    const body = route.request().postDataJSON();
    requests.push({ endpoint, body });
    let data = {};
    if (endpoint === "me") data = { staff };
    else if (endpoint === "search")
      data = { customers: [customer.user], payments: customer.payments };
    else if (endpoint.startsWith("customers/")) data = customer;
    else if (endpoint === "cases" && body) {
      const c = {
        id: "case-test",
        subject: body.subject,
        issue: body.issue,
        customer_id: body.customerId,
        status: "open",
      };
      cases.push(c);
      data = c;
    } else if (endpoint === "cases") data = { cases };
    else if (endpoint === "actions") data = { actions: [] };
    else if (endpoint === "team") data = { staff: [staff] };
    else if (endpoint === "tokens") data = { tokens: [] };
    else if (endpoint === "cases/case-test")
      data = {
        draft:
          "Hi Astro Rekha,\n\nYour Palm Reading and Birth Chart are available.\n\nPlease feel free to reach out to us if you have any questions or concerns.\n\nRegards,\nTeam AstroRekha",
      };
    await route.fulfill({ json: data });
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Find it. Fix it. Verify it." })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Customer search" })
    .fill("customer@example.invalid");
  await page
    .getByRole("button", { name: "Find customer", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Astro Rekha", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Recover report", exact: true })
      .count(),
    2,
  );
  await page
    .getByPlaceholder("What did the customer report?")
    .fill(
      "Customer paid but cannot find the purchased reports. Payment matches account.",
    );
  await page
    .getByRole("textbox", { name: "Case subject", exact: true })
    .fill("Reports not visible");
  await page.getByRole("button", { name: "Create support case" }).click();
  await page.getByRole("button", { name: "Prepare verified reply" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('textarea[aria-label="Reply text"]')
      ?.value.includes("Hi Astro"),
  );
  assert.deepEqual(
    requests.find((r) => r.endpoint === "cases/case-test").body.reportKeys,
    ["palmReading", "birthChart"],
  );
  await page.screenshot({
    path: "/tmp/astrorekha-support-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/astrorekha-support-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile horizontal overflow",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, []);
  await page.getByRole("button", { name: "Team & Codex", exact: true }).click();
  await page.getByRole("heading", { name: "Staff access" }).waitFor();
  await browser.close();
  console.log(
    "PASS: login, customer search, case creation, verified report selection, draft preparation, team screen, desktop/mobile overflow, no analytics or client errors.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
