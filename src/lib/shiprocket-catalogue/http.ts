import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizePricing } from "@/lib/pricing";
import { buildCatalogue, COLLECTIONS } from "./catalogue";
import { toShiprocketCatalogue } from "./partner-format";

type Resource = "collections" | "products" | "product" | "catalogue";
class CatalogueError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

function authorize(request: NextRequest, allowApiKeyHeader = false) {
  if (process.env.SHIPROCKET_CATALOG_ENABLED !== "true") throw new CatalogueError("Catalogue integration is disabled", 404);
  const key = process.env.SHIPROCKET_CATALOG_API_KEY;
  if (!key || key.length < 32) throw new CatalogueError("Catalogue integration is not configured", 503);
  const apiKey = allowApiKeyHeader ? request.headers.get("x-api-key") : null;
  const supplied = apiKey ?? request.headers.get("authorization") ?? "";
  const expected = apiKey === null ? `Bearer ${key}` : key;
  const digest = (value: string) => crypto.createHash("sha256").update(value).digest();
  if (!crypto.timingSafeEqual(digest(supplied), digest(expected))) throw new CatalogueError("Unauthorized", 401);
}

function integer(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback;
  if (!/^[1-9]\d{0,5}$/.test(value) || Number(value) > max) throw new CatalogueError("Invalid pagination", 400);
  return Number(value);
}

async function readPricing() {
  const { data, error } = await getSupabaseAdmin().from("settings").select("value,updated_at").eq("key", "pricing").maybeSingle();
  // Partner catalogues must not silently substitute default prices during a DB failure.
  if (error || !data?.value || typeof data.value !== "object" || Array.isArray(data.value)) {
    throw new CatalogueError("Current catalogue unavailable", 503);
  }
  return { pricing: normalizePricing(data.value), updatedAt: data.updated_at };
}

function errorResponse(error: unknown) {
  if (error instanceof CatalogueError) return json({ error: error.message }, error.status);
  console.error("[shiprocket-catalogue] Unable to read catalogue");
  return json({ error: "Current catalogue unavailable" }, 503);
}

export async function catalogueResponse(request: NextRequest, resource: Resource, id?: string) {
  try {
    authorize(request);
    const query = request.nextUrl.searchParams;
    const collection = query.get("collection");
    if (collection !== null && !COLLECTIONS.some(item => item.id === collection)) throw new CatalogueError("Unknown collection", 400);
    const search = query.get("q") || "";
    if (search.length > 200) throw new CatalogueError("Search is too long", 400);
    const page = integer(query.get("page"), 1, 100000);
    const limit = integer(query.get("limit"), 50, 100);
    const { pricing } = await readPricing();
    const catalogue = buildCatalogue(pricing);
    const metadata = { schema_version: 1, market: "IN", currency: "INR", generated_at: new Date().toISOString() };
    if (resource === "product") {
      const product = catalogue.products.find(product => product.id === id);
      if (!product) throw new CatalogueError("Product unavailable", 404);
      return json({ ...metadata, product });
    }
    if (resource === "collections") return json({ ...metadata, collections: catalogue.collections });
    const filtered = catalogue.products.filter(product => (!collection || product.collection_id === collection)
      && `${product.name} ${product.description}`.toLowerCase().includes(search.toLowerCase()));
    const products = filtered.slice((page - 1) * limit, page * limit);
    const pagination = { page, limit, total: filtered.length, total_pages: Math.ceil(filtered.length / limit), has_more: page * limit < filtered.length };
    return json({ ...metadata, ...(resource === "catalogue" ? { collections: catalogue.collections } : {}), products, pagination });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function shiprocketFeedResponse(request: NextRequest, resource: Exclude<Resource, "product">) {
  try {
    authorize(request, true);
    const query = request.nextUrl.searchParams;
    const page = integer(query.get("page"), 1, 100000);
    const limit = integer(query.get("limit"), 100, 100);
    const collectionId = query.get("collection_id");
    if (resource === "catalogue" && (!collectionId || !/^[1-9]\d{0,14}$/.test(collectionId))) {
      throw new CatalogueError("A numeric collection_id is required", 400);
    }

    const { pricing, updatedAt } = await readPricing();
    const catalogue = toShiprocketCatalogue(buildCatalogue(pricing), updatedAt);
    const start = (page - 1) * limit;
    if (resource === "collections") {
      return json({ data: { total: catalogue.collections.length, collections: catalogue.collections.slice(start, start + limit) } });
    }
    if (resource === "catalogue" && !catalogue.collections.some(collection => collection.id === Number(collectionId))) {
      throw new CatalogueError("Unknown collection_id", 400);
    }
    const products = resource === "catalogue"
      ? catalogue.products.filter(product => product.collectionId === Number(collectionId))
      : catalogue.products;
    return json({ data: { total: products.length, products: products.slice(start, start + limit).map(product => product.item) } });
  } catch (error) {
    return errorResponse(error);
  }
}
