/** Provider fields used when composing horoscope and chat prompts. */
export interface NatalPromptData {
  success?: boolean;
  chart?: {
    birth_data?: Record<string, unknown>;
    big_three?: Record<string, { sign?: string; degree?: string | number; house?: string | number; nakshatra?: string }>;
    planets?: Record<string, { tropical?: { formatted?: string }; formatted?: string; house_western?: string | number; house?: string | number; retrograde?: boolean; dignity?: string }>;
    houses?: Record<string, { sign?: { formatted?: string } | string | null }>;
    aspects?: Array<Record<string, unknown>>;
    stelliums?: unknown;
    elements?: { dominant?: string };
    modalities?: { dominant?: string };
  };
  dasha?: {
    current_period?: { label?: string; mahadasha?: string; antardasha?: string };
    mahadashas?: Array<{ ruler?: string; start_date?: string; end_date?: string; age_start?: number; age_end?: number; sub_periods?: Array<{ label?: string; start_date?: string; end_date?: string }> }>;
  };
  active_transits?: Array<Record<string, unknown>>;
}
export interface PalmPromptData {
  image_quality?: Record<string, unknown>;
  hand_identification?: Record<string, unknown>;
  hand_shape?: Record<string, unknown>;
  heart_line?: Record<string, unknown>;
  head_line?: Record<string, unknown>;
  life_line?: Record<string, unknown>;
  fate_line?: Record<string, unknown>;
  minor_lines?: Record<string, { present?: boolean; quality?: string; count?: number }>;
  mounts?: Record<string, { prominence?: unknown }>;
  special_markings?: { mystic_cross?: boolean; stars?: unknown[]; triangles?: unknown[] };
  bracelet_lines?: { count?: number };
  overall_assessment?: Record<string, unknown>;
}
export interface ChatReadingContext extends PalmPromptData {
  natal_chart?: NatalPromptData["chart"];
  chart?: NatalPromptData["chart"];
  dasha_data?: NatalPromptData["dasha"];
  dasha?: NatalPromptData["dasha"];
  palm_analysis?: PalmPromptData;
  palm?: PalmPromptData;
  active_transits?: NatalPromptData["active_transits"];
}
