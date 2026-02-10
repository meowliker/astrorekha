// Meta Pixel Event Tracking
// Use these functions to track conversions and user actions

declare global {
  interface Window {
    fbq: (...args: any[]) => void;
  }
}

/**
 * Track a standard event with Meta Pixel.
 * Retries up to 10 times (500ms apart) if fbq isn't loaded yet,
 * which commonly happens after returning from Stripe checkout.
 */
export const trackPixelEvent = (eventName: string, params?: Record<string, any>) => {
  if (typeof window === "undefined") return;

  const fire = (attempt: number) => {
    if (window.fbq) {
      console.log(`[Meta Pixel] Tracking: ${eventName}`, params);
      window.fbq("track", eventName, params);
    } else if (attempt < 10) {
      console.log(`[Meta Pixel] fbq not ready, retrying ${eventName} (${attempt + 1}/10)...`);
      setTimeout(() => fire(attempt + 1), 500);
    } else {
      console.warn(`[Meta Pixel] fbq never loaded, dropped event: ${eventName}`);
    }
  };

  fire(0);
};

/**
 * Track a custom event (for events not in Meta's standard list)
 */
export const trackCustomEvent = (eventName: string, params?: Record<string, any>) => {
  if (typeof window === "undefined") return;

  const fire = (attempt: number) => {
    if (window.fbq) {
      window.fbq("trackCustom", eventName, params);
    } else if (attempt < 5) {
      setTimeout(() => fire(attempt + 1), 500);
    }
  };

  fire(0);
};

// ============================================
// Standard Meta Pixel Events for PalmCosmic
// ============================================

export const pixelEvents = {
  // --- Onboarding Funnel ---
  
  /** User lands on the app/starts onboarding */
  lead: () => trackPixelEvent("Lead"),
  
  /** User shows interest (email submitted, "Get My Prediction" clicked) */
  addToWishlist: (contentName: string = "Prediction Report") => 
    trackPixelEvent("AddToWishlist", { 
      content_name: contentName,
      content_category: "Astrology Report"
    }),
  
  /** User clicks "Start Trial" button (before payment) */
  addToCart: (value: number, contentName: string) => 
    trackPixelEvent("AddToCart", { 
      value, 
      currency: "USD",
      content_name: contentName,
      content_type: "product"
    }),
  
  /** User completes sign-up (creates account) */
  completeRegistration: (email?: string) => 
    trackPixelEvent("CompleteRegistration", { 
      content_name: "PalmCosmic Account",
      ...(email && { email })
    }),
  
  // --- Trial & Subscription ---
  
  /** User starts free trial */
  startTrial: (value: number = 0) => 
    trackPixelEvent("StartTrial", { 
      value, 
      currency: "USD",
      content_name: "PalmCosmic Trial"
    }),
  
  /** User subscribes (weekly/monthly/yearly) */
  subscribe: (value: number, plan: string) => 
    trackPixelEvent("Subscribe", { 
      value, 
      currency: "USD",
      content_name: plan,
      predicted_ltv: value * 12 // Estimated yearly value
    }),
  
  // --- Purchases ---
  
  /** User initiates checkout */
  initiateCheckout: (value: number, items: string[]) => 
    trackPixelEvent("InitiateCheckout", { 
      value, 
      currency: "USD",
      content_ids: items,
      num_items: items.length
    }),
  
  /** User adds payment info (redirected to Stripe checkout) */
  addPaymentInfo: (value: number, contentName: string) => 
    trackPixelEvent("AddPaymentInfo", { 
      value, 
      currency: "USD",
      content_name: contentName,
      content_category: "Subscription"
    }),
  
  /** User completes a purchase */
  purchase: (value: number, productId: string, productName: string) => 
    trackPixelEvent("Purchase", { 
      value, 
      currency: "USD",
      content_ids: [productId],
      content_name: productName,
      content_type: "product"
    }),
  
  /** User buys coins */
  purchaseCoins: (value: number, coinAmount: number) => 
    trackPixelEvent("Purchase", { 
      value, 
      currency: "USD",
      content_ids: [`coins-${coinAmount}`],
      content_name: `${coinAmount} Coins`,
      content_type: "product"
    }),
  
  // --- Engagement ---
  
  /** User views a specific content/feature */
  viewContent: (contentName: string, contentType: string) => 
    trackPixelEvent("ViewContent", { 
      content_name: contentName,
      content_type: contentType
    }),
  
  /** User uses chat (contact) */
  contact: () => trackPixelEvent("Contact"),
  
  /** User searches */
  search: (query: string) => 
    trackPixelEvent("Search", { search_string: query }),
};

// ============================================
// Custom Events for Detailed Funnel Tracking
// ============================================

export const customEvents = {
  // Onboarding step tracking
  onboardingStep: (step: number, stepName: string) => 
    trackCustomEvent("OnboardingStep", { step, step_name: stepName }),
  
  // Palm scan completed
  palmScanComplete: () => 
    trackCustomEvent("PalmScanComplete"),
  
  // Birth chart viewed
  birthChartViewed: () => 
    trackCustomEvent("BirthChartViewed"),
  
  // Horoscope viewed
  horoscopeViewed: (sign: string, period: string) => 
    trackCustomEvent("HoroscopeViewed", { sign, period }),
  
  // Chat message sent
  chatMessageSent: () => 
    trackCustomEvent("ChatMessageSent"),
  
  // Feature unlocked
  featureUnlocked: (feature: string) => 
    trackCustomEvent("FeatureUnlocked", { feature }),
};
