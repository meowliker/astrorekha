import { signFromLongitude } from "@/lib/vedic-signs";

export const WESTERN_CHART_VERSION = "western_tropical_v1";
type Position = { total_longitude?: number; sign?: string; formatted?: string };
export type EngineChart = {
  birth_data?: Record<string, unknown>;
  planets?: Record<string, { tropical?: Position; house_western?: number; retrograde?: boolean }>;
  ascendant?: Position;
  houses?: Record<string, unknown>;
  aspects?: Array<{ planet1: string; planet2: string; aspect: string; orb: number }>;
};
function westernPlanetName(name: string) { return name === "Rahu" ? "North Node" : name === "Ketu" ? "South Node" : name; }
export function tropicalSign(position: Position | undefined): string | null {
  // Only engine tropical longitudes are accepted; never fall back to a sidereal label.
  return typeof position?.total_longitude === "number" ? signFromLongitude(position.total_longitude) : null;
}
export function getWesternSignsFromChart(chart: EngineChart | null | undefined) {
  const sun = tropicalSign(chart?.planets?.Sun?.tropical);
  const moon = tropicalSign(chart?.planets?.Moon?.tropical);
  const ascendant = tropicalSign(chart?.ascendant);
  return sun && moon && ascendant ? { sun, moon, ascendant } : null;
}
export function westernChart(chart: EngineChart, knowsTime: boolean) {
  const signs = getWesternSignsFromChart(chart);
  if (!signs) throw new Error("Complete tropical chart positions are unavailable");
  const planets = Object.fromEntries(Object.entries(chart.planets || {}).filter(([name]) => knowsTime || name !== "Moon").map(([name, planet]) => {
    const sign = tropicalSign(planet.tropical);
    if (!sign) throw new Error(`Tropical ${name} position unavailable`);
    return [westernPlanetName(name), {
      sign, zodiac_sign: sign, tropical: planet.tropical,
      house: knowsTime ? planet.house_western : null,
      house_western: knowsTime ? planet.house_western : null,
      retrograde: planet.retrograde,
    }];
  }));
  // Whitelist Western fields so sidereal/nakshatra/dasha values cannot leak into AI prompts.
  const birth = chart.birth_data || {};
  return {
    zodiacSystem: WESTERN_CHART_VERSION, chartType: "western", knowsBirthTime: knowsTime,
    sun_sign: signs.sun, moon_sign: knowsTime ? signs.moon : null,
    ascendant: knowsTime ? signs.ascendant : null,
    planets, houses: knowsTime ? chart.houses : {},
    aspects: knowsTime ? (chart.aspects || []).map(a => ({...a, planet1: westernPlanetName(a.planet1), planet2: westernPlanetName(a.planet2)})) : [],
    birthDetails: { date: String(birth.date || ""), time: knowsTime ? String(birth.time || "") : "Unknown",
      place: String(birth.place || ""), timezone: String(birth.timezone || ""),
      latitude: Number(birth.latitude), longitude: Number(birth.longitude), julianDay: Number(birth.julian_day) },
  };
}
export type WesternChart = ReturnType<typeof westernChart>;
export function westernChartDetails(data: WesternChart) {
  return {
    basic_details: Object.entries({ "Zodiac system": "Western / Tropical", "House system": data.knowsBirthTime ? "Placidus" : "Birth time needed",
      "Date of Birth": data.birthDetails.date, "Time of Birth": data.birthDetails.time,
      "Place of Birth": data.birthDetails.place, "Timezone": data.birthDetails.timezone }).map(([label,value]) => ({label,value})),
    astro_details: [{label:"Sun Sign",value:data.sun_sign}, {label:"Moon Sign",value:data.moon_sign || "Birth time needed"},
      {label:"Ascendant",value:data.ascendant || "Birth time needed"}],
    planetary_positions: Object.entries(data.planets).map(([planet,p]) => ({planet,sign:p.sign,house:p.house == null ? "—" : String(p.house),nakshatra:"—",pada:"—"})),
    planetary_columns: data.knowsBirthTime ? ["sign", "house"] : ["sign"],
    lagna_chart_svg: null, navamsa_chart_svg: null,
  };
}
