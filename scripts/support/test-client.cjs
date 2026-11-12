const {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  statSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const dir = mkdtempSync(path.join(tmpdir(), "support-client-test-"));
try {
  writeFileSync(
    path.join(dir, ".env.support"),
    "ASTROREKHA_SUPPORT_TOKEN=ar_support_fixturetoken\n",
    { mode: 0o600 },
  );
  writeFileSync(
    path.join(dir, "fixture.mjs"),
    `import{writeFileSync}from'node:fs';globalThis.fetch=async(url,options)=>{if(options.headers.Authorization!=='Bearer ar_support_fixturetoken')throw Error('Token not loaded');writeFileSync('request.json',JSON.stringify({url,receipt:options.headers['x-support-rules-receipt']}));if(process.env.FIXTURE_FAIL)return new Response(JSON.stringify({error:'Reload current rules'}),{status:409});return new Response(JSON.stringify(url.endsWith('/rules')?{version:7,content:'Live workflow instructions',settings:{},receipt:'private-fixture-receipt',safeguards:[]}:{}),{status:200});};`,
  );
  const env = { ...process.env };
  delete env.ASTROREKHA_SUPPORT_TOKEN;
  const run = (args, fail = false) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        path.join(dir, "fixture.mjs"),
        path.join(process.cwd(), "scripts/support/client.mjs"),
        ...args,
      ],
      {
        cwd: dir,
        env: { ...env, ...(fail ? { FIXTURE_FAIL: "1" } : {}) },
        encoding: "utf8",
      },
    );
  let r = run(["GET", "search?q=fixture"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /current rules first/);
  r = run(["GET", "me"]);
  assert.equal(r.status, 0);
  r = run(["start"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Live workflow instructions/);
  assert.ok(
    !r.stdout.includes("private-fixture-receipt") &&
      !r.stdout.includes("ar_support_fixturetoken"),
  );
  assert.equal(
    statSync(path.join(dir, ".support-rules-session.json")).mode & 0o777,
    0o600,
  );
  r = run(["GET", "search?q=fixture"]);
  assert.equal(r.status, 0);
  assert.equal(
    JSON.parse(readFileSync(path.join(dir, "request.json"), "utf8")).receipt,
    "private-fixture-receipt",
  );
  r = run(["GET", "search?q=fixture"], true);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Reload current rules/);
  r = run(["start"], true);
  assert.equal(r.status, 1);
  assert.ok(!r.stdout.includes("Live workflow instructions"));
  console.log(
    "PASS: local token loading, required live-rules start, private receipt, API header, stale-rule error and no offline fallback.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
