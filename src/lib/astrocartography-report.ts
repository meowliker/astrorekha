export type AstrocartographyCategory = "love" | "career" | "home" | "growth" | "spiritual";

export interface AstrocartographyPoint {
  lat: number;
  lng: number;
}

export interface AstrocartographyBirthData {
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
  place: string;
  latitude: number;
  longitude: number;
  timezone: number;
}

export interface AstrocartographyLine {
  id: string;
  planet: string;
  angle: "AC" | "DC" | "MC" | "IC";
  angleLabel: string;
  category: AstrocartographyCategory;
  title: string;
  summary: string;
  guidance: string;
  color: string;
  points: AstrocartographyPoint[];
}

export interface AstrocartographyCityHighlight {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  lineId: string;
  planet: string;
  angle: string;
  category: AstrocartographyCategory;
  distanceKm: number;
  headline: string;
  note: string;
}

export interface AstrocartographyReportData {
  generatedAt: string;
  birthData: AstrocartographyBirthData;
  lines: AstrocartographyLine[];
  featuredLines: AstrocartographyLine[];
  cityHighlights: AstrocartographyCityHighlight[];
  categorySummary: Record<AstrocartographyCategory, string>;
}

const PLANET_CONFIG: Record<
  string,
  {
    color: string;
    energy: string;
    opportunities: string;
    caution: string;
  }
> = {
  Sun: {
    color: "#f59e0b",
    energy: "visibility, confidence, leadership, and feeling fully seen",
    opportunities: "Places on this line can support recognition, courage, and a stronger sense of identity.",
    caution: "Avoid performing for approval; let attention meet real purpose.",
  },
  Moon: {
    color: "#a5b4fc",
    energy: "emotional safety, belonging, intuition, and family patterns",
    opportunities: "This line can feel familiar and nurturing, especially for healing, home, and emotional reconnection.",
    caution: "Old moods can rise quickly here, so boundaries matter.",
  },
  Mercury: {
    color: "#22d3ee",
    energy: "communication, learning, writing, trade, and networking",
    opportunities: "This line is useful for study, content, conversations, business ideas, and meeting mentally stimulating people.",
    caution: "The pace can become restless if you do not choose what deserves your attention.",
  },
  Venus: {
    color: "#ec4899",
    energy: "love, beauty, harmony, social ease, and pleasure",
    opportunities: "This line can bring romantic openness, creative charm, style, comfort, and supportive relationships.",
    caution: "Comfort can become avoidance if important decisions are delayed.",
  },
  Mars: {
    color: "#ef4444",
    energy: "drive, courage, sexuality, ambition, and direct action",
    opportunities: "This line supports movement, competition, decisive work, fitness, launches, and bold personal choices.",
    caution: "Intensity can become conflict if anger or urgency is unmanaged.",
  },
  Jupiter: {
    color: "#34d399",
    energy: "luck, expansion, mentors, optimism, and opportunity",
    opportunities: "This line can open doors through education, travel, teaching, abundance, and generous networks.",
    caution: "Growth still needs discipline; avoid overpromising or overspending.",
  },
  Saturn: {
    color: "#94a3b8",
    energy: "discipline, responsibility, structure, mastery, and long-term work",
    opportunities: "This line can help build authority, maturity, expertise, and durable success.",
    caution: "It may feel heavy if rest, support, and patience are ignored.",
  },
  Uranus: {
    color: "#38bdf8",
    energy: "freedom, reinvention, breakthroughs, and unconventional paths",
    opportunities: "This line can awaken originality, fresh networks, technology, independence, and sudden life upgrades.",
    caution: "Too much instability can scatter your nervous system; keep one anchor.",
  },
  Neptune: {
    color: "#8b5cf6",
    energy: "dreams, spirituality, compassion, imagination, and surrender",
    opportunities: "This line supports art, meditation, healing, devotion, and deeper symbolic awareness.",
    caution: "Clarity is essential; fantasy, confusion, or vague promises can blur practical decisions.",
  },
  Pluto: {
    color: "#c084fc",
    energy: "transformation, power, rebirth, shadow work, and deep truth",
    opportunities: "This line can catalyze major evolution, personal strength, and psychological insight.",
    caution: "Power dynamics may intensify, so move slowly and stay honest with yourself.",
  },
};

const ANGLE_CONFIG: Record<
  AstrocartographyLine["angle"],
  { label: string; meaning: string; categoryHint: AstrocartographyCategory }
> = {
  AC: {
    label: "Self Line",
    meaning: "activates identity, presence, body language, confidence, and how you begin new chapters",
    categoryHint: "growth",
  },
  DC: {
    label: "Relationship Line",
    meaning: "activates partnership, attraction, client relationships, mirrors, and the people you draw in",
    categoryHint: "love",
  },
  MC: {
    label: "Career Line",
    meaning: "activates public image, career direction, status, visibility, and long-term ambition",
    categoryHint: "career",
  },
  IC: {
    label: "Home Line",
    meaning: "activates home, roots, family memory, privacy, emotional grounding, and inner life",
    categoryHint: "home",
  },
};

const CATEGORY_SUMMARY: Record<AstrocartographyCategory, string> = {
  love: "Relationship-focused lines show places where partnership, attraction, emotional exchange, and social chemistry become stronger themes.",
  career: "Career lines show places that can amplify visibility, ambition, public direction, leadership, and long-term professional development.",
  home: "Home lines show places where belonging, family patterns, rest, privacy, and emotional grounding become more noticeable.",
  growth: "Growth lines show places that can awaken courage, reinvention, learning, confidence, and a larger version of your life.",
  spiritual: "Spiritual lines show places that may feel symbolic, intuitive, healing, mysterious, or deeply transformational.",
};

const CITY_CATALOG = [
  { city: "Mumbai", country: "India", latitude: 19.076, longitude: 72.8777 },
  { city: "Delhi", country: "India", latitude: 28.6139, longitude: 77.209 },
  { city: "Bengaluru", country: "India", latitude: 12.9716, longitude: 77.5946 },
  { city: "Dubai", country: "UAE", latitude: 25.2048, longitude: 55.2708 },
  { city: "Singapore", country: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { city: "London", country: "United Kingdom", latitude: 51.5074, longitude: -0.1278 },
  { city: "Paris", country: "France", latitude: 48.8566, longitude: 2.3522 },
  { city: "New York", country: "USA", latitude: 40.7128, longitude: -74.006 },
  { city: "Los Angeles", country: "USA", latitude: 34.0522, longitude: -118.2437 },
  { city: "Sydney", country: "Australia", latitude: -33.8688, longitude: 151.2093 },
  { city: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503 },
  { city: "Bali", country: "Indonesia", latitude: -8.3405, longitude: 115.092 },
];

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizePlanet(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "Sun";
  const normalized = titleCase(raw.replace(/line|planet/gi, ""));
  if (PLANET_CONFIG[normalized]) return normalized;
  const matched = Object.keys(PLANET_CONFIG).find((planet) => normalized.toLowerCase().includes(planet.toLowerCase()));
  return matched || normalized;
}

function normalizeAngle(value: unknown): AstrocartographyLine["angle"] | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (["asc", "as", "ac", "ascendant", "rising"].includes(raw)) return "AC";
  if (["dsc", "dc", "desc", "descendant", "setting"].includes(raw)) return "DC";
  if (["mc", "midheaven", "medium coeli"].includes(raw)) return "MC";
  if (["ic", "imum coeli", "nadir"].includes(raw)) return "IC";
  if (raw.includes("asc")) return "AC";
  if (raw.includes("desc") || raw.includes("dsc")) return "DC";
  if (raw.includes("midheaven") || raw.includes("mc")) return "MC";
  if (raw.includes("nadir") || raw.includes("ic")) return "IC";
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeLongitude(value: number): number {
  if (value >= -180 && value <= 180) return value;
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function parsePoints(value: unknown): AstrocartographyPoint[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((point) => {
      if (Array.isArray(point)) {
        const lat = asFiniteNumber(point[0]);
        const lng = asFiniteNumber(point[1]);
        if (lat === null || lng === null) return null;
        return { lat, lng: normalizeLongitude(lng) };
      }

      if (point && typeof point === "object") {
        const source = point as Record<string, unknown>;
        const lat = asFiniteNumber(source.lat ?? source.latitude ?? source.latitude_deg ?? source.y);
        const lng = asFiniteNumber(
          source.lng ?? source.lon ?? source.long ?? source.longitude ?? source.longitude_deg ?? source.x
        );
        if (lat === null || lng === null) return null;
        return { lat, lng: normalizeLongitude(lng) };
      }

      return null;
    })
    .filter((point): point is AstrocartographyPoint => {
      return !!point && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
    });
}

function meridianPoints(longitude: number): AstrocartographyPoint[] {
  const lng = normalizeLongitude(longitude);
  return Array.from({ length: 35 }, (_, index) => ({
    lat: -85 + index * 5,
    lng,
  }));
}

function pointsFromLineValue(value: unknown): AstrocartographyPoint[] {
  const direct = parsePoints(value);
  if (direct.length > 1) return direct;

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const nestedPoints = parsePoints(source.points ?? source.coordinates ?? source.path ?? source.line);
    if (nestedPoints.length > 1) return nestedPoints;

    const longitude = asFiniteNumber(source.longitude_deg ?? source.longitude ?? source.lon ?? source.lng);
    if (longitude !== null) {
      return meridianPoints(longitude);
    }
  }

  return [];
}

function lineEntriesFromObject(source: Record<string, unknown>): Array<{ angle: AstrocartographyLine["angle"]; points: AstrocartographyPoint[] }> {
  const entries: Array<{ angle: AstrocartographyLine["angle"]; points: AstrocartographyPoint[] }> = [];

  Object.entries(source).forEach(([key, value]) => {
    const angle = normalizeAngle(key);
    if (!angle) return;

    const points = pointsFromLineValue(value);
    if (points.length > 1) {
      entries.push({ angle, points });
    }
  });

  return entries;
}

function categorizeLine(planet: string, angle: AstrocartographyLine["angle"]): AstrocartographyCategory {
  if (angle === "DC" || planet === "Venus") return "love";
  if (angle === "MC") return "career";
  if (angle === "IC" || planet === "Moon") return "home";
  if (["Sun", "Saturn", "Mercury"].includes(planet)) return "career";
  if (["Neptune", "Pluto"].includes(planet)) return "spiritual";
  return "growth";
}

function makeLine({
  planet,
  angle,
  points,
}: {
  planet: string;
  angle: AstrocartographyLine["angle"];
  points: AstrocartographyPoint[];
}): AstrocartographyLine {
  const planetConfig = PLANET_CONFIG[planet] || PLANET_CONFIG.Sun;
  const angleConfig = ANGLE_CONFIG[angle];
  const category = categorizeLine(planet, angle);

  return {
    id: `${planet.toLowerCase()}-${angle.toLowerCase()}`,
    planet,
    angle,
    angleLabel: angleConfig.label,
    category,
    title: `${planet} ${angle} ${angleConfig.label}`,
    summary: `${planet} ${angle} places emphasize ${planetConfig.energy}. This line ${angleConfig.meaning}.`,
    guidance: `${planetConfig.opportunities} ${planetConfig.caution}`,
    color: planetConfig.color,
    points,
  };
}

function flattenProviderLines(raw: unknown): AstrocartographyLine[] {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawLines = Array.isArray(source.lines)
    ? source.lines
    : source.lines && typeof source.lines === "object"
      ? Object.entries(source.lines as Record<string, unknown>).map(([planet, value]) => ({ planet, value }))
      : [];

  const lines: AstrocartographyLine[] = [];

  rawLines.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const line = item as Record<string, unknown>;
    const nestedValue = line.value && typeof line.value === "object" ? (line.value as Record<string, unknown>) : null;
    const sourceLine = nestedValue || line;
    const planet = normalizePlanet(line.object ?? line.planet ?? line.body ?? line.name ?? line.planet_name ?? line.label);
    const directAngle = normalizeAngle(line.angle ?? line.line_type ?? line.type ?? line.axis ?? line.house);
    const directPoints = pointsFromLineValue(line.points ?? line.coordinates ?? line.path ?? line.line);

    if (directAngle && directPoints.length > 1) {
      lines.push(makeLine({ planet, angle: directAngle, points: directPoints }));
      return;
    }

    lineEntriesFromObject(sourceLine).forEach(({ angle, points }) => {
      lines.push(makeLine({ planet, angle, points }));
    });
  });

  const seen = new Set<string>();
  return lines.filter((line) => {
    const fingerprint = `${line.id}:${line.points.length}:${line.points[0]?.lat}:${line.points[0]?.lng}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return line.points.length > 1;
  });
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceKm(a: AstrocartographyPoint, b: AstrocartographyPoint): number {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearestDistanceToLine(city: AstrocartographyPoint, line: AstrocartographyLine): number {
  const sampled = line.points.filter((_, index) => index % 4 === 0);
  const candidates = sampled.length ? sampled : line.points;
  return Math.min(...candidates.map((point) => distanceKm(city, point)));
}

function buildCityHighlights(lines: AstrocartographyLine[]): AstrocartographyCityHighlight[] {
  const highlights = CITY_CATALOG.flatMap((city) => {
    const nearest = lines
      .map((line) => ({
        line,
        distanceKm: nearestDistanceToLine({ lat: city.latitude, lng: city.longitude }, line),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];

    if (!nearest || nearest.distanceKm > 900) return [];

    const { line, distanceKm: nearbyKm } = nearest;
    return [
      {
        ...city,
        lineId: line.id,
        planet: line.planet,
        angle: line.angle,
        category: line.category,
        distanceKm: Math.round(nearbyKm),
        headline: `${line.planet} ${line.angle} influence near ${city.city}`,
        note: `${city.city} sits close to your ${line.title}, highlighting ${line.category} themes through this location.`,
      },
    ];
  });

  const categoryOrder: AstrocartographyCategory[] = ["career", "love", "home", "growth", "spiritual"];
  return highlights
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category))
    .slice(0, 6);
}

function chooseFeaturedLines(lines: AstrocartographyLine[]): AstrocartographyLine[] {
  const preferred = ["Sun-mc", "Venus-dc", "Jupiter-mc", "Moon-ic", "Mercury-mc", "Neptune-ic"];
  const chosen = new Map<string, AstrocartographyLine>();

  preferred.forEach((id) => {
    const found = lines.find((line) => line.id === id);
    if (found) chosen.set(found.id, found);
  });

  for (const category of ["career", "love", "home", "growth", "spiritual"] as AstrocartographyCategory[]) {
    const found = lines.find((line) => line.category === category && !chosen.has(line.id));
    if (found) chosen.set(found.id, found);
  }

  lines.slice(0, 10).forEach((line) => {
    if (chosen.size < 8) chosen.set(line.id, line);
  });

  return Array.from(chosen.values()).slice(0, 8);
}

export function buildAstrocartographyReport(
  rawProviderResponse: unknown,
  birthData: AstrocartographyBirthData
): AstrocartographyReportData {
  const lines = flattenProviderLines(rawProviderResponse);

  return {
    generatedAt: new Date().toISOString(),
    birthData,
    lines,
    featuredLines: chooseFeaturedLines(lines),
    cityHighlights: buildCityHighlights(lines),
    categorySummary: CATEGORY_SUMMARY,
  };
}

export function hasUsableAstrocartographyLines(value: unknown): boolean {
  return flattenProviderLines(value).length > 0;
}
