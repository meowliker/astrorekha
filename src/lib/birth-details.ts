export type BirthPeriod = "AM" | "PM";

export interface BirthDetailsInput {
  gender?: unknown;
  relationshipStatus?: unknown;
  birthMonth?: unknown;
  birthDay?: unknown;
  birthYear?: unknown;
  birthHour?: unknown;
  birthMinute?: unknown;
  birthPeriod?: unknown;
  birthPlace?: unknown;
  knowsBirthTime?: unknown;
  timezone?: unknown;
  sunSign?: unknown;
  moonSign?: unknown;
  ascendantSign?: unknown;
}

export interface BirthDetailsSnapshot {
  gender: string | null;
  relationshipStatus: string | null;
  birthMonth: string | null;
  birthDay: string | null;
  birthYear: string | null;
  birthHour: string | null;
  birthMinute: string | null;
  birthPeriod: BirthPeriod | null;
  birthPlace: string | null;
  knowsBirthTime: boolean;
  timezone: string | null;
  sunSign: unknown | null;
  moonSign: unknown | null;
  ascendantSign: unknown | null;
  hasBirthDate: boolean;
  hasBirthTime: boolean;
  hasBirthPlace: boolean;
  isDefaultPlaceholder: boolean;
  completeForPalm: boolean;
  completeForBirthChart: boolean;
  source: string;
  capturedAt: string;
}

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === "--") return null;
  if (/^(unknown|not provided|not specified|null|undefined)$/i.test(text)) return null;
  return text;
}

export function getBirthMonthNumber(month: unknown): number | null {
  const text = cleanText(month);
  if (!text) return null;

  const mapped = MONTHS[text.toLowerCase()];
  if (mapped) return mapped;

  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;

  return null;
}

export function getBirthDateParts(input: Pick<BirthDetailsInput, "birthMonth" | "birthDay" | "birthYear">): {
  month: number;
  day: number;
  year: number;
} | null {
  const month = getBirthMonthNumber(input.birthMonth);
  const day = Number(cleanText(input.birthDay));
  const year = Number(cleanText(input.birthYear));

  if (!month || !Number.isInteger(day) || !Number.isInteger(year)) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return valid ? { month, day, year } : null;
}

export function isDefaultBirthDate(input: Pick<BirthDetailsInput, "birthMonth" | "birthDay" | "birthYear">): boolean {
  const parts = getBirthDateParts(input);
  return !!parts && parts.year === 2000 && parts.month === 1 && parts.day === 1;
}

export function getBirthDateIso(input: Pick<BirthDetailsInput, "birthMonth" | "birthDay" | "birthYear">): string | null {
  const parts = getBirthDateParts(input);
  if (!parts || isDefaultBirthDate(input)) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getBirthTime24(input: Pick<BirthDetailsInput, "birthHour" | "birthMinute" | "birthPeriod" | "knowsBirthTime">): string | null {
  if (input.knowsBirthTime === false) return null;

  const hour = Number(cleanText(input.birthHour));
  const minute = Number(cleanText(input.birthMinute) ?? "0");
  const periodText = cleanText(input.birthPeriod)?.toUpperCase();

  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (periodText !== "AM" && periodText !== "PM") return null;
  if (hour === 12 && minute === 0) return null;

  let normalizedHour = hour;
  if (periodText === "PM" && normalizedHour !== 12) normalizedHour += 12;
  if (periodText === "AM" && normalizedHour === 12) normalizedHour = 0;

  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeBirthDetailsSnapshot(
  input: BirthDetailsInput | null | undefined,
  source = "unknown"
): BirthDetailsSnapshot | null {
  if (!input) return null;

  const birthMonth = cleanText(input.birthMonth);
  const birthDay = cleanText(input.birthDay);
  const birthYear = cleanText(input.birthYear);
  const birthHour = cleanText(input.birthHour);
  const birthMinute = cleanText(input.birthMinute);
  const birthPeriodText = cleanText(input.birthPeriod)?.toUpperCase();
  const birthPeriod = birthPeriodText === "AM" || birthPeriodText === "PM" ? birthPeriodText : null;
  const birthPlace = cleanText(input.birthPlace);
  const knowsBirthTime = input.knowsBirthTime === false ? false : true;

  const hasBirthDate = !!getBirthDateParts({ birthMonth, birthDay, birthYear });
  const hasBirthTime = knowsBirthTime ? !!getBirthTime24({ birthHour, birthMinute, birthPeriod, knowsBirthTime }) : false;
  const hasBirthPlace = !!birthPlace;
  const isDefaultPlaceholder = isDefaultBirthDate({ birthMonth, birthDay, birthYear });

  const snapshot: BirthDetailsSnapshot = {
    gender: cleanText(input.gender),
    relationshipStatus: cleanText(input.relationshipStatus),
    birthMonth,
    birthDay,
    birthYear,
    birthHour,
    birthMinute,
    birthPeriod,
    birthPlace,
    knowsBirthTime,
    timezone: cleanText(input.timezone),
    sunSign: input.sunSign ?? null,
    moonSign: input.moonSign ?? null,
    ascendantSign: input.ascendantSign ?? null,
    hasBirthDate,
    hasBirthTime,
    hasBirthPlace,
    isDefaultPlaceholder,
    completeForPalm: hasBirthDate && !isDefaultPlaceholder,
    completeForBirthChart: hasBirthDate && hasBirthPlace && !isDefaultPlaceholder && (!knowsBirthTime || hasBirthTime),
    source,
    capturedAt: new Date().toISOString(),
  };

  const hasAnyData =
    snapshot.gender ||
    snapshot.relationshipStatus ||
    snapshot.birthMonth ||
    snapshot.birthDay ||
    snapshot.birthYear ||
    snapshot.birthPlace ||
    snapshot.sunSign ||
    snapshot.moonSign ||
    snapshot.ascendantSign;

  return hasAnyData ? snapshot : null;
}

export function birthSnapshotToDbFields(snapshot: BirthDetailsSnapshot | null): Record<string, unknown> {
  if (!snapshot) return {};

  const fields: Record<string, unknown> = {
    gender: snapshot.gender,
    relationship_status: snapshot.relationshipStatus,
    timezone: snapshot.timezone,
    sun_sign: snapshot.sunSign,
    moon_sign: snapshot.moonSign,
    ascendant_sign: snapshot.ascendantSign,
  };

  if (snapshot.completeForPalm) {
    fields.birth_month = snapshot.birthMonth;
    fields.birth_day = snapshot.birthDay;
    fields.birth_year = snapshot.birthYear;
  }

  if (snapshot.hasBirthPlace) {
    fields.birth_place = snapshot.birthPlace;
  }

  if (snapshot.hasBirthTime || snapshot.knowsBirthTime === false) {
    fields.birth_hour = snapshot.birthHour;
    fields.birth_minute = snapshot.birthMinute;
    fields.birth_period = snapshot.birthPeriod;
    fields.knows_birth_time = snapshot.knowsBirthTime;
  }

  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

export function birthSnapshotToUserDbFields(snapshot: BirthDetailsSnapshot | null): Record<string, unknown> {
  const { knows_birth_time: _knowsBirthTime, ...fields } = birthSnapshotToDbFields(snapshot);

  for (const key of ["sun_sign", "moon_sign", "ascendant_sign"]) {
    const value = fields[key];
    if (value && typeof value === "object") {
      fields[key] = JSON.stringify(value);
    }
  }

  return fields;
}
