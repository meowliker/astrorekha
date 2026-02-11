import { supabase } from "./supabase";

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

  const currentId = localStorage.getItem("astrorekha_user_id");
  if (currentId) return currentId;

  const anonIdKey = "astrorekha_anon_id";
  const existingAnonId = localStorage.getItem(anonIdKey);
  if (existingAnonId) {
    localStorage.setItem("astrorekha_user_id", existingAnonId);
    return existingAnonId;
  }

  const newAnonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  localStorage.setItem(anonIdKey, newAnonId);
  localStorage.setItem("astrorekha_user_id", newAnonId);
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

  await supabase.from("user_profiles").upsert({
    id: userId,
    email: onboardingData.email,
    gender: profile.gender,
    birth_month: profile.birthMonth,
    birth_day: profile.birthDay,
    birth_year: profile.birthYear,
    birth_hour: profile.birthHour,
    birth_minute: profile.birthMinute,
    birth_period: profile.birthPeriod,
    birth_place: profile.birthPlace,
    knows_birth_time: profile.knowsBirthTime,
    relationship_status: profile.relationshipStatus,
    goals: profile.goals,
    color_preference: profile.colorPreference,
    element_preference: profile.elementPreference,
    zodiac_sign: profile.zodiacSign,
    sun_sign: profile.sunSign || null,
    moon_sign: profile.moonSign || null,
    ascendant_sign: profile.ascendantSign || null,
    palm_image: profile.palmImage || null,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  }, { onConflict: "id" });

  return profile;
}

// Get user profile from Supabase
export async function getUserProfile(): Promise<UserProfile | null> {
  const userId = generateUserId();
  
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      email: data.email,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      gender: data.gender,
      birthMonth: data.birth_month,
      birthDay: data.birth_day,
      birthYear: data.birth_year,
      birthHour: data.birth_hour,
      birthMinute: data.birth_minute,
      birthPeriod: data.birth_period,
      birthPlace: data.birth_place,
      knowsBirthTime: data.knows_birth_time,
      relationshipStatus: data.relationship_status,
      goals: data.goals || [],
      colorPreference: data.color_preference,
      elementPreference: data.element_preference,
      zodiacSign: data.zodiac_sign,
      sunSign: data.sun_sign,
      moonSign: data.moon_sign,
      ascendantSign: data.ascendant_sign,
      palmImageUrl: data.palm_image_url,
      palmImage: data.palm_image,
      palmReadingResult: data.palm_reading_result,
      palmReadingDate: data.palm_reading_date,
    };
  } catch (error) {
    console.error("Failed to get user profile:", error);
  }
  
  return null;
}

// Update user profile
export async function updateUserProfile(updates: Partial<UserProfile>): Promise<void> {
  const userId = generateUserId();

  // Convert camelCase keys to snake_case for Supabase
  const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.gender !== undefined) dbUpdates.gender = updates.gender;
  if (updates.birthMonth !== undefined) dbUpdates.birth_month = updates.birthMonth;
  if (updates.birthDay !== undefined) dbUpdates.birth_day = updates.birthDay;
  if (updates.birthYear !== undefined) dbUpdates.birth_year = updates.birthYear;
  if (updates.birthHour !== undefined) dbUpdates.birth_hour = updates.birthHour;
  if (updates.birthMinute !== undefined) dbUpdates.birth_minute = updates.birthMinute;
  if (updates.birthPeriod !== undefined) dbUpdates.birth_period = updates.birthPeriod;
  if (updates.birthPlace !== undefined) dbUpdates.birth_place = updates.birthPlace;
  if (updates.knowsBirthTime !== undefined) dbUpdates.knows_birth_time = updates.knowsBirthTime;
  if (updates.relationshipStatus !== undefined) dbUpdates.relationship_status = updates.relationshipStatus;
  if (updates.goals !== undefined) dbUpdates.goals = updates.goals;
  if (updates.colorPreference !== undefined) dbUpdates.color_preference = updates.colorPreference;
  if (updates.elementPreference !== undefined) dbUpdates.element_preference = updates.elementPreference;
  if (updates.zodiacSign !== undefined) dbUpdates.zodiac_sign = updates.zodiacSign;
  if (updates.sunSign !== undefined) dbUpdates.sun_sign = updates.sunSign;
  if (updates.moonSign !== undefined) dbUpdates.moon_sign = updates.moonSign;
  if (updates.ascendantSign !== undefined) dbUpdates.ascendant_sign = updates.ascendantSign;
  if (updates.palmImageUrl !== undefined) dbUpdates.palm_image_url = updates.palmImageUrl;
  if (updates.palmImage !== undefined) dbUpdates.palm_image = updates.palmImage;
  if (updates.palmReadingResult !== undefined) dbUpdates.palm_reading_result = updates.palmReadingResult;
  if (updates.palmReadingDate !== undefined) dbUpdates.palm_reading_date = updates.palmReadingDate;

  await supabase.from("user_profiles").update(dbUpdates).eq("id", userId);
}

// Save palm image and update profile
export async function savePalmImage(imageDataUrl: string): Promise<string> {
  const userId = generateUserId();
  
  try {
    // Convert data URL to blob
    const base64Data = imageDataUrl.split(",")[1];
    const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const filePath = `palm_images/${userId}_${Date.now()}.jpg`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("palm-images")
      .upload(filePath, byteArray, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("palm-images")
      .getPublicUrl(filePath);

    const downloadUrl = urlData.publicUrl;

    // Update user profile with palm image URL
    await supabase.from("user_profiles").update({
      palm_image_url: downloadUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);
    
    return downloadUrl;
  } catch (error) {
    console.error("Failed to save palm image:", error);
    throw error;
  }
}

// Save palm reading result
export async function savePalmReadingResult(result: any): Promise<void> {
  const userId = generateUserId();
  
  await supabase.from("user_profiles").update({
    palm_reading_result: result,
    palm_reading_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", userId);
}
