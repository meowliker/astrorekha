"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Settings, ChevronRight } from "lucide-react";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useUserStore } from "@/lib/user-store";
import { supabase } from "@/lib/supabase";
import { UserAvatar, getUserDisplayName } from "@/components/UserAvatar";

// Zodiac symbols mapping
const zodiacSymbols: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋",
  Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏",
  Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓"
};

// Element mapping
const zodiacElements: Record<string, string> = {
  Aries: "Fire", Taurus: "Earth", Gemini: "Air", Cancer: "Water",
  Leo: "Fire", Virgo: "Earth", Libra: "Air", Scorpio: "Water",
  Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water"
};

// Ruling planet mapping
const zodiacPlanets: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter"
};

// Polarity mapping
const zodiacPolarity: Record<string, string> = {
  Aries: "Masculine", Taurus: "Feminine", Gemini: "Masculine", Cancer: "Feminine",
  Leo: "Masculine", Virgo: "Feminine", Libra: "Masculine", Scorpio: "Feminine",
  Sagittarius: "Masculine", Capricorn: "Feminine", Aquarius: "Masculine", Pisces: "Feminine"
};

// Modality mapping
const zodiacModality: Record<string, string> = {
  Aries: "Cardinal", Taurus: "Fixed", Gemini: "Mutable", Cancer: "Cardinal",
  Leo: "Fixed", Virgo: "Mutable", Libra: "Cardinal", Scorpio: "Fixed",
  Sagittarius: "Mutable", Capricorn: "Cardinal", Aquarius: "Fixed", Pisces: "Mutable"
};

export default function ProfilePage() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<{
    birthMonth: string;
    birthDay: string;
    birthYear: string;
    birthHour: string;
    birthMinute: string;
    birthPeriod: string;
    knowsBirthTime: boolean;
    sunSign: string;
    moonSign: string;
    ascendantSign: string;
    name?: string;
    email?: string;
  } | null>(null);
  
  const { 
    birthMonth: storeBirthMonth, birthDay: storeBirthDay, birthYear: storeBirthYear, 
    birthHour: storeBirthHour, birthMinute: storeBirthMinute, birthPeriod: storeBirthPeriod,
    birthPlace: storeBirthPlace, knowsBirthTime: storeKnowsBirthTime,
  } = useOnboardingStore();
  
  const { purchasedBundle } = useUserStore();

  useEffect(() => {
    setIsClient(true);
    
    loadUserData();
  }, []);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const userId = localStorage.getItem("astrorekha_user_id");
      let dbUser: any = null;
      let profileData: any = null;
      if (userId) {
        const [userResult, profileResult] = await Promise.all([
          supabase.from("users").select("*").eq("id", userId).maybeSingle(),
          supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
        ]);
        dbUser = userResult.data;
        profileData = profileResult.data;
      }

      const hasSavedProfile = Boolean(dbUser || profileData);
      const month = String(profileData?.birth_month || dbUser?.birth_month || (hasSavedProfile ? "" : storeBirthMonth));
      const day = String(profileData?.birth_day || dbUser?.birth_day || (hasSavedProfile ? "" : storeBirthDay));
      const year = String(profileData?.birth_year || dbUser?.birth_year || (hasSavedProfile ? "" : storeBirthYear));
      const hour = String(profileData?.birth_hour || dbUser?.birth_hour || (hasSavedProfile ? "" : storeBirthHour));
      const minute = String(profileData?.birth_minute ?? dbUser?.birth_minute ?? (hasSavedProfile ? "" : storeBirthMinute));
      const period = String(profileData?.birth_period || dbUser?.birth_period || (hasSavedProfile ? "" : storeBirthPeriod));
      const place = String(profileData?.birth_place || dbUser?.birth_place || (hasSavedProfile ? "" : storeBirthPlace));
      const knowsBirthTime = profileData?.knows_birth_time ?? (hasSavedProfile ? Boolean(hour && period) : storeKnowsBirthTime);
      let sunSign = "Unavailable";
      let moonSign = knowsBirthTime ? "Unavailable" : "Birth time needed";
      let ascendantSign = knowsBirthTime ? "Unavailable" : "Birth time needed";

      if (month && day && year && place) {
        try {
          const response = await fetch("/api/astrology/signs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              birthMonth: month, birthDay: day, birthYear: year,
              birthHour: hour, birthMinute: minute, birthPeriod: period,
              birthPlace: place, knowsBirthTime,
            }),
          });
          const signs = await response.json();
          if (!response.ok || !signs.success || !signs.sunSign?.name) {
            throw new Error(signs.error || "Unable to calculate signs.");
          }
          sunSign = signs.sunSign.name;
          moonSign = signs.moonSign?.name || moonSign;
          ascendantSign = signs.ascendant?.name || ascendantSign;

          if (userId && hasSavedProfile) {
            const correctedSigns = {
              sun_sign: signs.sunSign.name,
              moon_sign: signs.moonSign?.name ?? null,
              ascendant_sign: signs.ascendant?.name ?? null,
            };
            const updates = [supabase.from("users").update(correctedSigns).eq("id", userId)];
            if (profileData) updates.push(supabase.from("user_profiles").update(correctedSigns).eq("id", userId));
            await Promise.all(updates);
          }
        } catch (signsError) {
          console.error("Error calculating Vedic profile signs:", signsError);
        }
      }

      setUserData({
        birthMonth: month, birthDay: day, birthYear: year,
        birthHour: hour, birthMinute: minute, birthPeriod: period, knowsBirthTime,
        sunSign, moonSign, ascendantSign,
        name: dbUser?.name || profileData?.name || undefined,
        email: dbUser?.email || profileData?.email || localStorage.getItem("astrorekha_email") || undefined,
      });
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const sunSign = userData?.sunSign || (isLoading ? "Loading..." : "Unavailable");
  const userMoonSign = userData?.moonSign || (isLoading ? "Loading..." : "Unavailable");
  const userAscendant = userData?.ascendantSign || (isLoading ? "Loading..." : "Unavailable");
  const birthMonth = userData?.birthMonth || storeBirthMonth;
  const birthDay = userData?.birthDay || storeBirthDay;
  const birthYear = userData?.birthYear || storeBirthYear;
  const birthHour = userData ? userData.birthHour : storeBirthHour;
  const birthMinute = userData ? userData.birthMinute : storeBirthMinute;
  const birthPeriod = userData ? userData.birthPeriod : storeBirthPeriod;

  // Format birth date and time
  const formatBirthDateTime = () => {
    if (!birthMonth || !birthDay || !birthYear) return "Not set";
    const months = ["January", "February", "March", "April", "May", "June", 
                    "July", "August", "September", "October", "November", "December"];
    if (!userData?.knowsBirthTime || !birthHour || !birthPeriod) return `${birthMonth} ${birthDay}, ${birthYear} • Birth time not provided`;
    const hour = birthHour;
    const minute = birthMinute || 0;
    const period = birthPeriod || "PM";
    // Handle month as number or name
    const monthIndex = isNaN(Number(birthMonth)) 
      ? months.findIndex(m => m.toLowerCase() === String(birthMonth).toLowerCase())
      : Number(birthMonth) - 1;
    const monthName = monthIndex >= 0 && monthIndex < 12 ? months[monthIndex] : birthMonth;
    return `${monthName} ${birthDay}, ${birthYear}•${hour}:${String(minute).padStart(2, '0')} ${period}`;
  };

  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md h-screen bg-[#0A0E1A]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col relative">
        {/* Starry background effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-0.5 bg-white/30 rounded-full"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                animation: `twinkle ${2 + Math.random() * 3}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="w-10 h-10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold">Profile</h1>
            <button
              onClick={() => router.push("/settings")}
              className="w-10 h-10 flex items-center justify-center"
            >
              <Settings className="w-5 h-5 text-white/70" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="px-4 py-4 space-y-6">
            {/* User Info Row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <UserAvatar name={userData?.name} email={userData?.email} size="lg" className="w-14 h-14 text-xl" />
                <div>
                  <h2 className="text-white text-lg font-semibold">{getUserDisplayName(userData?.name, userData?.email)}</h2>
                  <p className="text-white/50 text-sm">{formatBirthDateTime()}</p>
                </div>
              </div>
              <button
                onClick={() => router.push("/profile/edit")}
                className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
              >
                <span className="text-sm font-medium">Edit</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>

            {/* Sun Sign Display */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col items-center py-6"
            >
              <div className="relative">
                {/* Outer ring */}
                <div className="w-40 h-40 rounded-full border border-primary/30 flex items-center justify-center">
                  {/* Inner decorative circles */}
                  <div className="w-32 h-32 rounded-full border border-primary/20 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                      <span className="text-5xl text-primary">{zodiacSymbols[sunSign] || "✦"}</span>
                    </div>
                  </div>
                </div>
                {/* Decorative dots */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 rounded-full bg-primary/50"
                    style={{
                      top: `${50 - 45 * Math.cos((angle * Math.PI) / 180)}%`,
                      left: `${50 + 45 * Math.sin((angle * Math.PI) / 180)}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ))}
              </div>
              <p className="text-white text-lg font-medium mt-4">Vedic Sun sign - {sunSign}</p>
            </motion.div>

            {/* Zodiac Info Grid - Row 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-3 gap-3"
            >
              {/* Moon Sign */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1A1F2E] flex items-center justify-center border border-primary/20">
                  <span className="text-2xl text-primary">☽</span>
                </div>
                <p className="text-white/50 text-xs mt-2">Vedic Moon Sign</p>
                <p className="text-white font-medium text-sm">{userMoonSign}</p>
              </div>

              {/* Element */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1A1F2E] flex items-center justify-center border border-primary/20">
                  <span className="text-2xl text-primary">
                    {zodiacElements[sunSign] === "Fire" && "🔥"}
                    {zodiacElements[sunSign] === "Water" && "💧"}
                    {zodiacElements[sunSign] === "Earth" && "🌍"}
                    {zodiacElements[sunSign] === "Air" && "💨"}
                  </span>
                </div>
                <p className="text-white/50 text-xs mt-2">Element</p>
                <p className="text-white font-medium text-sm">{zodiacElements[sunSign] || "Unavailable"}</p>
              </div>

              {/* Ascendant */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1A1F2E] flex items-center justify-center border border-primary/20">
                  <span className="text-2xl text-primary">{zodiacSymbols[userAscendant] || "✦"}</span>
                </div>
                <p className="text-white/50 text-xs mt-2">Vedic Ascendant</p>
                <p className="text-white font-medium text-sm">{userAscendant}</p>
              </div>
            </motion.div>

            {/* Zodiac Info Grid - Row 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="grid grid-cols-3 gap-3"
            >
              {/* Planet */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1A1F2E] flex items-center justify-center border border-primary/20">
                  <span className="text-2xl text-primary">♃</span>
                </div>
                <p className="text-white/50 text-xs mt-2">Planet</p>
                <p className="text-white font-medium text-sm">{zodiacPlanets[sunSign] || "Unavailable"}</p>
              </div>

              {/* Polarity */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1A1F2E] flex items-center justify-center border border-primary/20">
                  <span className="text-2xl text-primary">♂</span>
                </div>
                <p className="text-white/50 text-xs mt-2">Polarity</p>
                <p className="text-white font-medium text-sm">{zodiacPolarity[sunSign] || "Unavailable"}</p>
              </div>

              {/* Modality */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1A1F2E] flex items-center justify-center border border-primary/20">
                  <span className="text-2xl text-primary">☍</span>
                </div>
                <p className="text-white/50 text-xs mt-2">Modality</p>
                <p className="text-white font-medium text-sm">{zodiacModality[sunSign] || "Unavailable"}</p>
              </div>
            </motion.div>
          </div>
        </div>

        <style jsx>{`
          @keyframes twinkle {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
