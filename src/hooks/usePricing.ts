"use client";

import { useState, useEffect } from "react";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

export function usePricing() {
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const response = await fetch("/api/pricing");
        const data = await response.json();
        if (data.success && data.pricing) {
          setPricing(data.pricing);
        }
      } catch (error) {
        console.error("Failed to fetch pricing:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPricing();
  }, []);

  return { pricing, isLoading };
}
