import { createHash } from "node:crypto";
import type { buildCatalogue } from "./catalogue";

type Catalogue = ReturnType<typeof buildCatalogue>;

const CATALOGUE_INTRODUCED_AT = "2026-11-02T10:18:37.000Z";
const STORE_ORIGIN = "https://astrorekha.com";
const DIGITAL_AVAILABILITY = 999999;

const images: Record<string, string> = {
  bundles: "/palm.png",
  reports: "/logo.webp",
  addons: "/logo.webp",
  chat: "/elysia.webp",
  soulmate: "/discover-assets/india/sketches/astrorekha-1.webp",
};

function paragraph(value: string) {
  return `<p>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`;
}

export function toShiprocketCatalogue(catalogue: Catalogue, pricingUpdatedAt: string | null) {
  const ids = new Set<number>();
  const timestamp = {
    created_at: CATALOGUE_INTRODUCED_AT,
    updated_at: pricingUpdatedAt && Date.parse(pricingUpdatedAt) > Date.parse(CATALOGUE_INTRODUCED_AT)
      ? new Date(pricingUpdatedAt).toISOString()
      : CATALOGUE_INTRODUCED_AT,
  };

  function numericId(kind: "collection" | "product" | "variant", sku: string) {
    // Use 48 bits so IDs round-trip as exact JSON numbers and fit Shiprocket's Long.
    const id = createHash("sha256").update(`astrorekha:${kind}:${sku}`).digest().readUIntBE(0, 6);
    if (!id || ids.has(id)) throw new Error("Invalid Shiprocket catalogue identifier");
    ids.add(id);
    return id;
  }

  function image(collection: string) {
    return { src: STORE_ORIGIN + (images[collection] ?? "/logo.webp") };
  }

  const collections = catalogue.collections.map(collection => ({
    id: numericId("collection", collection.id),
    title: collection.name,
    handle: collection.id,
    body_html: paragraph(`${collection.name} from AstroRekha, delivered digitally.`),
    image: image(collection.id),
    ...timestamp,
  }));
  const collectionByHandle = new Map<string, (typeof collections)[number]>(
    collections.map(collection => [collection.handle, collection]),
  );
  const products = catalogue.products.map(product => {
    const collection = collectionByHandle.get(product.collection_id);
    if (!collection) throw new Error("Missing Shiprocket product collection");
    const id = numericId("product", product.id);
    const productImage = image(collection.handle);
    const slug = product.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    return {
      collectionId: collection.id,
      item: {
        id,
        title: product.name,
        body_html: paragraph(product.description || `${product.name}, delivered digitally by AstroRekha.`),
        vendor: "AstroRekha",
        product_type: collection.title,
        handle: `${slug}-${id}`,
        tags: "Digital",
        status: "active",
        ...timestamp,
        image: productImage,
        options: [],
        variants: [{
          id: numericId("variant", product.id),
          title: "Default Title",
          price: (product.price.payable_minor / 100).toFixed(2),
          compare_at_price: null,
          sku: product.id,
          quantity: DIGITAL_AVAILABILITY,
          ...timestamp,
          taxable: true,
          option_values: {},
          grams: 0,
          image: productImage,
          weight: 0,
          weight_unit: "kg",
        }],
      },
    };
  });

  return { collections, products };
}
