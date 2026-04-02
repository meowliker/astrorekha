import { anthropic } from "@/lib/anthropic";

type AnyRecord = Record<string, any>;

type ReportSections = {
  ascendant_nature: string;
  moon_emotional: string;
  life_predictions: string;
  career: string;
  relationships: string;
  wealth: string;
  health: string;
  current_dasha: string;
  strengths_challenges: string;
  guidance_remedies: string;
};

const SYSTEM_PROMPT = `You are an expert Vedic astrologer writing a personalized birth chart report. Use authentic Jyotish principles. Write in warm, flowing second-person prose. No bullet points. Reference specific chart placements in every paragraph. Each section should be 2-3 paragraphs unless specified otherwise.`;

const SIGN_LORD_BY_NAME: Record<string, string> = {
  aries: "Mars",
  mesha: "Mars",
  taurus: "Venus",
  vrishabha: "Venus",
  gemini: "Mercury",
  mithuna: "Mercury",
  cancer: "Moon",
  karka: "Moon",
  leo: "Sun",
  simha: "Sun",
  virgo: "Mercury",
  kanya: "Mercury",
  libra: "Venus",
  tula: "Venus",
  scorpio: "Mars",
  vrischika: "Mars",
  sagittarius: "Jupiter",
  dhanu: "Jupiter",
  capricorn: "Saturn",
  makara: "Saturn",
  aquarius: "Saturn",
  kumbha: "Saturn",
  pisces: "Jupiter",
  meena: "Jupiter",
};

function isObject(value: unknown): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pickPlanet(chartData: AnyRecord, planetName: string): AnyRecord {
  const lower = planetName.toLowerCase();
  const planets = isObject(chartData?.planets) ? chartData.planets : {};
  const kundliPlanets = isObject(chartData?.kundli?.planetary_positions)
    ? chartData.kundli.planetary_positions
    : {};

  const fromPlanets = planets[planetName] || planets[lower] || planets[planetName.toUpperCase()];
  const fromKundli = kundliPlanets[planetName] || kundliPlanets[lower] || kundliPlanets[planetName.toUpperCase()];
  const fromRoot = chartData[planetName] || chartData[lower] || chartData[`${lower}_position`] || chartData[`${lower}_sign`];

  if (isObject(fromPlanets)) return fromPlanets;
  if (isObject(fromKundli)) return fromKundli;
  if (isObject(fromRoot)) return fromRoot;

  const sign =
    (isObject(fromKundli) && (fromKundli.sign || fromKundli.rasi)) ||
    chartData[`${lower}_sign`] ||
    chartData[`${lower}Sign`] ||
    (typeof fromRoot === "string" ? fromRoot : "—");

  const house =
    (isObject(fromKundli) && (fromKundli.house || fromKundli.bhava)) ||
    chartData[`${lower}_house`] ||
    chartData[`${lower}House`] ||
    "—";

  return { sign: sign || "—", house: house || "—" };
}

function getHouseField(chartData: AnyRecord, key: string): string {
  const houses = isObject(chartData?.houses) ? chartData.houses : {};
  const houseLords = isObject(chartData?.house_lords) ? chartData.house_lords : {};
  const kundli = isObject(chartData?.kundli) ? chartData.kundli : {};

  return (
    chartData?.[key] ||
    houses?.[key] ||
    houseLords?.[key] ||
    kundli?.[key] ||
    "—"
  );
}

function getAnthropicText(response: any): string {
  const firstText = Array.isArray(response?.content)
    ? response.content.find((chunk: any) => chunk?.type === "text" && typeof chunk?.text === "string")
    : null;

  return firstText?.text?.trim() || "";
}

function getSignLord(sign: string): string {
  const key = String(sign || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]/g, "");
  return SIGN_LORD_BY_NAME[key] || "—";
}

function getAscendantFromPlanetPositions(chartData: AnyRecord): { lagna: string; lagnaLord: string } {
  const list = Array.isArray(chartData?.planet_positions) ? chartData.planet_positions : [];
  const ascendant = list.find((item: any) => String(item?.name || "").toLowerCase() === "ascendant");

  const lagna = ascendant?.rasi?.name || "";
  const lagnaLord = ascendant?.rasi?.lord?.name || getSignLord(lagna);

  return {
    lagna: lagna || "",
    lagnaLord: lagnaLord === "—" ? "" : lagnaLord,
  };
}

export async function generateBirthChartReport(
  chartData: Record<string, any>,
  userProfile: Record<string, any>,
  user: Record<string, any>
): Promise<{ sections: Record<string, string> }> {
  const mergedChart = isObject(chartData?.data) ? { ...chartData, ...chartData.data } : chartData;
  const ascendantFromPlanetPositions = getAscendantFromPlanetPositions(mergedChart);

  const name = userProfile?.name || userProfile?.full_name || "you";
  const lagna =
    ascendantFromPlanetPositions.lagna ||
    mergedChart?.planets?.Ascendant?.zodiac_sign ||
    mergedChart?.lagna ||
    mergedChart?.ascendant ||
    mergedChart?.chart?.ascendant?.sidereal?.sign ||
    mergedChart?.chart?.ascendant?.sign ||
    mergedChart?.chart?.big_three?.rising?.sign ||
    mergedChart?.kundli?.nakshatra_details?.zodiac?.name ||
    "—";
  const lagnaLord =
    mergedChart?.lagna_lord ||
    mergedChart?.ascendant_lord ||
    mergedChart?.planets?.Ascendant?.lord ||
    ascendantFromPlanetPositions.lagnaLord ||
    getSignLord(lagna) ||
    "—";
  const moonSign =
    mergedChart?.moon_sign ||
    mergedChart?.kundli?.nakshatra_details?.chandra_rasi?.name ||
    user?.zodiac_sign ||
    userProfile?.zodiac_sign ||
    "—";
  const moonNakshatra = mergedChart?.moon_nakshatra || mergedChart?.kundli?.nakshatra_details?.nakshatra?.name || "—";
  const moonPada = mergedChart?.moon_nakshatra_pada || mergedChart?.kundli?.nakshatra_details?.nakshatra?.pada || "—";
  const sunSign =
    mergedChart?.sun_sign ||
    mergedChart?.kundli?.nakshatra_details?.soorya_rasi?.name ||
    user?.sun_sign ||
    "—";
  const currentMahadasha =
    mergedChart?.current_mahadasha ||
    mergedChart?.mahadasha ||
    mergedChart?.dasha?.current_period?.mahadasha ||
    mergedChart?.dasha?.current_period?.label ||
    "—";
  const currentAntardasha =
    mergedChart?.current_antardasha ||
    mergedChart?.antardasha ||
    mergedChart?.dasha?.current_period?.antardasha ||
    "—";
  const mahadashaEnd =
    mergedChart?.mahadasha_end ||
    mergedChart?.dasha?.current_period?.end_date ||
    "—";
  const isManglik = mergedChart?.is_manglik ?? mergedChart?.manglik ?? mergedChart?.kundli?.mangal_dosha?.has_dosha ?? false;

  const sun = pickPlanet(mergedChart, "Sun");
  const moon = pickPlanet(mergedChart, "Moon");
  const mars = pickPlanet(mergedChart, "Mars");
  const mercury = pickPlanet(mergedChart, "Mercury");
  const jupiter = pickPlanet(mergedChart, "Jupiter");
  const venus = pickPlanet(mergedChart, "Venus");
  const saturn = pickPlanet(mergedChart, "Saturn");
  const rahu = pickPlanet(mergedChart, "Rahu");
  const ketu = pickPlanet(mergedChart, "Ketu");

  const secondLord = getHouseField(mergedChart, "second_lord");
  const sixthHouse = getHouseField(mergedChart, "sixth_house");
  const seventhHouse = getHouseField(mergedChart, "seventh_house");
  const seventhLord = getHouseField(mergedChart, "seventh_lord");
  const tenthHouse = getHouseField(mergedChart, "tenth_house");
  const tenthLord = getHouseField(mergedChart, "tenth_lord");
  const eleventhHouse = getHouseField(mergedChart, "eleventh_house");
  const eleventhLord = getHouseField(mergedChart, "eleventh_lord");

  const sections: ReportSections = {
    ascendant_nature: `
Write the "Your Ascendant & Core Nature" section.
The person's name is ${name}.
The person's Lagna (Ascendant) is ${lagna}.
The Lagna lord is ${lagnaLord}.
Sun is in ${sunSign}.
Write 3 paragraphs about their core personality, physical constitution,
and how others perceive them. Be specific to ${lagna} rising.
Address the person directly as "you".`,

    moon_emotional: `
Write the "Your Moon Sign & Emotional World" section.
Moon is in ${moonSign}, Nakshatra ${moonNakshatra} pada ${moonPada}.
Write 3 paragraphs about their emotional nature, instincts,
relationship with their mother, and inner world.
Be specific to ${moonSign} Moon in ${moonNakshatra} nakshatra.`,

    life_predictions: `
Write the "Life Predictions & Destiny" section.
Lagna: ${lagna}. Moon sign: ${moonSign}. Sun: ${sunSign}.
Key placements: ${currentMahadasha} Mahadasha currently running.
Write 3 paragraphs covering their overall life path, key themes of
their destiny, major life phases, and what the stars indicate about
their purpose in this lifetime. This is the most important section —
make it feel meaningful and personal.`,

    career: `
Write the "Career & Profession" section.
Lagna: ${lagna}. 10th house: ${tenthHouse}. 10th house lord: ${tenthLord}.
Mercury in ${mercury?.sign || "—"} house ${mercury?.house || "—"}.
Saturn in ${saturn?.sign || "—"} house ${saturn?.house || "—"}.
Current Mahadasha: ${currentMahadasha} / Antardasha: ${currentAntardasha}.
Write 3 paragraphs about ideal career fields, professional strengths,
timing of career growth, and current planetary influence on work.`,

    relationships: `
Write the "Love, Marriage & Relationships" section.
7th house: ${seventhHouse}. 7th house lord: ${seventhLord}.
Venus in ${venus?.sign || "—"} house ${venus?.house || "—"}.
Manglik status: ${isManglik ? "Manglik dosha present" : "No Manglik dosha"}.
Write 3 paragraphs about their approach to relationships, partner
qualities indicated, timing of marriage, and relationship dynamics.`,

    wealth: `
Write the "Wealth & Finance" section.
2nd house lord: ${secondLord}.
11th house: ${eleventhHouse}. 11th house lord: ${eleventhLord}.
Jupiter in ${jupiter?.sign || "—"} house ${jupiter?.house || "—"}.
Write 2 paragraphs about wealth potential, best income sources,
and financial tendencies indicated by this chart.`,

    health: `
Write the "Health & Vitality" section.
Lagna: ${lagna}. Lagna lord ${lagnaLord}.
6th house indicators: ${sixthHouse}.
Mars in ${mars?.sign || "—"} house ${mars?.house || "—"}.
Write 2 paragraphs about constitutional strengths, health areas to
watch, and how to maintain vitality based on this chart.
Be encouraging — not alarmist.`,

    current_dasha: `
Write the "Your Current Planetary Period" section.
Current Mahadasha: ${currentMahadasha} (ends ${mahadashaEnd}).
Current Antardasha: ${currentAntardasha}.
Write 3 paragraphs: first covering what this Mahadasha means for
this person overall, second covering how the Antardasha is coloring
right now specifically, third covering what to focus on and what
to be mindful of during this period.
This section should feel timely and immediately relevant.`,

    strengths_challenges: `
Write the "Strengths & Challenges" section.
Lagna: ${lagna}. Moon: ${moon?.sign || moonSign}. Sun: ${sun?.sign || sunSign}.
Strong planets in this chart to consider: Sun ${sun?.sign || "—"}, Moon ${moon?.sign || "—"}, Jupiter ${jupiter?.sign || "—"}, Saturn ${saturn?.sign || "—"}, Rahu ${rahu?.sign || "—"}, Ketu ${ketu?.sign || "—"}.
Write 2 paragraphs: first about their core astrological strengths
and natural gifts, second about the challenges this chart presents
and how to work with them constructively.`,

    guidance_remedies: `
Write the "Guidance & Remedies" section.
Lagna: ${lagna}. Current Mahadasha: ${currentMahadasha}.
Manglik: ${isManglik ? "true" : "false"}.
Write 2 paragraphs with practical Vedic guidance — suggest 2-3
specific remedies (mantra, gemstone, charitable act, or behavioral)
relevant to this specific chart. Explain briefly why each remedy
applies. Keep tone warm and practical, not superstitious.`,
  };

  const sectionEntries = Object.entries(sections);

  const results = await Promise.all(
    sectionEntries.map(async ([key, prompt]) => {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });

      const text = getAnthropicText(response) || "We could not generate this section right now.";
      return [key, text] as const;
    })
  );

  return { sections: Object.fromEntries(results) };
}
