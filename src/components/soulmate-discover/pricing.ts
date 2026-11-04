import type { SoulmateRegion } from "./Experience";
import { priceWithGst } from "@/app/soulmate/chat-data";
import { priceWithTax } from "@/app/us/soulmate/chat-data";

export const discoverTotal = (value: number, region: SoulmateRegion) => region === "us" ? priceWithTax(value).total : priceWithGst(value).total;
export const discoverMoney = (value: number, region: SoulmateRegion) => new Intl.NumberFormat(region === "us" ? "en-US" : "en-IN", { style: "currency", currency: region === "us" ? "USD" : "INR" }).format(value);
