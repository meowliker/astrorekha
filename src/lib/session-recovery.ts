"use client";
import type { StoredProfile } from "@/lib/stored-profile-types";


import { supabase } from "@/lib/supabase";

export async function resolveStoredUserSession(): Promise<StoredProfile | null> {
  if (typeof window === "undefined") return null;

  const storedId = (localStorage.getItem("astrorekha_user_id") || "").trim();
  const storedEmail = (
    localStorage.getItem("astrorekha_email") ||
    localStorage.getItem("astrorekha_checkout_email") ||
    ""
  ).trim().toLowerCase();

  let userRow: StoredProfile | null = null;

  if (storedEmail) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("email", storedEmail)
      .maybeSingle();
    userRow = data || null;
  }

  if (!userRow && storedId) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", storedId)
      .maybeSingle();
    userRow = data || null;
  }

  if (!userRow) return null;

  if (userRow.id && userRow.id !== storedId) {
    localStorage.setItem("astrorekha_user_id", userRow.id);
  }

  if (userRow.email) {
    const normalizedEmail = String(userRow.email).trim().toLowerCase();
    localStorage.setItem("astrorekha_email", normalizedEmail);
    localStorage.setItem("astrorekha_checkout_email", normalizedEmail);
  }

  return userRow;
}
