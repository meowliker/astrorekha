#!/usr/bin/env node
// Restricted support client. Secrets are read locally, never printed or sent elsewhere.
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
const args = process.argv.slice(2);
const start = args[0] === "start" || (args[0] === "GET" && args[1] === "rules");
const [method = "GET", endpoint = "me", bodyFile] = start
  ? ["GET", "rules"]
  : args;
if (
  !["GET", "POST"].includes(method) ||
  !/^\/?(me|rules|search|customers|cases|actions|tokens)([/?][a-zA-Z0-9_?=&%@.+/-]*)?$/.test(
    endpoint,
  )
)
  throw new Error("Use start, or GET|POST and a documented support endpoint");
let token = process.env.ASTROREKHA_SUPPORT_TOKEN;
if (!token) {
  try {
    const file = await readFile(".env.support", "utf8");
    const lines = file
      .split(/\r?\n/)
      .filter((line) => /^\s*ASTROREKHA_SUPPORT_TOKEN\s*=/.test(line));
    if (lines.length !== 1)
      throw new Error("Expected exactly one support token setting");
    token = lines[0]
      .slice(lines[0].indexOf("=") + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
  } catch {
    throw new Error(
      "Save ASTROREKHA_SUPPORT_TOKEN in .env.support in this folder, or set it in the local environment. Do not paste it into chat.",
    );
  }
}
if (!/^ar_support_[a-zA-Z0-9_-]+$/.test(token))
  throw new Error("The local support token is invalid");
const tokenHash = createHash("sha256").update(token).digest("hex");
const statePath = ".support-rules-session.json";
let receipt;
if (
  !start &&
  !["me", "tokens"].includes(endpoint.replace(/^\//, "").split(/[/?]/)[0])
) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    if (state.tokenHash === tokenHash) receipt = state.receipt;
  } catch {}
  if (!receipt)
    throw new Error(
      "Read the current rules first: node scripts/support/client.mjs start. Do not use an old local rules copy.",
    );
}
const body = bodyFile ? await readFile(bodyFile, "utf8") : undefined;
if (body) JSON.parse(body);
const response = await fetch(
  "https://astrorekha.com/api/support/" + endpoint.replace(/^\//, ""),
  {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(receipt ? { "x-support-rules-receipt": receipt } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(310000),
    cache: "no-store",
  },
);
const data = await response.json();
if (!response.ok) {
  console.log(JSON.stringify(data, null, 2));
  process.exitCode = 1;
} else if (start) {
  if (!data.receipt || !data.version || !data.content)
    throw new Error(
      "The server did not return current rules. Stop this support run.",
    );
  const temp = statePath + "." + randomBytes(6).toString("hex");
  try {
    await writeFile(
      temp,
      JSON.stringify({
        tokenHash,
        receipt: data.receipt,
        version: data.version,
      }),
      { mode: 0o600, flag: "wx" },
    );
    await rename(temp, statePath);
  } finally {
    await unlink(temp).catch(() => {});
  }
  const { receipt: privateReceipt, ...rules } = data;
  void privateReceipt;
  console.log(
    JSON.stringify(
      {
        instruction:
          "Read and follow this live version and its settings before proceeding. Refresh at each Gmail run, between customers and before Gmail changes. Stop if refresh fails.",
        ...rules,
      },
      null,
      2,
    ),
  );
} else console.log(JSON.stringify(data, null, 2));
