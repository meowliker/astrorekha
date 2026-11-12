#!/usr/bin/env node
// The only credential this client needs is an individual support token.
import { readFile } from "node:fs/promises";
const [method = "GET", endpoint = "me", bodyFile] = process.argv.slice(2);
if (
  !["GET", "POST"].includes(method) ||
  !/^\/?(me|search|customers|cases|actions|tokens)([/?][a-zA-Z0-9_?=&%@.+/-]*)?$/.test(
    endpoint,
  )
)
  throw new Error("Use GET|POST and a documented support endpoint");
const token = process.env.ASTROREKHA_SUPPORT_TOKEN;
if (!token?.startsWith("ar_support_"))
  throw new Error(
    "Set ASTROREKHA_SUPPORT_TOKEN in your local secret environment",
  );
const body = bodyFile ? await readFile(bodyFile, "utf8") : undefined;
if (body) JSON.parse(body);
const response = await fetch(
  "https://astrorekha.com/api/support/" + endpoint.replace(/^\//, ""),
  {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(310000),
  },
);
const text = await response.text();
console.log(text);
if (!response.ok) process.exitCode = 1;
