/** US-only narrative rules. Never infer the buyer's city, citizenship or culture. */
export const US_REPORT_CONTEXT = "Write for a United States audience in American English, using color, recognize and personalized. Ordinary meeting possibilities should fit everyday US life, such as a neighborhood cafe, community event or introduction through friends. Do not claim to know the buyer's actual location. Do not introduce India, Indian cities, rupees, GST, Indian time zones, Vedic readings, caste or India-specific marriage customs. Respect the selected background without stereotyping; Native American is a distinct US choice, not a reference to India.";

/** Validate generated prose, not customer names or questionnaire text. */
export function assertUSReportText(text: unknown): asserts text is string {
  if (typeof text !== "string") throw new Error("Invalid report text");
  if (/₹|\b(?:india|indian|mumbai|delhi|kolkata|bengaluru|bangalore|chennai|rupees?|inr|gst|ist|vedic|kundali|kundli)\b|Asia\/Kolkata/i.test(text)) {
    throw new Error("Use American English and everyday US settings; remove India-specific locations, currency, tax, time zones and cultural assumptions.");
  }
}
