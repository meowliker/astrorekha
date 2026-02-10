"use client";

import { useMemo, useEffect, useState } from "react";

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// Cache keys for localStorage
const CACHE_KEY_NAME = "palmcosmic_user_name";
const CACHE_KEY_EMAIL = "palmcosmic_email";

// Helper to get cached user info
export function getCachedUserInfo(): { name: string | null; email: string | null } {
  if (typeof window === "undefined") return { name: null, email: null };
  return {
    name: localStorage.getItem(CACHE_KEY_NAME),
    email: localStorage.getItem(CACHE_KEY_EMAIL),
  };
}

// Helper to cache user info
export function cacheUserInfo(name?: string | null, email?: string | null) {
  if (typeof window === "undefined") return;
  if (name) localStorage.setItem(CACHE_KEY_NAME, name);
  if (email) localStorage.setItem(CACHE_KEY_EMAIL, email);
}

const gradients = [
  "from-rose-500 to-pink-500",
  "from-purple-500 to-indigo-500",
  "from-blue-500 to-cyan-500",
  "from-teal-500 to-emerald-500",
  "from-green-500 to-lime-500",
  "from-yellow-500 to-orange-500",
  "from-orange-500 to-red-500",
  "from-pink-500 to-purple-500",
  "from-indigo-500 to-blue-500",
  "from-cyan-500 to-teal-500",
];

const sizeClasses = {
  sm: "w-8 h-8 text-sm",
  md: "w-10 h-10 text-base",
  lg: "w-12 h-12 text-lg",
};

export function UserAvatar({ name, email, size = "md", className = "" }: UserAvatarProps) {
  // Use cached values immediately, then update with props
  const [cachedName, setCachedName] = useState<string | null>(null);
  const [cachedEmail, setCachedEmail] = useState<string | null>(null);

  // Load cached values on mount
  useEffect(() => {
    const cached = getCachedUserInfo();
    setCachedName(cached.name);
    setCachedEmail(cached.email);
  }, []);

  // Update cache when props change
  useEffect(() => {
    if (name || email) {
      cacheUserInfo(name, email);
      if (name) setCachedName(name);
      if (email) setCachedEmail(email);
    }
  }, [name, email]);

  // Use props if available, otherwise use cached values
  const displayName = name || cachedName;
  const displayEmail = email || cachedEmail;

  // Get initial from name or email
  const initial = useMemo(() => {
    if (displayName && displayName.trim().length > 0) {
      return displayName.trim().charAt(0).toUpperCase();
    }
    if (displayEmail && displayEmail.trim().length > 0) {
      return displayEmail.trim().charAt(0).toUpperCase();
    }
    return "U";
  }, [displayName, displayEmail]);

  // Generate consistent gradient based on name/email
  const gradient = useMemo(() => {
    const str = displayName || displayEmail || "user";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  }, [displayName, displayEmail]);

  return (
    <div
      className={`rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-semibold text-white ${sizeClasses[size]} ${className}`}
    >
      {initial}
    </div>
  );
}

export function getUserDisplayName(name?: string | null, email?: string | null): string {
  // Check props first
  if (name && name.trim().length > 0) {
    return name.trim();
  }
  if (email && email.trim().length > 0) {
    // Extract name from email (before @)
    const emailName = email.split("@")[0];
    // Capitalize first letter
    return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  }
  
  // Fall back to cached values
  const cached = getCachedUserInfo();
  if (cached.name && cached.name.trim().length > 0) {
    return cached.name.trim();
  }
  if (cached.email && cached.email.trim().length > 0) {
    const emailName = cached.email.split("@")[0];
    return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  }
  
  return "You";
}
