"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { calculateInstantSigns } from "./zodiac-utils";

export type Gender = "female" | "male" | "non-binary" | null;
export type RelationshipStatus = "in-relationship" | "just-broke-up" | "engaged" | "married" | "looking-for-soulmate" | "single" | "complicated" | null;
export type ColorPreference = "red" | "yellow" | "blue" | "orange" | "green" | "violet" | null;
export type ElementPreference = "earth" | "water" | "fire" | "air" | null;

interface SignData {
  name: string;
  symbol: string;
  element: string;
  description: string;
}

interface OnboardingState {
  gender: Gender;
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  birthHour: string;
  birthMinute: string;
  birthPeriod: "AM" | "PM";
  birthPlace: string;
  knowsBirthTime: boolean;
  relationshipStatus: RelationshipStatus;
  goals: string[];
  colorPreference: ColorPreference;
  elementPreference: ElementPreference;
  sunSign: SignData | null;
  moonSign: SignData | null;
  ascendantSign: SignData | null;
  signsLoading: boolean;
  signsFromApi: boolean;
  modality: string | null;
  polarity: string | null;
  
  setGender: (gender: Gender) => void;
  setBirthDate: (month: string, day: string, year: string) => void;
  setBirthTime: (hour: string, minute: string, period: "AM" | "PM") => void;
  setBirthPlace: (place: string) => void;
  setKnowsBirthTime: (knows: boolean) => void;
  setRelationshipStatus: (status: RelationshipStatus) => void;
  setGoals: (goals: string[]) => void;
  setColorPreference: (color: ColorPreference) => void;
  setElementPreference: (element: ElementPreference) => void;
  setSigns: (sunSign: SignData, moonSign: SignData, ascendantSign: SignData, fromApi?: boolean) => void;
  setSignsLoading: (loading: boolean) => void;
  setModality: (modality: string) => void;
  setPolarity: (polarity: string) => void;
  calculateLocalSigns: () => void;
  fetchAccurateSigns: () => Promise<void>;
  reset: () => void;
}

const initialState = {
  gender: null as Gender,
  birthMonth: "January",
  birthDay: "1",
  birthYear: "2000",
  birthHour: "12",
  birthMinute: "00",
  birthPeriod: "AM" as const,
  birthPlace: "",
  knowsBirthTime: true,
  relationshipStatus: null as RelationshipStatus,
  goals: [] as string[],
  colorPreference: null as ColorPreference,
  elementPreference: null as ElementPreference,
  sunSign: null as SignData | null,
  moonSign: null as SignData | null,
  ascendantSign: null as SignData | null,
  signsLoading: false,
  signsFromApi: false,
  modality: null as string | null,
  polarity: null as string | null,
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setGender: (gender) => set({ gender }),
      
      setBirthDate: (birthMonth, birthDay, birthYear) =>
        set({ birthMonth, birthDay, birthYear }),
      
      setBirthTime: (birthHour, birthMinute, birthPeriod) =>
        set({ birthHour, birthMinute, birthPeriod }),
      
      setBirthPlace: (birthPlace) => set({ birthPlace }),
      
      setKnowsBirthTime: (knowsBirthTime) => set({ knowsBirthTime }),
      
      setRelationshipStatus: (relationshipStatus) => set({ relationshipStatus }),
      
      setGoals: (goals) => set({ goals }),
      
      setColorPreference: (colorPreference) => set({ colorPreference }),
      
      setElementPreference: (elementPreference) => set({ elementPreference }),
      
      setSigns: (sunSign, moonSign, ascendantSign, fromApi = false) => set({ 
        sunSign, 
        moonSign, 
        ascendantSign: { ...ascendantSign, name: ascendantSign.name, symbol: ascendantSign.symbol, element: ascendantSign.element, description: ascendantSign.description },
        signsFromApi: fromApi 
      }),
      
      setSignsLoading: (signsLoading) => set({ signsLoading }),
      
      setModality: (modality) => set({ modality }),
      
      setPolarity: (polarity) => set({ polarity }),
      
      calculateLocalSigns: () => set((state) => {
        const signs = calculateInstantSigns(
          state.birthMonth,
          state.birthDay,
          state.birthYear,
          state.birthHour,
          state.birthMinute,
          state.birthPeriod
        );
        return {
          sunSign: signs.sunSign,
          moonSign: signs.moonSign,
          ascendantSign: signs.ascendant,
          modality: signs.modality,
          polarity: signs.polarity,
          signsFromApi: false,
        };
      }),
      
      fetchAccurateSigns: async () => {
        const state = useOnboardingStore.getState();
        if (state.signsFromApi) return; // Already fetched from API
        
        set({ signsLoading: true });
        
        try {
          const response = await fetch("/api/astrology/signs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              birthMonth: state.birthMonth,
              birthDay: state.birthDay,
              birthYear: state.birthYear,
              birthHour: state.birthHour,
              birthMinute: state.birthMinute,
              birthPeriod: state.birthPeriod,
              birthPlace: state.birthPlace,
            }),
          });
          const data = await response.json();
          if (data.success) {
            set({
              sunSign: data.sunSign,
              moonSign: data.moonSign,
              ascendantSign: data.ascendant,
              modality: data.modality,
              polarity: data.polarity,
              signsFromApi: true,
              signsLoading: false,
            });
          } else {
            set({ signsLoading: false });
          }
        } catch (error) {
          console.error("Failed to fetch accurate signs:", error);
          set({ signsLoading: false });
        }
      },
      
      reset: () => set(initialState),
    }),
    {
      name: "astrorekha-onboarding",
    }
  )
);
