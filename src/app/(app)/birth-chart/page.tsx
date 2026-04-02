"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sun, Moon, RefreshCw, Star, AlertTriangle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReportCTA from "@/components/ReportCTA";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { supabase } from "@/lib/supabase";

const MONTH_MAP: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};
const MONTH_NAMES = Object.keys(MONTH_MAP);

function getMonthNumber(month: string): number {
  const trimmed = String(month || "").trim();
  const direct = MONTH_MAP[trimmed];
  if (direct) return direct;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) {
    return numeric;
  }

  return 1;
}

function getDisplayMonth(month: string): string {
  const monthNumber = getMonthNumber(month);
  return MONTH_NAMES[monthNumber - 1] || String(month || "January");
}

function hasRenderableChartData(data: any): boolean {
  if (!data) return false;

  const hasMainChart = typeof data.chart?.output === "string" && data.chart.output.trim().length > 0;
  const hasNavamsa = typeof data.navamsaChart?.output === "string" && data.navamsaChart.output.trim().length > 0;
  const hasKundli = !!data.kundli;

  return hasMainChart || hasNavamsa || hasKundli;
}

function getAscendantLagna(data: any): string {
  if (!data) return "";
  const fromPlanetPosition = Array.isArray(data?.planet_positions)
    ? data.planet_positions.find((p: any) => String(p?.name || "").toLowerCase() === "ascendant")?.rasi?.name
    : "";
  return (
    fromPlanetPosition ||
    data?.planets?.Ascendant?.zodiac_sign ||
    data?.kundli?.nakshatra_details?.zodiac?.name ||
    ""
  );
}

export default function BirthChartPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any>(null);
  const chartType = "vedic"; // Only Vedic charts supported
  const [error, setError] = useState<string | null>(null);
  const [showMissingDataForm, setShowMissingDataForm] = useState(false);
  const [userDataLoaded, setUserDataLoaded] = useState(false);
  
  // Local state for birth data (loaded from Supabase or onboarding store)
  const [birthMonth, setBirthMonthState] = useState<string>("");
  const [birthDay, setBirthDayState] = useState<string>("");
  const [birthYear, setBirthYearState] = useState<string>("");
  const [birthHour, setBirthHourState] = useState<string>("12");
  const [birthMinute, setBirthMinuteState] = useState<string>("00");
  const [birthPeriod, setBirthPeriodState] = useState<string>("PM");
  const [birthPlace, setBirthPlaceState] = useState<string>("");
  const [knowsBirthTime, setKnowsBirthTimeState] = useState<boolean>(true);
  
  const { 
    birthMonth: storeBirthMonth, birthDay: storeBirthDay, birthYear: storeBirthYear, 
    birthHour: storeBirthHour, birthMinute: storeBirthMinute, birthPeriod: storeBirthPeriod, 
    birthPlace: storeBirthPlace, knowsBirthTime: storeKnowsBirthTime,
    setBirthDate, setBirthTime, setBirthPlace
  } = useOnboardingStore();
  
  const isMissingRequiredData = !birthMonth || !birthDay || !birthYear;
  const ascendantLagna = getAscendantLagna(chartData);

  const getBirthDate = () => {
    const month = getMonthNumber(birthMonth);
    const day = parseInt(birthDay) || 1;
    const year = parseInt(birthYear) || 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getBirthTime = () => {
    if (!knowsBirthTime) return "12:00";
    let hour = parseInt(birthHour) || 12;
    const minute = birthMinute || "00";
    if (birthPeriod === "PM" && hour !== 12) hour += 12;
    if (birthPeriod === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  };

  const getUserChartId = () => {
    const birthDate = getBirthDate();
    const birthTime = getBirthTime();
    return `chart_${birthDate}_${birthTime}_${birthPlace || 'unknown'}`.replace(/[^a-zA-Z0-9_]/g, '_');
  };

  // Load user data from Supabase first, then fallback to onboarding store
  useEffect(() => {
    loadUserBirthData();
  }, []);

  const loadUserBirthData = async () => {
    try {
      const userId = localStorage.getItem("astrorekha_user_id");
      if (userId) {
        const { data: profileData } = await supabase
          .from("user_profiles")
          .select("birth_month, birth_day, birth_year, birth_hour, birth_minute, birth_period, birth_place, knows_birth_time")
          .eq("id", userId)
          .single();

        if (profileData && profileData.birth_month && profileData.birth_day && profileData.birth_year) {
          setBirthMonthState(String(profileData.birth_month));
          setBirthDayState(String(profileData.birth_day));
          setBirthYearState(String(profileData.birth_year));
          setBirthHourState(profileData.birth_hour || "12");
          setBirthMinuteState(profileData.birth_minute || "00");
          setBirthPeriodState(profileData.birth_period || "PM");
          setBirthPlaceState(profileData.birth_place || "");
          setKnowsBirthTimeState(profileData.knows_birth_time ?? true);
          setUserDataLoaded(true);
          return;
        }

        // Legacy fallback for environments where birth fields still exist in users
        const { data: dbUser } = await supabase
          .from("users")
          .select("birth_month, birth_day, birth_year, birth_hour, birth_minute, birth_period, birth_place")
          .eq("id", userId)
          .single();

        if (dbUser && dbUser.birth_month && dbUser.birth_day && dbUser.birth_year) {
          setBirthMonthState(String(dbUser.birth_month));
          setBirthDayState(String(dbUser.birth_day));
          setBirthYearState(String(dbUser.birth_year));
          setBirthHourState(dbUser.birth_hour || "12");
          setBirthMinuteState(dbUser.birth_minute || "00");
          setBirthPeriodState(dbUser.birth_period || "PM");
          setBirthPlaceState(dbUser.birth_place || "");
          setKnowsBirthTimeState(true);
          setUserDataLoaded(true);
          return;
        }
      }
      // Fallback to onboarding store
      setBirthMonthState(storeBirthMonth);
      setBirthDayState(storeBirthDay);
      setBirthYearState(storeBirthYear);
      setBirthHourState(storeBirthHour || "12");
      setBirthMinuteState(storeBirthMinute || "00");
      setBirthPeriodState(storeBirthPeriod || "PM");
      setBirthPlaceState(storeBirthPlace || "");
      setKnowsBirthTimeState(storeKnowsBirthTime);
      setUserDataLoaded(true);
    } catch (err) {
      console.error("Failed to load birth data:", err);
      // Fallback to onboarding store
      setBirthMonthState(storeBirthMonth);
      setBirthDayState(storeBirthDay);
      setBirthYearState(storeBirthYear);
      setUserDataLoaded(true);
    }
  };

  useEffect(() => {
    if (!userDataLoaded) return;
    if (isMissingRequiredData) {
      setShowMissingDataForm(true);
      setLoading(false);
      return;
    }
    loadOrGenerateChart();
  }, [userDataLoaded, isMissingRequiredData]);

  const loadOrGenerateChart = async () => {
    setLoading(true);
    setError(null);
    const cacheKey = `${getUserChartId()}_${chartType}`;

    try {
      const { data: cached } = await supabase.from("birth_charts").select("data").eq("id", cacheKey).single();
      const cachedData = cached?.data;
      const hasAscendantPlanetSource =
        Array.isArray(cachedData?.planet_positions) &&
        cachedData.planet_positions.some((p: any) => String(p?.name || "").toLowerCase() === "ascendant");

      if (cachedData && hasRenderableChartData(cachedData) && hasAscendantPlanetSource) {
        setChartData(cached.data);
        setLoading(false);
        return;
      }
      await generateChart(cacheKey);
    } catch (err) {
      console.error("Failed to load chart:", err);
      await generateChart(cacheKey);
    }
  };

  const generateChart = async (cacheKey: string) => {
    const birthDate = getBirthDate();
    const birthTime = getBirthTime();
    let latitude = 28.6139, longitude = 77.209, timezone = 5.5;

    if (birthPlace) {
      try {
        const geoResponse = await fetch("/api/astrology/geo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place_name: birthPlace }),
        });
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          if (geoData.success && geoData.data) {
            latitude = geoData.data.latitude;
            longitude = geoData.data.longitude;
            timezone = geoData.data.timezone;
          }
        }
      } catch (err) {
        console.error("Geo lookup failed:", err);
      }
    }

    try {
      const response = await fetch("/api/astrology/birth-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate, birthTime, latitude, longitude, timezone, chartType }),
      });

      const result = await response.json();
      
      if (!result.success) {
        setError(result.error || "Failed to generate chart. Please try again.");
        setLoading(false);
        return;
      }
      
      if (result.success && result.data) {
        if (!hasRenderableChartData(result.data)) {
          setError("Birth chart data is currently unavailable. Please try again in a few minutes.");
          setLoading(false);
          return;
        }

        const chartDataWithDetails = {
          ...result.data,
          userBirthDetails: { date: birthDate, time: birthTime, place: birthPlace || "Unknown", knowsTime: knowsBirthTime },
          cachedAt: new Date().toISOString(),
        };
        setChartData(chartDataWithDetails);
        try {
          await supabase.from("birth_charts").upsert({ id: cacheKey, data: chartDataWithDetails, cached_at: new Date().toISOString() }, { onConflict: "id" });
        } catch (cacheErr) {
          console.error("Failed to cache chart:", cacheErr);
        }
      }
    } catch (err) {
      console.error("Failed to generate chart:", err);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center gap-4 px-4 py-3">
            <button onClick={() => router.push("/reports")} className="w-10 h-10 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold flex-1 text-center pr-10">Your Birth Chart</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 space-y-4">
            {/* Missing Data Form */}
            {showMissingDataForm && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="bg-primary/10 border border-primary/30 rounded-2xl p-6 text-center">
                  <h2 className="text-white font-semibold text-lg mb-2">Birth Details Required</h2>
                  <p className="text-white/60 text-sm">To generate your personalized birth chart, we need your birth details.</p>
                </div>
                <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10 space-y-4">
                  <div>
                    <label className="text-white/60 text-sm block mb-2">Birth Date</label>
                    <div className="grid grid-cols-3 gap-2">
                      <select value={birthMonth} onChange={(e) => setBirthDate(e.target.value, birthDay, birthYear)} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm">
                        {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <select value={birthDay} onChange={(e) => setBirthDate(birthMonth, e.target.value, birthYear)} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm">
                        {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>{d}</option>)}
                      </select>
                      <select value={birthYear} onChange={(e) => setBirthDate(birthMonth, birthDay, e.target.value)} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm">
                        {Array.from({length: 100}, (_, i) => 2024 - i).map(y => <option key={y} value={String(y)}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-2">Birth Time</label>
                    <div className="grid grid-cols-3 gap-2">
                      <select value={birthHour} onChange={(e) => setBirthTime(e.target.value, birthMinute, birthPeriod as "AM" | "PM")} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm">
                        {Array.from({length: 12}, (_, i) => i + 1).map(h => <option key={h} value={String(h)}>{h}</option>)}
                      </select>
                      <select value={birthMinute} onChange={(e) => setBirthTime(birthHour, e.target.value, birthPeriod as "AM" | "PM")} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm">
                        {["00", "15", "30", "45"].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <select value={birthPeriod} onChange={(e) => setBirthTime(birthHour, birthMinute, e.target.value as "AM" | "PM")} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm">
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-2">Birth Place</label>
                    <input type="text" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} placeholder="City, Country" className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/40" />
                  </div>
                  <Button onClick={() => { setShowMissingDataForm(false); setLoading(true); loadOrGenerateChart(); }} className="w-full bg-gradient-to-r from-primary to-purple-600">
                    Generate My Birth Chart
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Loading State */}
            {loading && !showMissingDataForm && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <p className="text-white/60 text-center">Calculating your birth chart...</p>
              </motion.div>
            )}

            {/* Error State */}
            {!loading && error && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
                  <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                  <p className="text-red-400 mb-4">{error}</p>
                  <Button onClick={() => loadOrGenerateChart()} className="bg-gradient-to-r from-primary to-purple-600">
                    <RefreshCw className="w-4 h-4 mr-2" /> Try Again
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Chart Display - Only API-derived content */}
            {!loading && !error && !showMissingDataForm && chartData && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {/* Birth Details */}
                <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Birth Date:</span>
                    <span className="text-white">{getDisplayMonth(birthMonth)} {birthDay}, {birthYear}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-white/60">Birth Time:</span>
                    <span className="text-white">{knowsBirthTime ? `${birthHour}:${birthMinute} ${birthPeriod}` : "Unknown"}</span>
                  </div>
                  {birthPlace && (
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-white/60">Birth Place:</span>
                      <span className="text-white">{birthPlace}</span>
                    </div>
                  )}
                </div>

                {!hasRenderableChartData(chartData) && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center">
                    <p className="text-amber-200 text-sm mb-3">
                      Birth chart details are not available yet for these birth inputs.
                    </p>
                    <Button onClick={() => loadOrGenerateChart()} className="bg-gradient-to-r from-primary to-purple-600">
                      <RefreshCw className="w-4 h-4 mr-2" /> Regenerate Chart
                    </Button>
                  </div>
                )}

                {/* Rashi Chart (from API) */}
                {chartData.chart?.output && (
                  <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
                    {chartData.chart?.output ? (
                      <div className="w-full aspect-square bg-white rounded-xl overflow-hidden flex items-center justify-center [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: chartData.chart.output }} />
                    ) : (
                      <div className="w-full aspect-square bg-white/5 rounded-xl flex items-center justify-center">
                        <p className="text-white/40 text-sm">Chart not available</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Navamsa Chart (from API - Vedic only) */}
                {chartData.chartType === "vedic" && chartData.navamsaChart?.output && (
                  <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Moon className="w-5 h-5 text-blue-300" />
                      Navamsa Chart (D9)
                    </h3>
                    <div className="w-full aspect-square bg-white rounded-xl overflow-hidden flex items-center justify-center [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: chartData.navamsaChart.output }} />
                  </div>
                )}

                {/* Nakshatra Details (from API) */}
                {chartData.kundli?.nakshatra_details && (
                  <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Star className="w-5 h-5 text-yellow-400" />
                      Nakshatra Details
                    </h3>
                    <div className="space-y-3">
                      {chartData.kundli.nakshatra_details.nakshatra && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <p className="text-white/60 text-xs">Nakshatra</p>
                          <p className="text-white font-medium">{chartData.kundli.nakshatra_details.nakshatra.name}</p>
                          <p className="text-white/50 text-sm">Pada {chartData.kundli.nakshatra_details.nakshatra.pada} • Lord: {chartData.kundli.nakshatra_details.nakshatra.lord?.name}</p>
                        </div>
                      )}
                      {chartData.kundli.nakshatra_details.chandra_rasi && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <p className="text-white/60 text-xs">Moon Sign (Chandra Rasi)</p>
                          <p className="text-white font-medium">{chartData.kundli.nakshatra_details.chandra_rasi.name}</p>
                          <p className="text-white/50 text-sm">Lord: {chartData.kundli.nakshatra_details.chandra_rasi.lord?.name}</p>
                        </div>
                      )}
                      {chartData.kundli.nakshatra_details.soorya_rasi && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <p className="text-white/60 text-xs">Sun Sign (Soorya Rasi)</p>
                          <p className="text-white font-medium">{chartData.kundli.nakshatra_details.soorya_rasi.name}</p>
                          <p className="text-white/50 text-sm">Lord: {chartData.kundli.nakshatra_details.soorya_rasi.lord?.name}</p>
                        </div>
                      )}
                      {ascendantLagna && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <p className="text-white/60 text-xs">Ascendant (Lagna)</p>
                          <p className="text-white font-medium">{ascendantLagna}</p>
                        </div>
                      )}
                      {chartData.kundli.nakshatra_details.additional_info && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <p className="text-white/60 text-xs mb-2">Additional Info</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-white/50">Deity:</span> <span className="text-white">{chartData.kundli.nakshatra_details.additional_info.deity}</span></div>
                            <div><span className="text-white/50">Ganam:</span> <span className="text-white">{chartData.kundli.nakshatra_details.additional_info.ganam}</span></div>
                            <div><span className="text-white/50">Nadi:</span> <span className="text-white">{chartData.kundli.nakshatra_details.additional_info.nadi}</span></div>
                            <div><span className="text-white/50">Animal:</span> <span className="text-white">{chartData.kundli.nakshatra_details.additional_info.animal_sign}</span></div>
                            <div><span className="text-white/50">Color:</span> <span className="text-white">{chartData.kundli.nakshatra_details.additional_info.color}</span></div>
                            <div><span className="text-white/50">Stone:</span> <span className="text-white">{chartData.kundli.nakshatra_details.additional_info.birth_stone}</span></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Mangal Dosha (from API) */}
                {chartData.kundli?.mangal_dosha && (
                  <div className={`rounded-2xl p-4 border ${chartData.kundli.mangal_dosha.has_dosha ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                    <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                      <Heart className={`w-5 h-5 ${chartData.kundli.mangal_dosha.has_dosha ? 'text-red-400' : 'text-green-400'}`} />
                      Mangal Dosha
                    </h3>
                    <p className={`text-sm ${chartData.kundli.mangal_dosha.has_dosha ? 'text-red-300' : 'text-green-300'}`}>
                      {chartData.kundli.mangal_dosha.has_dosha ? 'Manglik' : 'Not Manglik'}
                    </p>
                    {chartData.kundli.mangal_dosha.description && (
                      <p className="text-white/60 text-sm mt-2">{chartData.kundli.mangal_dosha.description}</p>
                    )}
                  </div>
                )}

                {/* Yoga Details (from API) */}
                {chartData.kundli?.yoga_details && chartData.kundli.yoga_details.length > 0 && (
                  <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Star className="w-5 h-5 text-purple-400" />
                      Yogas in Your Chart
                    </h3>
                    <div className="space-y-2">
                      {chartData.kundli.yoga_details.map((yoga: any, idx: number) => (
                        <div key={idx} className="bg-white/5 rounded-xl p-3">
                          <p className="text-white font-medium">{yoga.name}</p>
                          <p className="text-white/50 text-sm">{yoga.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <ReportCTA />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
