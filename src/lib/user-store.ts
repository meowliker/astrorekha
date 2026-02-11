"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PurchasedBundle = "palm-reading" | "palm-birth" | "palm-birth-compat" | null;

export interface UnlockedFeatures {
  palmReading: boolean;
  prediction2026: boolean;
  birthChart: boolean;
  compatibilityTest: boolean;
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
    coins?: number;
    purchasedBundle?: PurchasedBundle;
  }) => void;
}

const initialUnlockedFeatures: UnlockedFeatures = {
  palmReading: false,
  prediction2026: false,
  birthChart: false,
  compatibilityTest: false,
};

const initialState = {
  purchasedBundle: null as PurchasedBundle,
  unlockedFeatures: initialUnlockedFeatures,
  coins: 0,
  userId: null as string | null,
  birthChartGenerating: false,
  birthChartReady: false,
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
};

// Feature prices (INR)
export const featurePrices: Record<keyof UnlockedFeatures, number> = {
  palmReading: 582,
  prediction2026: 582,
  birthChart: 582,
  compatibilityTest: 582,
};
