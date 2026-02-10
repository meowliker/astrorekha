"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SubscriptionPlan = "1week" | "2week" | "4week" | "weekly" | "monthly" | "yearly" | "Yearly2" | "1week-v2" | "4week-v2" | "12week-v2" | null;

export interface UnlockedFeatures {
  palmReading: boolean;
  prediction2026: boolean;
  birthChart: boolean;
  compatibilityTest: boolean;
}

interface UserState {
  // Subscription & Purchase State
  subscriptionPlan: SubscriptionPlan;
  unlockedFeatures: UnlockedFeatures;
  coins: number;
  
  // Firebase user ID (set after registration)
  firebaseUserId: string | null;
  
  // Birth chart generation state
  birthChartGenerating: boolean;
  birthChartReady: boolean;
  
  // Actions
  setSubscriptionPlan: (plan: SubscriptionPlan) => void;
  unlockFeature: (feature: keyof UnlockedFeatures) => void;
  unlockAllFeatures: () => void;
  setCoins: (coins: number) => void;
  deductCoins: (amount: number) => boolean;
  addCoins: (amount: number) => void;
  setFirebaseUserId: (id: string) => void;
  setBirthChartGenerating: (generating: boolean) => void;
  setBirthChartReady: (ready: boolean) => void;
  
  // Purchase actions (will integrate with Stripe later)
  purchaseSubscription: (plan: SubscriptionPlan) => void;
  purchaseUpsell: (feature: keyof UnlockedFeatures) => void;
  purchaseAllUpsells: () => void;
  
  // Reset for testing
  resetUserState: () => void;
  
  // Sync features from Firebase data
  syncFromFirebase: (data: {
    unlockedFeatures?: Partial<UnlockedFeatures>;
    palmReading?: boolean;
    birthChart?: boolean;
    compatibilityTest?: boolean;
    prediction2026?: boolean;
    coins?: number;
    subscriptionPlan?: SubscriptionPlan;
  }) => void;
}

const initialUnlockedFeatures: UnlockedFeatures = {
  palmReading: true, // Always unlocked with base subscription
  prediction2026: false,
  birthChart: false,
  compatibilityTest: false,
};

const initialState = {
  subscriptionPlan: null as SubscriptionPlan,
  unlockedFeatures: initialUnlockedFeatures,
  coins: 0,
  firebaseUserId: null as string | null,
  birthChartGenerating: false,
  birthChartReady: false,
};

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setSubscriptionPlan: (plan) => set({ subscriptionPlan: plan }),

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

      setFirebaseUserId: (id) => set({ firebaseUserId: id }),

      setBirthChartGenerating: (generating) => set({ birthChartGenerating: generating }),

      setBirthChartReady: (ready) => set({ birthChartReady: ready }),

      // Purchase subscription - sets coins based on plan
      purchaseSubscription: (plan) => {
        let coins = 0;
        if (plan === "weekly") {
          coins = 15;
        } else if (plan === "monthly") {
          coins = 30;
        } else if (plan === "yearly") {
          coins = 100;
        }
        set({
          subscriptionPlan: plan,
          coins,
          unlockedFeatures: {
            ...initialUnlockedFeatures,
            palmReading: true, // Base subscription includes palm reading
          },
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
      
      // Sync features from Firebase data
      syncFromFirebase: (data) => {
        const updates: Partial<UserState> = {};
        
        // Sync unlocked features - check both nested object and flat fields
        const features: UnlockedFeatures = {
          palmReading: data.unlockedFeatures?.palmReading ?? data.palmReading ?? false,
          birthChart: data.unlockedFeatures?.birthChart ?? data.birthChart ?? false,
          compatibilityTest: data.unlockedFeatures?.compatibilityTest ?? data.compatibilityTest ?? false,
          prediction2026: data.unlockedFeatures?.prediction2026 ?? data.prediction2026 ?? false,
        };
        updates.unlockedFeatures = features;
        
        // Sync coins if provided
        if (typeof data.coins === "number") {
          updates.coins = data.coins;
        }
        
        // Sync subscription plan if provided
        if (data.subscriptionPlan) {
          updates.subscriptionPlan = data.subscriptionPlan;
        }
        
        set(updates);
      },
    }),
    {
      name: "palmcosmic-user",
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

// Feature prices
export const featurePrices: Record<keyof UnlockedFeatures, number> = {
  palmReading: 6.99,
  prediction2026: 6.99,
  birthChart: 6.99,
  compatibilityTest: 6.99,
};
