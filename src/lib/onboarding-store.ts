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
  
  setGender: (gender: Gender) => void;
  setBirthDate: (month: string, day: string, year: string) => void;
  setBirthTime: (hour: string, minute: string, period: "AM" | "PM") => void;
  setBirthPlace: (place: string) => void;
  setKnowsBirthTime: (knows: boolean) => void;
  setRelationshipStatus: (status: RelationshipStatus) => void;
  setGoals: (goals: string[]) => void;
  setColorPreference: (color: ColorPreference) => void;
  setElementPreference: (element: ElementPreference) => void;
  setSigns: (sunSign: SignData, moonSign: SignData, ascendantSign: SignData) => void;
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
      
      setSigns: (sunSign, moonSign, ascendantSign) => set({ sunSign, moonSign, ascendantSign }),
      
      reset: () => set(initialState),
    }),
    {
      name: "palmcosmic-onboarding",
    }
  )
);
