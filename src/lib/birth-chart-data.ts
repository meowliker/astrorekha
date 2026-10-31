/** Cached chart fields consumed by reports; providers may add other fields. */
export interface NamedChartValue extends Record<string, unknown> {
  name?: string;
  lord?: { name?: string };
  pada?: string | number;
}
export interface ChartPlanet extends Record<string, unknown> {
  name?: string;
  rasi?: NamedChartValue;
  nakshatra?: NamedChartValue;
  zodiac_sign?: string;
  sign?: string;
  lord?: string;
  tropical?: { sign?: string; formatted?: string };
  sidereal?: { sign?: string };
  vedic?: { nakshatra?: string; pada?: string | number };
  house?: string | number;
  house_number?: string | number;
  house_western?: string | number;
  position?: string | number;
  pada?: string | number;
}
export interface PanchangPeriod extends NamedChartValue {
  start?: string;
  end?: string;
  paksha?: string;
}
export interface BirthChartData extends Record<string, unknown> {
  data?: BirthChartData;
  birthDetails?: { date?: string; time?: string; place?: string; timezone?: number; latitude?: number; longitude?: number };
  planet_positions?: ChartPlanet[];
  planets?: Record<string, ChartPlanet>;
  chart?: {
    output?: string;
    planets?: Record<string, ChartPlanet>;
    ascendant?: ChartPlanet;
    big_three?: { rising?: { sign?: string } };
    birth_data?: Record<string, unknown>;
  };
  navamsaChart?: { output?: string };
  kundli?: {
    [key: string]: unknown;
    planet_position?: ChartPlanet[];
    planetary_positions?: Record<string, ChartPlanet>;
    nakshatra_details?: {
      nakshatra?: NamedChartValue;
      chandra_rasi?: NamedChartValue;
      soorya_rasi?: NamedChartValue;
      zodiac?: NamedChartValue;
      additional_info?: Record<string, string>;
    };
    mangal_dosha?: { has_dosha?: boolean; description?: string };
    yoga_details?: Array<{ name?: string; description?: string }>;
  };
  panchang?: {
    [key: string]: unknown;
    tithi?: PanchangPeriod[];
    karana?: PanchangPeriod[];
    yoga?: PanchangPeriod[];
    nakshatra?: PanchangPeriod[];
  };
  dasha?: { current_period?: { mahadasha?: string; antardasha?: string; label?: string; end_date?: string }; balance_at_birth?: number };
  lagna?: string;
  ascendant?: string;
  lagna_lord?: string;
  ascendant_lord?: string;
  moon_sign?: string;
  houses?: Record<string, unknown>;
  house_lords?: Record<string, unknown>;
}
