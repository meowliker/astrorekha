"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  signsError: string | null;
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
  signsError: null as string | null,
  modality: null as string | null,
  polarity: null as string | null,
};

const invalidatedSigns = {
  sunSign: null,
  moonSign: null,
  ascendantSign: null,
  signsLoading: false,
  signsFromApi: false,
  signsError: null,
  modality: null,
  polarity: null,
};

function birthDetailsKey(state: OnboardingState): string {
  return JSON.stringify([
    state.birthMonth, state.birthDay, state.birthYear,
    state.knowsBirthTime ? state.birthHour : null,
    state.knowsBirthTime ? state.birthMinute : null,
    state.knowsBirthTime ? state.birthPeriod : null,
    state.birthPlace.trim().toLowerCase(), state.knowsBirthTime,
  ]);
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setGender: (gender) => set({ gender }),
      
      setBirthDate: (birthMonth, birthDay, birthYear) =>
        set({ ...invalidatedSigns, birthMonth, birthDay, birthYear }),
      
      setBirthTime: (birthHour, birthMinute, birthPeriod) =>
        set({ ...invalidatedSigns, birthHour, birthMinute, birthPeriod, knowsBirthTime: true }),
      
      setBirthPlace: (birthPlace) => set({ ...invalidatedSigns, birthPlace }),
      
      setKnowsBirthTime: (knowsBirthTime) => set({ ...invalidatedSigns, knowsBirthTime }),
      
      setRelationshipStatus: (relationshipStatus) => set({ relationshipStatus }),
      
      setGoals: (goals) => set({ goals }),
      
      setColorPreference: (colorPreference) => set({ colorPreference }),
      
      setElementPreference: (elementPreference) => set({ elementPreference }),
      
      setSigns: (sunSign, moonSign, ascendantSign, fromApi = false) => set({ 
        sunSign, 
        moonSign, 
        ascendantSign: { ...ascendantSign, name: ascendantSign.name, symbol: ascendantSign.symbol, element: ascendantSign.element, description: ascendantSign.description },
        signsFromApi: fromApi,
        signsError: null,
      }),
      
      setSignsLoading: (signsLoading) => set({ signsLoading }),
      
      setModality: (modality) => set({ modality }),
      
      setPolarity: (polarity) => set({ polarity }),
      
      fetchAccurateSigns: async () => {
        const state = useOnboardingStore.getState();
        if (state.signsFromApi || state.signsLoading) return;
        const requestedBirthDetails = birthDetailsKey(state);
        
        set({ signsLoading: true, signsError: null });
        
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
              knowsBirthTime: state.knowsBirthTime,
            }),
          });
          const data = await response.json();
          if (birthDetailsKey(useOnboardingStore.getState()) !== requestedBirthDetails) return;
          if (response.ok && data.success && data.sunSign?.name) {
            set({
              sunSign: data.sunSign,
              moonSign: data.moonSign ?? null,
              ascendantSign: data.ascendant ?? null,
              modality: data.modality,
              polarity: data.polarity,
              signsFromApi: true,
              signsLoading: false,
              signsError: null,
            });
          } else {
            set({ signsLoading: false, signsError: data.error || "Unable to calculate your signs. Please try again." });
          }
        } catch (error) {
          console.error("Failed to fetch accurate signs:", error);
          if (birthDetailsKey(useOnboardingStore.getState()) === requestedBirthDetails) {
            set({ signsLoading: false, signsError: "Unable to calculate your signs. Please try again." });
          }
        }
      },
      
      reset: () => set(initialState),
    }),
    {
      name: "astrorekha-onboarding",
      version: 1,
      migrate: (persistedState) => ({ ...(persistedState as object), ...invalidatedSigns }),
    }
  )
);
