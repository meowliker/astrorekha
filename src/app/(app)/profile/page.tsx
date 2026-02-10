"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Settings, ChevronRight } from "lucide-react";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useUserStore } from "@/lib/user-store";
import { getZodiacSign, getZodiacSymbol, getZodiacColor } from "@/lib/astrology-api";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
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
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Pluto",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Uranus", Pisces: "Neptune"
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
    sunSign: string;
    moonSign: string;
    ascendantSign: string;
    name?: string;
    email?: string;
  } | null>(null);
  
  const { 
    birthMonth: storeBirthMonth, birthDay: storeBirthDay, birthYear: storeBirthYear, 
    birthHour: storeBirthHour, birthMinute: storeBirthMinute, birthPeriod: storeBirthPeriod,
    ascendantSign: storeAscendantSign, moonSign: storeMoonSign
  } = useOnboardingStore();
  
  const { subscriptionPlan } = useUserStore();

  useEffect(() => {
    setIsClient(true);
    
    // Wait for Firebase Auth to be ready before loading user data
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      loadUserData();
    });

    return () => unsubscribe();
  }, []);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const authUid = auth.currentUser?.uid;
      const storedId = localStorage.getItem("palmcosmic_user_id");
      const userId = authUid || storedId;

      if (userId) {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          const month = data.birthMonth ? String(data.birthMonth) : storeBirthMonth;
          const day = data.birthDay ? String(data.birthDay) : storeBirthDay;
          const year = data.birthYear ? String(data.birthYear) : storeBirthYear;
          const hour = data.birthHour || storeBirthHour || "12";
          const minute = data.birthMinute || storeBirthMinute || "00";
          const period = data.birthPeriod || storeBirthPeriod || "PM";
          const place = data.birthPlace || "";
          
          // Handle signs - they may be stored as objects with .name or as strings
          const extractSignName = (sign: any): string | null => {
            if (!sign) return null;
            if (typeof sign === "string") return sign;
            if (sign.name) return sign.name;
            return null;
          };

          let sunSignValue = extractSignName(data.sunSign);
          let moonSignValue = extractSignName(data.moonSign);
          let ascendantValue = extractSignName(data.ascendantSign);
          
          // If signs are missing from users/{userId}, check user_profiles/{userId}
          // (onboarding saves astro-engine signs there via saveUserProfile)
          if (!sunSignValue || !moonSignValue || !ascendantValue) {
            try {
              const profileRef = doc(db, "user_profiles", userId);
              const profileSnap = await getDoc(profileRef);
              if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                if (!sunSignValue) sunSignValue = extractSignName(profileData.sunSign);
                if (!moonSignValue) moonSignValue = extractSignName(profileData.moonSign);
                if (!ascendantValue) ascendantValue = extractSignName(profileData.ascendantSign);
                
                // Save signs back to users/{userId} for future reads
                if (sunSignValue || moonSignValue || ascendantValue) {
                  await setDoc(userRef, {
                    ...(sunSignValue ? { sunSign: profileData.sunSign } : {}),
                    ...(moonSignValue ? { moonSign: profileData.moonSign } : {}),
                    ...(ascendantValue ? { ascendantSign: profileData.ascendantSign } : {}),
                  }, { merge: true });
                }
              }
            } catch (profileError) {
              console.error("Error reading user_profiles:", profileError);
            }
          }
          
          // If signs are still missing, fetch from astro-engine API
          if (!sunSignValue || !moonSignValue || !ascendantValue) {
            try {
              const response = await fetch("/api/astrology/signs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  birthMonth: month,
                  birthDay: day,
                  birthYear: year,
                  birthHour: hour,
                  birthMinute: minute,
                  birthPeriod: period,
                  birthPlace: place,
                }),
              });
              const signsData = await response.json();
              if (signsData.success) {
                if (!sunSignValue) sunSignValue = extractSignName(signsData.sunSign);
                if (!moonSignValue) moonSignValue = extractSignName(signsData.moonSign);
                if (!ascendantValue) ascendantValue = extractSignName(signsData.ascendant);
                
                // Save signs to Firebase for future use
                await setDoc(userRef, {
                  sunSign: signsData.sunSign,
                  moonSign: signsData.moonSign,
                  ascendantSign: signsData.ascendant,
                }, { merge: true });
              }
            } catch (signsError) {
              console.error("Error fetching signs:", signsError);
              moonSignValue = moonSignValue || "Cancer";
              ascendantValue = ascendantValue || "Leo";
            }
          }

          // Get email from Firebase or localStorage
          const email = data.email || localStorage.getItem("palmcosmic_email") || undefined;
          
          // Final fallback: use Western tropical calculation only if astro-engine signs unavailable
          const fallbackSunSign = month && day ? getZodiacSign(Number(month), Number(day)) : "Aries";

          setUserData({
            birthMonth: month,
            birthDay: day,
            birthYear: year,
            birthHour: hour,
            birthMinute: minute,
            birthPeriod: period,
            sunSign: sunSignValue || fallbackSunSign,
            moonSign: moonSignValue || "Cancer",
            ascendantSign: ascendantValue || "Leo",
            name: data.name || undefined,
            email: email,
          });
          setIsLoading(false);
          return;
        }
      }

      // Fallback to onboarding store
      if (storeBirthMonth && storeBirthDay) {
        const storedEmail = localStorage.getItem("palmcosmic_email") || undefined;
        setUserData({
          birthMonth: storeBirthMonth,
          birthDay: storeBirthDay,
          birthYear: storeBirthYear,
          birthHour: storeBirthHour || "12",
          birthMinute: storeBirthMinute || "00",
          birthPeriod: storeBirthPeriod || "PM",
          sunSign: getZodiacSign(Number(storeBirthMonth), Number(storeBirthDay)),
          moonSign: storeMoonSign?.name || "Cancer",
          ascendantSign: storeAscendantSign?.name || "Leo",
          email: storedEmail,
        });
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const sunSign = userData?.sunSign || (isLoading ? "Loading..." : "Aries");
  const userMoonSign = userData?.moonSign || (isLoading ? "Loading..." : "Cancer");
  const userAscendant = userData?.ascendantSign || (isLoading ? "Loading..." : "Leo");
  const birthMonth = userData?.birthMonth || storeBirthMonth;
  const birthDay = userData?.birthDay || storeBirthDay;
  const birthYear = userData?.birthYear || storeBirthYear;
  const birthHour = userData?.birthHour || storeBirthHour || "12";
  const birthMinute = userData?.birthMinute || storeBirthMinute || "00";
  const birthPeriod = userData?.birthPeriod || storeBirthPeriod || "PM";

  // Format birth date and time
  const formatBirthDateTime = () => {
    if (!birthMonth || !birthDay || !birthYear) return "Not set";
    const months = ["January", "February", "March", "April", "May", "June", 
                    "July", "August", "September", "October", "November", "December"];
    const hour = birthHour || 12;
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
                      <span className="text-5xl text-primary">{zodiacSymbols[sunSign] || "♈"}</span>
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
              <p className="text-white text-lg font-medium mt-4">Sun sign - {sunSign}</p>
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
                <p className="text-white/50 text-xs mt-2">Moon Sign</p>
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
                <p className="text-white font-medium text-sm">{zodiacElements[sunSign] || "Fire"}</p>
              </div>

              {/* Ascendant */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1A1F2E] flex items-center justify-center border border-primary/20">
                  <span className="text-2xl text-primary">{zodiacSymbols[userAscendant] || "♌"}</span>
                </div>
                <p className="text-white/50 text-xs mt-2">Ascendant</p>
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
                <p className="text-white font-medium text-sm">{zodiacPlanets[sunSign] || "Jupiter"}</p>
              </div>

              {/* Polarity */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1A1F2E] flex items-center justify-center border border-primary/20">
                  <span className="text-2xl text-primary">♂</span>
                </div>
                <p className="text-white/50 text-xs mt-2">Polarity</p>
                <p className="text-white font-medium text-sm">{zodiacPolarity[sunSign] || "Masculine"}</p>
              </div>

              {/* Modality */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1A1F2E] flex items-center justify-center border border-primary/20">
                  <span className="text-2xl text-primary">☍</span>
                </div>
                <p className="text-white/50 text-xs mt-2">Modality</p>
                <p className="text-white font-medium text-sm">{zodiacModality[sunSign] || "Mutable"}</p>
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
