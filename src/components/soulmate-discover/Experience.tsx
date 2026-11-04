"use client";

import { createContext, useContext, type ReactNode } from "react";

export type SoulmateRegion = "india" | "us";
const Discover = createContext<SoulmateRegion | null>(null);
export function SoulmateDiscoverProvider({ region, children }: { region: SoulmateRegion; children: ReactNode }) {
  return <Discover.Provider value={region}>{children}</Discover.Provider>;
}
export const useSoulmateDiscover = () => useContext(Discover);
export const discoverEntry = (region: SoulmateRegion) => region === "us" ? "/us/soulmate/discover" : "/soulmate/discover";
export function discoverAsset(region: SoulmateRegion, path: string) {
  if (!path.startsWith("/soulmate/") || path.includes("..")) throw new Error("Invalid discover artwork");
  return `/discover-assets/${region}/${path.slice("/soulmate/".length).replace(/\.png$/, ".webp")}`;
}

/** The same questions and saved answers feed the same checkout and report preparation. */
export function discoverMessages<T extends { id: string; text: string }>(messages: T[]): T[] {
  const copy: Record<string, string> = {
    hello: "Welcome. This is AstroRekha’s automated AI sketch guide.",
    introduction: "Your answers will personalize a digital portrait inspired by your preferences. It does not identify a real future partner.",
    "zodiac-name": "This zodiac sign is calculated from the date of birth you provided.",
    gathering: "Your preferences are saved for this order. Your sketch is generated after payment confirmation.",
    ready: "You can now review the available packages and their full prices.",
    "portrait-intro": "Your purchase is for an AI-generated digital portrait and any written content included in your package, for personal reflection.",
  };
  return messages.filter(message => message.id !== "location").map(message => copy[message.id] ? { ...message, text: copy[message.id] } : message);
}
