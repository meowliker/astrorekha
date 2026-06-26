// Meta Pixel Event Tracking
// Use these functions to track conversions and user actions

declare global {
  interface Window {
    fbq: (...args: any[]) => void;
  }
}

type PixelEventOptions = {
  eventId?: string;
};

function createEventId(eventName: string): string {
  const safeEventName = eventName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `ar_${safeEventName}_${Date.now()}_${random}`;
}

/**
 * Track a standard event with Meta Pixel.
 * Retries up to 10 times (500ms apart) if fbq isn't loaded yet,
 * which commonly happens after returning from Razorpay checkout.
 */
export const trackPixelEvent = (
  eventName: string,
  params?: Record<string, any>,
  options: PixelEventOptions = {}
) => {
  if (typeof window === "undefined") return;

  const eventId = options.eventId || createEventId(eventName);

  const fire = (attempt: number) => {
    if (window.fbq) {
      window.fbq("track", eventName, params, { eventID: eventId });
    } else if (attempt < 10) {
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
export const trackCustomEvent = (
  eventName: string,
  params?: Record<string, any>,
  options: PixelEventOptions = {}
) => {
  if (typeof window === "undefined") return;

  const eventId = options.eventId || createEventId(eventName);

  const fire = (attempt: number) => {
    if (window.fbq) {
      window.fbq("trackCustom", eventName, params, { eventID: eventId });
    } else if (attempt < 5) {
      setTimeout(() => fire(attempt + 1), 500);
    }
  };

  fire(0);
};

// ============================================
// Standard Meta Pixel Events for AstroRekha
// ============================================

export const pixelEvents = {
  // --- Onboarding Funnel ---
  
  /** User lands on the app/starts onboarding */
  lead: (eventId?: string) => trackPixelEvent("Lead", undefined, { eventId }),
  
  /** User shows interest (email submitted, "Get My Prediction" clicked) */
  addToWishlist: (contentName: string = "Prediction Report", eventId?: string) =>
    trackPixelEvent("AddToWishlist", { 
      content_name: contentName,
      content_category: "Astrology Report"
    }, { eventId }),
  
  /** User clicks "Start Trial" button (before payment) */
  addToCart: (value: number, contentName: string, eventId?: string) =>
    trackPixelEvent("AddToCart", { 
      value, 
      currency: "INR",
      content_name: contentName,
      content_type: "product"
    }, { eventId }),
  
  /** User completes sign-up (creates account) */
  completeRegistration: (email?: string, eventId?: string) =>
    trackPixelEvent("CompleteRegistration", { 
      content_name: "AstroRekha Account",
      ...(email && { email })
    }, { eventId }),
  
  // --- One-Time Purchases ---
  
  /** User starts a purchase flow */
  startTrial: (value: number = 0, eventId?: string) =>
    trackPixelEvent("StartTrial", { 
      value, 
      currency: "INR",
      content_name: "AstroRekha Bundle"
    }, { eventId }),
  
  /** User completes a bundle purchase */
  subscribe: (value: number, plan: string, eventId?: string) =>
    trackPixelEvent("Subscribe", { 
      value, 
      currency: "INR",
      content_name: plan,
      predicted_ltv: value
    }, { eventId }),
  
  // --- Purchases ---
  
  /** User initiates checkout */
  initiateCheckout: (value: number, items: string[], eventId?: string) =>
    trackPixelEvent("InitiateCheckout", { 
      value, 
      currency: "INR",
      content_ids: items,
      num_items: items.length
    }, { eventId }),
  
  /** User adds payment info (redirected to Razorpay checkout) */
  addPaymentInfo: (value: number, contentName: string, eventId?: string) =>
    trackPixelEvent("AddPaymentInfo", { 
      value, 
      currency: "INR",
      content_name: contentName,
      content_category: "Bundle"
    }, { eventId }),
  
  /** User completes a purchase */
  purchase: (value: number, productId: string, productName: string, eventId?: string) =>
    trackPixelEvent("Purchase", { 
      value, 
      currency: "INR",
      content_ids: [productId],
      content_name: productName,
      content_type: "product"
    }, { eventId }),
  
  /** User buys coins */
  purchaseCoins: (value: number, coinAmount: number, eventId?: string) =>
    trackPixelEvent("Purchase", { 
      value, 
      currency: "INR",
      content_ids: [`coins-${coinAmount}`],
      content_name: `${coinAmount} Coins`,
      content_type: "product"
    }, { eventId }),
  
  // --- Engagement ---
  
  /** User views a specific content/feature */
  viewContent: (contentName: string, contentType: string, eventId?: string) =>
    trackPixelEvent("ViewContent", { 
      content_name: contentName,
      content_type: contentType
    }, { eventId }),
  
  /** User uses chat (contact) */
  contact: (eventId?: string) => trackPixelEvent("Contact", undefined, { eventId }),
  
  /** User searches */
  search: (query: string, eventId?: string) =>
    trackPixelEvent("Search", { search_string: query }, { eventId }),
};

// ============================================
// Custom Events for Detailed Funnel Tracking
// ============================================

export const customEvents = {
  // Onboarding step tracking
  onboardingStep: (step: number, stepName: string, eventId?: string) =>
    trackCustomEvent("OnboardingStep", { step, step_name: stepName }, { eventId }),
  
  // Palm scan completed
  palmScanComplete: (eventId?: string) =>
    trackCustomEvent("PalmScanComplete", undefined, { eventId }),
  
  // Birth chart viewed
  birthChartViewed: (eventId?: string) =>
    trackCustomEvent("BirthChartViewed", undefined, { eventId }),
  
  // Horoscope viewed
  horoscopeViewed: (sign: string, period: string, eventId?: string) =>
    trackCustomEvent("HoroscopeViewed", { sign, period }, { eventId }),
  
  // Chat message sent
  chatMessageSent: (eventId?: string) =>
    trackCustomEvent("ChatMessageSent", undefined, { eventId }),
  
  // Feature unlocked
  featureUnlocked: (feature: string, eventId?: string) =>
    trackCustomEvent("FeatureUnlocked", { feature }, { eventId }),
};
