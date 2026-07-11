"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type PurchasedBundle = "palm-reading" | "palm-birth" | "palm-birth-compat" | "palm-birth-sketch" | null;

export interface UnlockedFeatures {
  palmReading: boolean;
  prediction2026: boolean;
  birthChart: boolean;
  compatibilityTest: boolean;
  soulmateSketch: boolean;
  futurePartnerReport: boolean;
  vastuShastraGuide: boolean;
}

interface UserState {
  // Purchase State (one-time purchases only)
  purchasedBundle: PurchasedBundle;
  unlockedFeatures: UnlockedFeatures;
  coins: number;
  
  // User ID (set after registration)
  userId: string | null;
  
  // Birth chart generation state
  birthChartGenerating: boolean;
  birthChartReady: boolean;
  
  // Actions
  setPurchasedBundle: (bundle: PurchasedBundle) => void;
  unlockFeature: (feature: keyof UnlockedFeatures) => void;
  unlockAllFeatures: () => void;
  setCoins: (coins: number) => void;
  deductCoins: (amount: number) => boolean;
  addCoins: (amount: number) => void;
  setUserId: (id: string) => void;
  setBirthChartGenerating: (generating: boolean) => void;
  setBirthChartReady: (ready: boolean) => void;
  
  // Purchase actions
  purchaseBundle: (bundle: PurchasedBundle, features: (keyof UnlockedFeatures)[]) => void;
  purchaseUpsell: (feature: keyof UnlockedFeatures) => void;
  purchaseAllUpsells: () => void;
  
  // Reset for testing
  resetUserState: () => void;
  
  // Sync features from server data
  syncFromServer: (data: {
    unlockedFeatures?: Partial<UnlockedFeatures>;
    palmReading?: boolean;
    birthChart?: boolean;
    compatibilityTest?: boolean;
    prediction2026?: boolean;
    soulmateSketch?: boolean;
    futurePartnerReport?: boolean;
    vastuShastraGuide?: boolean;
    coins?: number;
    purchasedBundle?: PurchasedBundle;
  }) => void;
}

const initialUnlockedFeatures: UnlockedFeatures = {
  palmReading: false,
  prediction2026: false,
  birthChart: false,
  compatibilityTest: false,
  soulmateSketch: false,
  futurePartnerReport: false,
  vastuShastraGuide: false,
};

const initialState = {
  purchasedBundle: null as PurchasedBundle,
  unlockedFeatures: initialUnlockedFeatures,
  coins: 0,
  userId: null as string | null,
  birthChartGenerating: false,
  birthChartReady: false,
};

const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(name, value);
    } catch (error) {
      console.warn(`[UserStore] Failed to persist ${name}; clearing large local cache and retrying.`, error);
      try {
        window.localStorage.removeItem("astrorekha_palm_image");
        window.localStorage.setItem(name, value);
      } catch (retryError) {
        console.warn(`[UserStore] Failed to persist ${name} after cleanup.`, retryError);
      }
    }
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(name);
  },
};

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setPurchasedBundle: (bundle) => set({ purchasedBundle: bundle }),

      unlockFeature: (feature) =>
        set((state) => ({
          unlockedFeatures: {
            ...state.unlockedFeatures,
            [feature]: true,
          },
        })),

      unlockAllFeatures: () =>
        set({
          unlockedFeatures: {
            palmReading: true,
            prediction2026: true,
            birthChart: true,
            compatibilityTest: true,
            soulmateSketch: true,
            futurePartnerReport: true,
            vastuShastraGuide: true,
          },
        }),

      setCoins: (coins) => set({ coins }),

      deductCoins: (amount) => {
        const currentCoins = get().coins;
        if (currentCoins >= amount) {
          set({ coins: currentCoins - amount });
          return true;
        }
        return false;
      },

      addCoins: (amount) => set((state) => ({ coins: state.coins + amount })),

      setUserId: (id) => set({ userId: id }),

      setBirthChartGenerating: (generating) => set({ birthChartGenerating: generating }),

      setBirthChartReady: (ready) => set({ birthChartReady: ready }),

      // Purchase bundle — unlock features based on bundle tier
      purchaseBundle: (bundle, features) => {
        set((state) => {
          const updated = { ...state.unlockedFeatures };
          for (const f of features) {
            updated[f] = true;
          }
          return {
            purchasedBundle: bundle,
            unlockedFeatures: updated,
          };
        });
      },

      // Purchase individual upsell
      purchaseUpsell: (feature) =>
        set((state) => ({
          unlockedFeatures: {
            ...state.unlockedFeatures,
            [feature]: true,
          },
        })),

      // Purchase pack of 3 (all upsells)
      purchaseAllUpsells: () =>
        set({
          unlockedFeatures: {
            palmReading: true,
            prediction2026: true,
            birthChart: true,
            compatibilityTest: true,
            soulmateSketch: true,
            futurePartnerReport: true,
            vastuShastraGuide: true,
          },
        }),

      // Reset for testing
      resetUserState: () => set(initialState),
      
      // Sync features from server data
      syncFromServer: (data) => {
        const updates: Partial<UserState> = {};
        
        const features: UnlockedFeatures = {
          palmReading: data.unlockedFeatures?.palmReading ?? data.palmReading ?? false,
          birthChart: data.unlockedFeatures?.birthChart ?? data.birthChart ?? false,
          compatibilityTest: data.unlockedFeatures?.compatibilityTest ?? data.compatibilityTest ?? false,
          prediction2026: data.unlockedFeatures?.prediction2026 ?? data.prediction2026 ?? false,
          soulmateSketch: data.unlockedFeatures?.soulmateSketch ?? data.soulmateSketch ?? false,
          futurePartnerReport:
            data.unlockedFeatures?.futurePartnerReport ?? data.futurePartnerReport ?? false,
          vastuShastraGuide:
            data.unlockedFeatures?.vastuShastraGuide ?? data.vastuShastraGuide ?? false,
        };
        updates.unlockedFeatures = features;
        
        if (typeof data.coins === "number") {
          updates.coins = data.coins;
        }
        
        if (data.purchasedBundle) {
          updates.purchasedBundle = data.purchasedBundle;
        }
        
        set(updates);
      },
    }),
    {
      name: "astrorekha-user",
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        purchasedBundle: state.purchasedBundle,
        unlockedFeatures: state.unlockedFeatures,
        coins: state.coins,
        userId: state.userId,
        birthChartReady: state.birthChartReady,
      }),
    }
  )
);

// Helper to check if a feature is accessible
export const isFeatureUnlocked = (
  feature: keyof UnlockedFeatures,
  unlockedFeatures: UnlockedFeatures
): boolean => {
  return unlockedFeatures[feature];
};

// Feature names for display
export const featureNames: Record<keyof UnlockedFeatures, string> = {
  palmReading: "Palm Reading Report",
  prediction2026: "2026 Predictions",
  birthChart: "Birth Chart",
  compatibilityTest: "Compatibility Test",
  soulmateSketch: "Soulmate Sketch",
  futurePartnerReport: "Future Partner Report",
  vastuShastraGuide: "Complete Vastu Shastra Guide Ebook",
};

// Feature prices (INR)
export const featurePrices: Record<keyof UnlockedFeatures, number> = {
  palmReading: 582,
  prediction2026: 582,
  birthChart: 582,
  compatibilityTest: 582,
  soulmateSketch: 582,
  futurePartnerReport: 582,
  vastuShastraGuide: 297,
};
