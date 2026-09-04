export type MoonPhaseName =
  | "New Moon"
  | "Waxing Crescent"
  | "First Quarter"
  | "Waxing Gibbous"
  | "Full Moon"
  | "Waning Gibbous"
  | "Last Quarter"
  | "Waning Crescent";

export interface MoonPhaseReport {
  phaseName: MoonPhaseName;
  phaseAngle: number;
  illumination: number;
  moonAge: number;
  waxing: boolean;
  rhythm: "Beginning" | "Building" | "Revealing" | "Releasing";
  summary: string;
}

export interface MoonPhaseInput {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  timezoneOffsetHours?: number;
}

export interface MoonMergeReport {
  score: number;
  completionScore: number;
  similarityScore: number;
  illuminationBalance: number;
  phaseGap: number;
  title: string;
  summary: string;
}

const SYNODIC_MONTH_DAYS = 29.530588853;

function normalizeDegrees(value: number) {
  const degrees = value % 360;
  return degrees < 0 ? degrees + 360 : degrees;
}

function angularDistance(a: number, b: number) {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(diff, 360 - diff);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toJulianDate(input: MoonPhaseInput) {
  const hour = Number.isFinite(input.hour) ? input.hour || 0 : 0;
  const minute = Number.isFinite(input.minute) ? input.minute || 0 : 0;
  const timezoneOffset = Number.isFinite(input.timezoneOffsetHours) ? input.timezoneOffsetHours || 0 : 5.5;
  const utcMs =
    Date.UTC(input.year, input.month - 1, input.day, hour, minute) -
    timezoneOffset * 60 * 60 * 1000;

  return utcMs / 86400000 + 2440587.5;
}

function approximateSunLongitude(daysSinceJ2000: number) {
  const meanLongitude = normalizeDegrees(280.46 + 0.9856474 * daysSinceJ2000);
  const meanAnomaly = normalizeDegrees(357.528 + 0.9856003 * daysSinceJ2000);

  return normalizeDegrees(
    meanLongitude +
      1.915 * Math.sin((meanAnomaly * Math.PI) / 180) +
      0.02 * Math.sin((2 * meanAnomaly * Math.PI) / 180)
  );
}

function approximateMoonLongitude(daysSinceJ2000: number) {
  const meanLongitude = normalizeDegrees(218.316 + 13.176396 * daysSinceJ2000);
  const moonMeanAnomaly = normalizeDegrees(134.963 + 13.064993 * daysSinceJ2000);
  const sunMeanAnomaly = normalizeDegrees(357.529 + 0.98560028 * daysSinceJ2000);
  const meanElongation = normalizeDegrees(297.85 + 12.190749 * daysSinceJ2000);
  const argumentOfLatitude = normalizeDegrees(93.272 + 13.22935 * daysSinceJ2000);

  const sinDeg = (degrees: number) => Math.sin((degrees * Math.PI) / 180);

  return normalizeDegrees(
    meanLongitude +
      6.289 * sinDeg(moonMeanAnomaly) +
      1.274 * sinDeg(2 * meanElongation - moonMeanAnomaly) +
      0.658 * sinDeg(2 * meanElongation) +
      0.214 * sinDeg(2 * moonMeanAnomaly) -
      0.186 * sinDeg(sunMeanAnomaly) -
      0.114 * sinDeg(2 * argumentOfLatitude)
  );
}

function getPhaseName(angle: number): MoonPhaseName {
  if (angle < 22.5 || angle >= 337.5) return "New Moon";
  if (angle < 67.5) return "Waxing Crescent";
  if (angle < 112.5) return "First Quarter";
  if (angle < 157.5) return "Waxing Gibbous";
  if (angle < 202.5) return "Full Moon";
  if (angle < 247.5) return "Waning Gibbous";
  if (angle < 292.5) return "Last Quarter";
  return "Waning Crescent";
}

function getRhythm(phaseName: MoonPhaseName): MoonPhaseReport["rhythm"] {
  if (phaseName === "New Moon" || phaseName === "Waxing Crescent") return "Beginning";
  if (phaseName === "First Quarter" || phaseName === "Waxing Gibbous") return "Building";
  if (phaseName === "Full Moon") return "Revealing";
  return "Releasing";
}

function getPhaseSummary(phaseName: MoonPhaseName) {
  switch (phaseName) {
    case "New Moon":
      return "Quiet, instinctive, and beginning-oriented. This moon carries fresh-start emotional energy.";
    case "Waxing Crescent":
      return "Hopeful, growing, and curious. This moon learns love through trust, effort, and small promises.";
    case "First Quarter":
      return "Decisive and action-focused. This moon processes feelings by solving, choosing, and moving.";
    case "Waxing Gibbous":
      return "Refining, devoted, and improvement-led. This moon wants steady progress and emotional clarity.";
    case "Full Moon":
      return "Expressive, intense, and fully visible. This moon feels deeply and brings emotions to the surface.";
    case "Waning Gibbous":
      return "Wise, generous, and reflective. This moon turns experience into guidance and emotional maturity.";
    case "Last Quarter":
      return "Independent, honest, and clearing-focused. This moon needs truth, space, and emotional simplicity.";
    case "Waning Crescent":
      return "Soft, private, and spiritually sensitive. This moon restores through silence, closure, and surrender.";
  }
}

export function calculateMoonPhase(input: MoonPhaseInput): MoonPhaseReport {
  const julianDate = toJulianDate(input);
  const daysSinceJ2000 = julianDate - 2451545;
  const sunLongitude = approximateSunLongitude(daysSinceJ2000);
  const moonLongitude = approximateMoonLongitude(daysSinceJ2000);
  const phaseAngle = normalizeDegrees(moonLongitude - sunLongitude);
  const moonAge = (phaseAngle / 360) * SYNODIC_MONTH_DAYS;
  const illumination = ((1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2) * 100;
  const phaseName = getPhaseName(phaseAngle);

  return {
    phaseName,
    phaseAngle,
    illumination: Math.round(illumination * 10) / 10,
    moonAge: Math.round(moonAge * 10) / 10,
    waxing: phaseAngle < 180,
    rhythm: getRhythm(phaseName),
    summary: getPhaseSummary(phaseName),
  };
}

export function calculateMoonMerge(first: MoonPhaseReport, second: MoonPhaseReport): MoonMergeReport {
  const phaseGap = angularDistance(first.phaseAngle, second.phaseAngle);
  const completionScore = clamp(100 - (Math.abs(180 - phaseGap) / 180) * 100, 0, 100);
  const similarityScore = clamp(100 - (phaseGap / 180) * 100, 0, 100);
  const illuminationBalance = clamp(100 - Math.abs(100 - (first.illumination + second.illumination)), 0, 100);
  const rhythmBalance = first.waxing !== second.waxing ? 100 : 72;
  const score = Math.round(
    completionScore * 0.55 +
      illuminationBalance * 0.25 +
      rhythmBalance * 0.12 +
      similarityScore * 0.08
  );

  const title =
    score >= 85
      ? "Beautiful moon completion"
      : score >= 70
        ? "Strong emotional balance"
        : score >= 55
          ? "Gentle growth match"
          : "Different emotional rhythms";

  const summary =
    score >= 85
      ? "Your moon shapes complete each other strongly. One energy fills what the other leaves open, creating a natural sense of emotional balance."
      : score >= 70
        ? "Your emotional rhythms can work well together, especially when both people respect different ways of reacting and recovering."
        : score >= 55
          ? "There is workable compatibility here, but the bond improves when expectations are spoken clearly instead of assumed."
          : "The moon shapes suggest different emotional timing. The connection can still grow, but it needs patience, reassurance, and conscious communication.";

  return {
    score,
    completionScore: Math.round(completionScore),
    similarityScore: Math.round(similarityScore),
    illuminationBalance: Math.round(illuminationBalance),
    phaseGap: Math.round(phaseGap),
    title,
    summary,
  };
}
