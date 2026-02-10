import { db } from "./firebase";
import { auth } from "./firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";

interface SignData {
  name: string;
  symbol: string;
  element: string;
  description: string;
}

export interface UserProfile {
  id: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
  
  // Onboarding data
  gender: string | null;
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  birthHour: string;
  birthMinute: string;
  birthPeriod: "AM" | "PM";
  birthPlace: string;
  knowsBirthTime: boolean;
  relationshipStatus: string | null;
  goals: string[];
  colorPreference: string | null;
  elementPreference: string | null;
  
  // Computed/AI data
  zodiacSign: string;
  sunSign?: SignData | null;
  moonSign?: SignData | null;
  ascendantSign?: SignData | null;
  
  // Palm reading data
  palmImageUrl?: string;
  palmImage?: string | null; // Base64 image
  palmReadingResult?: any;
  palmReadingDate?: string;
}

const ZODIAC_DATES = [
  { sign: "Capricorn", start: [12, 22], end: [1, 19] },
  { sign: "Aquarius", start: [1, 20], end: [2, 18] },
  { sign: "Pisces", start: [2, 19], end: [3, 20] },
  { sign: "Aries", start: [3, 21], end: [4, 19] },
  { sign: "Taurus", start: [4, 20], end: [5, 20] },
  { sign: "Gemini", start: [5, 21], end: [6, 20] },
  { sign: "Cancer", start: [6, 21], end: [7, 22] },
  { sign: "Leo", start: [7, 23], end: [8, 22] },
  { sign: "Virgo", start: [8, 23], end: [9, 22] },
  { sign: "Libra", start: [9, 23], end: [10, 22] },
  { sign: "Scorpio", start: [10, 23], end: [11, 21] },
  { sign: "Sagittarius", start: [11, 22], end: [12, 21] },
];

const MONTH_MAP: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

export function calculateZodiacSign(month: string, day: string): string {
  const monthNum = MONTH_MAP[month] || parseInt(month) || 1;
  const dayNum = parseInt(day) || 1;

  for (const zodiac of ZODIAC_DATES) {
    const [startMonth, startDay] = zodiac.start;
    const [endMonth, endDay] = zodiac.end;

    if (startMonth === endMonth) {
      if (monthNum === startMonth && dayNum >= startDay && dayNum <= endDay) {
        return zodiac.sign;
      }
    } else if (startMonth > endMonth) {
      // Capricorn case (Dec-Jan)
      if ((monthNum === startMonth && dayNum >= startDay) || 
          (monthNum === endMonth && dayNum <= endDay)) {
        return zodiac.sign;
      }
    } else {
      if ((monthNum === startMonth && dayNum >= startDay) || 
          (monthNum === endMonth && dayNum <= endDay)) {
        return zodiac.sign;
      }
    }
  }
  return "Unknown";
}

// Generate a unique user ID from device/browser
export function generateUserId(): string {
  if (typeof window === "undefined") return "server";

  const authUid = auth.currentUser?.uid;
  if (authUid) {
    localStorage.setItem("palmcosmic_user_id", authUid);
    return authUid;
  }

  const currentId = localStorage.getItem("palmcosmic_user_id");
  if (currentId) return currentId;

  const anonIdKey = "palmcosmic_anon_id";
  const existingAnonId = localStorage.getItem(anonIdKey);
  if (existingAnonId) {
    localStorage.setItem("palmcosmic_user_id", existingAnonId);
    return existingAnonId;
  }

  const newAnonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  localStorage.setItem(anonIdKey, newAnonId);
  localStorage.setItem("palmcosmic_user_id", newAnonId);
  return newAnonId;
}

// Save user profile to Firestore
export async function saveUserProfile(onboardingData: {
  userId?: string;
  email?: string;
  gender: string | null;
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  birthHour: string;
  birthMinute: string;
  birthPeriod: "AM" | "PM";
  birthPlace: string;
  knowsBirthTime: boolean;
  relationshipStatus: string | null;
  goals: string[];
  colorPreference: string | null;
  elementPreference: string | null;
  sunSign?: SignData | null;
  moonSign?: SignData | null;
  ascendantSign?: SignData | null;
  palmImage?: string | null;
  createdAt?: string;
}): Promise<UserProfile> {
  const { userId: providedUserId, ...rest } = onboardingData;
  const userId = providedUserId || generateUserId();
  const zodiacSign = calculateZodiacSign(onboardingData.birthMonth, onboardingData.birthDay);
  
  const profile: UserProfile = {
    id: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...rest,
    zodiacSign,
  };

  await setDoc(doc(db, "user_profiles", userId), profile);
  return profile;
}

// Get user profile from Firestore
export async function getUserProfile(): Promise<UserProfile | null> {
  const userId = generateUserId();
  
  try {
    const docSnap = await getDoc(doc(db, "user_profiles", userId));
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
  } catch (error) {
    console.error("Failed to get user profile:", error);
  }
  
  return null;
}

// Update user profile
export async function updateUserProfile(updates: Partial<UserProfile>): Promise<void> {
  const userId = generateUserId();
  
  await updateDoc(doc(db, "user_profiles", userId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

// Save palm image and update profile
export async function savePalmImage(imageDataUrl: string): Promise<string> {
  const userId = generateUserId();
  
  try {
    const storage = getStorage();
    const imageRef = ref(storage, `palm_images/${userId}_${Date.now()}.jpg`);
    
    // Upload base64 image
    await uploadString(imageRef, imageDataUrl, "data_url");
    
    // Get download URL
    const downloadUrl = await getDownloadURL(imageRef);
    
    // Update user profile with palm image URL
    await updateDoc(doc(db, "user_profiles", userId), {
      palmImageUrl: downloadUrl,
      updatedAt: new Date().toISOString(),
    });
    
    return downloadUrl;
  } catch (error) {
    console.error("Failed to save palm image:", error);
    throw error;
  }
}

// Save palm reading result
export async function savePalmReadingResult(result: any): Promise<void> {
  const userId = generateUserId();
  
  await updateDoc(doc(db, "user_profiles", userId), {
    palmReadingResult: result,
    palmReadingDate: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
