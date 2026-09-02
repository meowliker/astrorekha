import { getBirthDateParts } from "@/lib/birth-details";
import { getZodiacSign } from "@/lib/astrology-api";

export interface PastLifeBirthData {
  day: number;
  month: number;
  year: number;
  time: string | null;
  place: string | null;
  sunSign: string | null;
  moonSign: string | null;
  ascendantSign: string | null;
  knowsBirthTime: boolean;
}

export interface PastLifePlanetSignal {
  planet: string;
  sign: string | null;
  house: string | null;
  nakshatra: string | null;
  pada: string | null;
  retrograde: boolean;
}

export interface PastLifeChartSignals {
  method: "vedic-ketu-chart" | "birth-date-symbolic";
  ketu: PastLifePlanetSignal | null;
  rahu: PastLifePlanetSignal | null;
  saturn: PastLifePlanetSignal | null;
  jupiter: PastLifePlanetSignal | null;
  moonNakshatra: string | null;
  twelfthHousePlanets: string[];
}

export interface PastLifeReport {
  archetype: string;
  archetypeTitle: string;
  pastLifeCount: number;
  era: string;
  region: string;
  soulTheme: string;
  karmicSnapshot: string;
  overview: string;
  identity: string;
  karmicGift: string;
  karmicWound: string;
  relationshipKarma: string;
  careerKarma: string;
  spiritualLesson: string;
  repeatingPatterns: string[];
  remedies: string[];
  affirmation: string;
  birthData: PastLifeBirthData;
  chartSignals?: PastLifeChartSignals;
  generatedAt: string;
}

interface PastLifeArchetype {
  archetype: string;
  title: string;
  soulTheme: string;
  karmicSnapshot: string;
  overview: string;
  gift: string;
  wound: string;
  relationship: string;
  career: string;
  lesson: string;
  patterns: string[];
  remedies: string[];
  affirmation: string;
}

const ARCHETYPES: PastLifeArchetype[] = [
  {
    archetype: "Healer",
    title: "The Village Healer",
    soulTheme: "Restoring what others had lost faith in",
    karmicSnapshot: "You may repeat cycles where you rescue first and ask what you need later.",
    overview:
      "Your strongest past-life imprint carries the energy of a healer, herbalist, helper, or quiet guide. You may have lived close to nature and used patience, touch, listening, or sacred knowledge to bring relief to others.",
    gift:
      "You brought forward a natural ability to sense pain beneath the surface and support people through emotional or spiritual recovery.",
    wound:
      "The old wound is over-responsibility. You may still feel that love means carrying everyone, even when your own energy is asking for rest.",
    relationship:
      "In relationships, you may attract people who need saving. Your karmic lesson is to love deeply without becoming the only source of someone else's stability.",
    career:
      "Career energy favors healing, mentoring, wellness, education, people care, counseling, beauty, medicine, nature, and any role where improvement is visible.",
    lesson:
      "This lifetime asks you to keep the healer's gift while releasing the healer's burden.",
    patterns: [
      "Feeling responsible for people's emotions before they ask for help.",
      "Choosing peace so quickly that your own needs become quiet.",
      "A strong pull toward spiritual tools, herbs, nature, or emotional guidance.",
    ],
    remedies: [
      "Set one clear boundary before offering help.",
      "Spend time near plants, water, or open air when your mind feels heavy.",
      "Repeat: I can support others without absorbing their path.",
    ],
    affirmation: "My care is powerful, and my boundaries keep it sacred.",
  },
  {
    archetype: "Scholar",
    title: "The Temple Scholar",
    soulTheme: "Protecting wisdom through discipline",
    karmicSnapshot: "You may turn uncertainty into analysis, delaying emotional trust until everything feels provable.",
    overview:
      "Your past-life memory points to a scholar, scribe, teacher, priestly student, or keeper of sacred systems. Knowledge was not casual for you; it was a duty, a refuge, and a way to serve.",
    gift:
      "You carried forward a sharp mind, pattern recognition, and the ability to explain hidden truths in a practical way.",
    wound:
      "The karmic wound is perfectionism. Somewhere in the soul, you still fear being wrong, unprepared, or judged for speaking too soon.",
    relationship:
      "You may need mental respect before emotional trust opens. Your lesson is to let love be felt, not only understood.",
    career:
      "Career energy favors analysis, writing, teaching, strategy, astrology, research, operations, finance, technology, or advisory roles.",
    lesson:
      "This lifetime asks you to turn knowledge into lived wisdom, not pressure.",
    patterns: [
      "Overthinking emotional decisions.",
      "Feeling safest when you can name, classify, or plan everything.",
      "A private attraction toward ancient systems, symbols, texts, or hidden laws.",
    ],
    remedies: [
      "Write your worry down, then choose one grounded action.",
      "Practice sharing an unfinished idea with someone safe.",
      "Study something spiritual for joy, not only mastery.",
    ],
    affirmation: "My wisdom is allowed to be human, warm, and alive.",
  },
  {
    archetype: "Protector",
    title: "The Guardian of the Threshold",
    soulTheme: "Defending people, land, or vows",
    karmicSnapshot: "You may carry responsibility early, staying guarded even when the present is asking you to soften.",
    overview:
      "Your strongest imprint resembles a guardian, soldier, watchkeeper, ruler's aide, or protector of a community. You learned loyalty early and may have carried responsibility before you were ready.",
    gift:
      "You brought courage, endurance, and the instinct to act when others freeze.",
    wound:
      "The wound is hyper-vigilance. Your system may still scan for betrayal, danger, or collapse even when the present moment is safe.",
    relationship:
      "In love, loyalty matters deeply. You may test people quietly before trusting them, and you need consistency more than dramatic romance.",
    career:
      "Career energy favors leadership, operations, law, security, entrepreneurship, logistics, fitness, management, or any role that rewards steadiness under pressure.",
    lesson:
      "This lifetime asks you to protect your peace as strongly as you protect other people.",
    patterns: [
      "Feeling calm in crisis but restless in stillness.",
      "Taking charge before anyone asks.",
      "Finding it hard to depend on others, even when support is available.",
    ],
    remedies: [
      "Relax your body before making a serious decision.",
      "Let someone reliable handle one responsibility each week.",
      "Choose calm consistency over emotional testing.",
    ],
    affirmation: "I am safe to be strong without staying on guard.",
  },
  {
    archetype: "Artist",
    title: "The Court Artist",
    soulTheme: "Turning feeling into beauty",
    karmicSnapshot: "You may translate intense feelings into beauty while hesitating to be fully seen.",
    overview:
      "Your past-life imprint carries the mark of a performer, painter, musician, poet, craftsperson, or storyteller. You may have used beauty to move people, preserve memory, or survive difficult times.",
    gift:
      "You brought magnetism, creative timing, emotional color, and a gift for making people feel something quickly.",
    wound:
      "The wound is visibility fear. You may crave expression but hesitate when attention, criticism, or comparison appears.",
    relationship:
      "In relationships, you need warmth, play, appreciation, and freedom. Feeling unseen can make your heart close faster than conflict itself.",
    career:
      "Career energy favors content, design, performance, marketing, beauty, teaching, social media, hospitality, healing arts, or creative business.",
    lesson:
      "This lifetime asks you to create from devotion, not from the need to be approved.",
    patterns: [
      "Strong emotional reactions to music, beauty, old places, or art.",
      "Hiding your talent until it feels perfect.",
      "Attracting attention but not always trusting it.",
    ],
    remedies: [
      "Make one small thing daily without judging its worth.",
      "Let your style be specific instead of universally liked.",
      "Share before perfection turns into delay.",
    ],
    affirmation: "My expression is worthy before it is perfect.",
  },
  {
    archetype: "Wanderer",
    title: "The Sacred Wanderer",
    soulTheme: "Learning through movement, exile, and discovery",
    karmicSnapshot: "You may seek freedom when life becomes still, even when your soul is ready to belong.",
    overview:
      "Your past-life pattern points to a traveler, messenger, pilgrim, trader, monk, or seeker who crossed borders physically or spiritually. Home may have been more of a feeling than a fixed place.",
    gift:
      "You brought adaptability, instinct, language with strangers, and the ability to find meaning in unfamiliar situations.",
    wound:
      "The wound is rootlessness. You may leave emotionally before life has a chance to become steady.",
    relationship:
      "You need space inside love. The karmic lesson is to choose bonds that feel expansive rather than bonds you must escape.",
    career:
      "Career energy favors travel, communication, sales, teaching, consulting, research, media, spirituality, global work, or independent paths.",
    lesson:
      "This lifetime asks you to build a home inside yourself, then choose where to grow from there.",
    patterns: [
      "Feeling restless when life becomes too predictable.",
      "A strong pull toward foreign cultures, pilgrimage, maps, or distant places.",
      "Leaving plans open because fixed commitments feel heavy.",
    ],
    remedies: [
      "Create one grounding ritual you can carry anywhere.",
      "Choose commitments that include freedom instead of avoiding commitment.",
      "Spend time walking when your thoughts feel trapped.",
    ],
    affirmation: "I can belong without losing my freedom.",
  },
  {
    archetype: "Mystic",
    title: "The Hidden Mystic",
    soulTheme: "Seeing what others could not name",
    karmicSnapshot: "You may sense hidden truths quickly, then retreat when others cannot meet that depth.",
    overview:
      "Your past-life imprint suggests a mystic, oracle, dream reader, astrologer, monk, tantric practitioner, or keeper of hidden knowledge. You may have lived partly outside ordinary society.",
    gift:
      "You brought intuition, symbolic sight, dream sensitivity, and the ability to understand emotional undercurrents quickly.",
    wound:
      "The wound is isolation. Your soul may remember being misunderstood, feared, or separated because of what you sensed.",
    relationship:
      "You crave depth and truth. Surface-level bonds drain you, but intense bonds can also awaken old fears of being exposed.",
    career:
      "Career energy favors astrology, psychology, research, healing, strategy, design, investigation, writing, spirituality, and transformational work.",
    lesson:
      "This lifetime asks you to trust your intuition while staying grounded in the present.",
    patterns: [
      "Knowing things before you can explain how you know.",
      "Feeling emotionally overloaded in crowded or chaotic spaces.",
      "A private attraction toward occult, spiritual, or symbolic systems.",
    ],
    remedies: [
      "Check intuitive impressions against calm evidence.",
      "Keep a dream or symbol journal.",
      "Protect solitude without disappearing from people who love you.",
    ],
    affirmation: "My intuition is clear, grounded, and safe to use.",
  },
];

const ERAS = [
  "ancient temple period",
  "medieval trade age",
  "early village civilization",
  "royal court era",
  "forest hermitage period",
  "pilgrim route age",
  "coastal settlement era",
];

const REGIONS = [
  "near a river settlement",
  "in a mountain community",
  "around a temple town",
  "close to old trade routes",
  "near forests and healing herbs",
  "beside a coastal marketplace",
  "within a protected royal city",
];

const SIGN_ARCHETYPES: Record<string, string> = {
  Aries: "Protector",
  Taurus: "Artist",
  Gemini: "Scholar",
  Cancer: "Healer",
  Leo: "Artist",
  Virgo: "Scholar",
  Libra: "Artist",
  Scorpio: "Mystic",
  Sagittarius: "Wanderer",
  Capricorn: "Protector",
  Aquarius: "Scholar",
  Pisces: "Mystic",
};

const HOUSE_ARCHETYPES: Record<string, string> = {
  "1": "Protector",
  "2": "Artist",
  "3": "Scholar",
  "4": "Healer",
  "5": "Artist",
  "6": "Healer",
  "7": "Artist",
  "8": "Mystic",
  "9": "Wanderer",
  "10": "Protector",
  "11": "Scholar",
  "12": "Mystic",
};

const HOUSE_STORIES: Record<string, string> = {
  "1": "a life centered on identity, survival, self-command, and the courage to stand apart",
  "2": "a life centered on family, food, craft, wealth, speech, and protecting what was valuable",
  "3": "a life centered on messages, siblings, writing, trade, performance, and quick decisions",
  "4": "a life centered on home, land, ancestry, caretaking, and emotional memory",
  "5": "a life centered on art, children, teaching, creativity, romance, and recognition",
  "6": "a life centered on service, healing, labor, debt, conflict resolution, and daily discipline",
  "7": "a life centered on partnership, contracts, diplomacy, devotion, and social mirror-work",
  "8": "a life centered on secrecy, crisis, occult knowledge, inheritance, and deep transformation",
  "9": "a life centered on pilgrimage, teachers, scripture, foreign places, and moral law",
  "10": "a life centered on duty, authority, status, public work, and responsibility",
  "11": "a life centered on community, allies, social causes, networks, and shared ambitions",
  "12": "a life centered on solitude, retreat, sacrifice, hidden service, dreams, and spiritual release",
};

const SIGN_ERAS: Record<string, string> = {
  Aries: "warrior frontier age",
  Taurus: "artisan settlement era",
  Gemini: "merchant road age",
  Cancer: "ancestral village period",
  Leo: "royal court era",
  Virgo: "temple service period",
  Libra: "diplomatic court age",
  Scorpio: "hidden mystery school period",
  Sagittarius: "pilgrim route age",
  Capricorn: "fortified kingdom age",
  Aquarius: "reform council era",
  Pisces: "monastic retreat period",
};

const SIGN_REGIONS: Record<string, string> = {
  Aries: "near drylands, forts, or disputed borders",
  Taurus: "near fields, markets, music halls, or craft houses",
  Gemini: "close to old trade routes and learning streets",
  Cancer: "near water, family compounds, or ancestral land",
  Leo: "within a protected royal city or performance court",
  Virgo: "around a temple town, clinic, archive, or service guild",
  Libra: "inside a courtly, artistic, or diplomatic settlement",
  Scorpio: "near caves, wells, forests, or secret ritual spaces",
  Sagittarius: "along pilgrimage roads or foreign learning centers",
  Capricorn: "near mountains, offices of duty, or old stone cities",
  Aquarius: "inside a reform-minded community or knowledge circle",
  Pisces: "near monasteries, rivers, oceans, or dreamlike retreats",
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function reduceToSingleDigit(value: number): number {
  let total = Math.abs(Math.trunc(value));
  while (total > 9) {
    total = String(total)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
  }
  return total || 1;
}

function calculatePastLifeCount(birthData: PastLifeBirthData): number {
  const digitSum = `${birthData.day}${birthData.month}${birthData.year}`
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);
  return reduceToSingleDigit(digitSum);
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeZodiacSign(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const compact = text.toLowerCase().replace(/[^a-z]/g, "");
  const vedicSignMap: Record<string, string> = {
    mesha: "Aries",
    vrishabha: "Taurus",
    rishabha: "Taurus",
    mithuna: "Gemini",
    karka: "Cancer",
    karkataka: "Cancer",
    simha: "Leo",
    kanya: "Virgo",
    tula: "Libra",
    vrischika: "Scorpio",
    vrishchika: "Scorpio",
    dhanu: "Sagittarius",
    dhanus: "Sagittarius",
    makara: "Capricorn",
    kumbha: "Aquarius",
    meena: "Pisces",
  };
  if (vedicSignMap[compact]) return vedicSignMap[compact];
  const signs = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
  ];
  return signs.find((sign) => sign.toLowerCase() === compact) || text;
}

function getNestedText(source: Record<string, any> | null | undefined, paths: string[][]): string | null {
  if (!source) return null;
  for (const path of paths) {
    let current: any = source;
    for (const key of path) {
      current = current?.[key];
      if (current === null || current === undefined) break;
    }
    const text = cleanText(current);
    if (text) return text;
  }
  return null;
}

function flattenChartData(chartData: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!chartData) return null;
  return chartData.data && typeof chartData.data === "object"
    ? { ...chartData, ...chartData.data }
    : chartData;
}

function extractPlanetSignal(chartData: Record<string, any> | null | undefined, planetName: string): PastLifePlanetSignal | null {
  const chart = flattenChartData(chartData);
  if (!chart) return null;

  const lower = planetName.toLowerCase();
  const positions = Array.isArray(chart.planet_positions)
    ? chart.planet_positions
    : Array.isArray(chart.kundli?.planet_position)
      ? chart.kundli.planet_position
      : [];
  const fromPositions = positions.find((planet: any) => String(planet?.name || "").toLowerCase() === lower);
  const planets = chart.planets && typeof chart.planets === "object" ? chart.planets : {};
  const fromPlanets = planets[planetName] || planets[lower] || planets[planetName.toUpperCase()];
  const raw = fromPositions || fromPlanets;
  if (!raw) return null;

  const sign = normalizeZodiacSign(
    getNestedText(raw, [
      ["rasi", "name"],
      ["zodiac", "name"],
      ["zodiac_sign"],
      ["sign"],
      ["sidereal", "sign"],
    ])
  );
  const house = getNestedText(raw, [
    ["house"],
    ["house_number"],
    ["position"],
    ["bhava"],
  ]);
  const nakshatra = getNestedText(raw, [
    ["nakshatra", "name"],
    ["nakshatra_name"],
    ["vedic", "nakshatra"],
  ]);
  const pada = getNestedText(raw, [
    ["nakshatra", "pada"],
    ["pada"],
    ["vedic", "pada"],
  ]);

  return {
    planet: planetName,
    sign,
    house,
    nakshatra,
    pada,
    retrograde: !!(raw.is_retrograde || raw.retrograde || raw.isRetrograde),
  };
}

function extractTwelfthHousePlanets(chartData: Record<string, any> | null | undefined): string[] {
  const chart = flattenChartData(chartData);
  const positions = Array.isArray(chart?.planet_positions) ? chart.planet_positions : [];
  return positions
    .filter((planet: any) => String(planet?.house || planet?.house_number || planet?.position || "") === "12")
    .map((planet: any) => cleanText(planet?.name))
    .filter((name): name is string => !!name && name !== "Ascendant")
    .slice(0, 4);
}

function extractMoonNakshatra(chartData: Record<string, any> | null | undefined): string | null {
  const chart = flattenChartData(chartData);
  return getNestedText(chart, [
    ["kundli", "nakshatra_details", "nakshatra", "name"],
    ["planets", "Nakshatra", "name"],
    ["moon_nakshatra"],
  ]);
}

function buildChartSignals(chartData: Record<string, any> | null | undefined): PastLifeChartSignals {
  const ketu = extractPlanetSignal(chartData, "Ketu");
  return {
    method: ketu ? "vedic-ketu-chart" : "birth-date-symbolic",
    ketu,
    rahu: extractPlanetSignal(chartData, "Rahu"),
    saturn: extractPlanetSignal(chartData, "Saturn"),
    jupiter: extractPlanetSignal(chartData, "Jupiter"),
    moonNakshatra: extractMoonNakshatra(chartData),
    twelfthHousePlanets: extractTwelfthHousePlanets(chartData),
  };
}

function pickArchetypeFromSignals(signals: PastLifeChartSignals, seed: number): PastLifeArchetype {
  const archetypeName =
    (signals.ketu?.sign && SIGN_ARCHETYPES[signals.ketu.sign]) ||
    (signals.ketu?.house && HOUSE_ARCHETYPES[signals.ketu.house]) ||
    ARCHETYPES[seed % ARCHETYPES.length].archetype;
  return ARCHETYPES.find((item) => item.archetype === archetypeName) || ARCHETYPES[seed % ARCHETYPES.length];
}

function cleanSign(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.name) return String(parsed.name);
    } catch {}
    return trimmed;
  }
  if (typeof value === "object" && value && "name" in value) {
    return String((value as { name?: unknown }).name || "") || null;
  }
  return null;
}

function buildBirthData(userProfile: Record<string, any> | null, user: Record<string, any> | null): PastLifeBirthData | null {
  const dateParts = getBirthDateParts({
    birthMonth: userProfile?.birth_month || user?.birth_month,
    birthDay: userProfile?.birth_day || user?.birth_day,
    birthYear: userProfile?.birth_year || user?.birth_year,
  });
  if (!dateParts) return null;

  const knowsBirthTime =
    userProfile?.knows_birth_time !== undefined
      ? !!userProfile.knows_birth_time
      : true;
  const time = knowsBirthTime
    ? getPastLifeBirthTime24({
        birthHour: userProfile?.birth_hour || user?.birth_hour,
        birthMinute: userProfile?.birth_minute || user?.birth_minute,
        birthPeriod: userProfile?.birth_period || user?.birth_period,
      })
    : null;

  const sunSign =
    cleanSign(userProfile?.sun_sign) ||
    cleanSign(user?.sun_sign) ||
    getZodiacSign(dateParts.month, dateParts.day);

  return {
    day: dateParts.day,
    month: dateParts.month,
    year: dateParts.year,
    time,
    place: String(userProfile?.birth_place || user?.birth_place || "").trim() || null,
    sunSign,
    moonSign: cleanSign(userProfile?.moon_sign) || cleanSign(user?.moon_sign),
    ascendantSign: cleanSign(userProfile?.ascendant_sign) || cleanSign(user?.ascendant_sign),
    knowsBirthTime,
  };
}

function getPastLifeBirthTime24(input: { birthHour?: unknown; birthMinute?: unknown; birthPeriod?: unknown }): string | null {
  const hour = Number(String(input.birthHour || "").trim());
  const minute = Number(String(input.birthMinute || "0").trim());
  const period = String(input.birthPeriod || "").trim().toUpperCase();

  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (period !== "AM" && period !== "PM") return null;

  let normalizedHour = hour;
  if (period === "PM" && normalizedHour !== 12) normalizedHour += 12;
  if (period === "AM" && normalizedHour === 12) normalizedHour = 0;

  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function getPastLifeBirthData(userProfile: Record<string, any> | null, user: Record<string, any> | null) {
  return buildBirthData(userProfile, user);
}

export function buildPastLifeReport(params: {
  userId: string;
  name?: string | null;
  email?: string | null;
  userProfile?: Record<string, any> | null;
  user?: Record<string, any> | null;
  chartData?: Record<string, any> | null;
  generatedAt?: string;
}): PastLifeReport | null {
  const birthData = buildBirthData(params.userProfile || null, params.user || null);
  if (!birthData) return null;

  const seedSource = [
    params.userId,
    params.name || params.user?.name || "",
    params.email || params.user?.email || "",
    birthData.day,
    birthData.month,
    birthData.year,
    birthData.time || "",
    birthData.place || "",
    birthData.sunSign || "",
    birthData.moonSign || "",
    birthData.ascendantSign || "",
  ].join("|");
  const seed = hashString(seedSource);
  const chartSignals = buildChartSignals(params.chartData || null);
  const archetype = pickArchetypeFromSignals(chartSignals, seed);
  const count = calculatePastLifeCount(birthData);
  const era = (chartSignals.ketu?.sign && SIGN_ERAS[chartSignals.ketu.sign]) || ERAS[(seed >>> 6) % ERAS.length];
  const region = (chartSignals.ketu?.sign && SIGN_REGIONS[chartSignals.ketu.sign]) || REGIONS[(seed >>> 9) % REGIONS.length];
  const ketuPlacement =
    chartSignals.ketu?.sign || chartSignals.ketu?.house
      ? `Ketu in ${[chartSignals.ketu.sign, chartSignals.ketu.house ? `house ${chartSignals.ketu.house}` : null].filter(Boolean).join(", ")}`
      : null;
  const rahuPlacement =
    chartSignals.rahu?.sign || chartSignals.rahu?.house
      ? `Rahu in ${[chartSignals.rahu.sign, chartSignals.rahu.house ? `house ${chartSignals.rahu.house}` : null].filter(Boolean).join(", ")}`
      : null;
  const saturnPlacement =
    chartSignals.saturn?.sign || chartSignals.saturn?.house
      ? `Saturn in ${[chartSignals.saturn.sign, chartSignals.saturn.house ? `house ${chartSignals.saturn.house}` : null].filter(Boolean).join(", ")}`
      : null;
  const jupiterPlacement =
    chartSignals.jupiter?.sign || chartSignals.jupiter?.house
      ? `Jupiter in ${[chartSignals.jupiter.sign, chartSignals.jupiter.house ? `house ${chartSignals.jupiter.house}` : null].filter(Boolean).join(", ")}`
      : null;
  const ketuHouseStory = chartSignals.ketu?.house ? HOUSE_STORIES[chartSignals.ketu.house] : null;
  const chartContext = ketuPlacement
    ? `${ketuPlacement} is used as the main past-life indicator in this Vedic reading. ${
        ketuHouseStory ? `It points toward ${ketuHouseStory}.` : ""
      }`
    : "";
  const hiddenKarmaContext = chartSignals.twelfthHousePlanets.length
    ? `The 12th-house signal adds hidden karma through ${chartSignals.twelfthHousePlanets.join(", ")}.`
    : "";
  const nakshatraContext = chartSignals.moonNakshatra
    ? `Your Moon nakshatra, ${chartSignals.moonNakshatra}, adds the emotional memory tone.`
    : "";
  const signPhrase = birthData.sunSign ? `Your ${birthData.sunSign} solar imprint adds a present-life tone of identity and willpower to this older pattern.` : "";
  const moonPhrase = birthData.moonSign ? `Your ${birthData.moonSign} moon influence shows how this memory may still move through emotion and instinct.` : "";
  const ascPhrase = birthData.ascendantSign ? `Your ${birthData.ascendantSign} ascendant colors how others first notice this karmic signature in you.` : "";
  const context = [chartContext, hiddenKarmaContext, nakshatraContext, signPhrase, moonPhrase, ascPhrase].filter(Boolean).join(" ");
  const giftText = jupiterPlacement
    ? `${archetype.gift} ${jupiterPlacement} is read as the carried blessing: the quality you have already earned through prior effort.`
    : archetype.gift;
  const woundText = saturnPlacement
    ? `${archetype.wound} ${saturnPlacement} marks the unfinished lesson that asks for patience, accountability, and maturity now.`
    : archetype.wound;
  const lessonText = rahuPlacement
    ? `${archetype.lesson} ${rahuPlacement} shows the unfamiliar direction your current life is asking you to grow into.`
    : archetype.lesson;

  return {
    archetype: archetype.archetype,
    archetypeTitle: archetype.title,
    pastLifeCount: count,
    era,
    region,
    soulTheme: archetype.soulTheme,
    karmicSnapshot: archetype.karmicSnapshot,
    overview: context ? `${archetype.overview} ${context}` : archetype.overview,
    identity:
      `${ketuPlacement ? `Based on ${ketuPlacement}, y` : "Y"}our dominant past-life archetype points to ${archetype.title.toLowerCase()} during the ${era}, ${region}. The details appear less as a fixed historical claim and more as a symbolic soul pattern that explains what your current life keeps repeating.`,
    karmicGift: giftText,
    karmicWound: woundText,
    relationshipKarma: archetype.relationship,
    careerKarma: archetype.career,
    spiritualLesson: lessonText,
    repeatingPatterns: archetype.patterns,
    remedies: archetype.remedies,
    affirmation: archetype.affirmation,
    birthData,
    chartSignals,
    generatedAt: params.generatedAt || new Date().toISOString(),
  };
}
