export const REPORT_DESCRIPTIONS = {
  palmReading: { title: "Palm Reading", description: "Explore what your palm lines suggest about your personality, relationships, career, and life patterns." },
  birthChart: { title: "Birth Chart", description: "Explore your planetary placements and what they suggest about your personality, strengths, relationships, and life themes." },
  compatibilityTest: { title: "Compatibility", description: "Explore the emotional connection, communication styles, strengths, and potential challenges between two zodiac signs." },
  soulmateSketch: { title: "Soulmate Sketch", description: "An artistic portrait imagining the appearance of your potential soulmate." },
  auraColorReport: { title: "Aura Color", description: "Explore your symbolic aura colors and their connections to your personality, emotional energy, relationships, and personal growth." },
  astrocartographyReport: { title: "Astrocartography", description: "Explore places around the world associated with different planetary influences on your career, relationships, and personal growth." },
  numerologyReport: { title: "Numerology", description: "Explore your core numbers and their meanings for your personality, life direction, relationships, and personal strengths." },
  spiritAnimalReport: { title: "Spirit Animal", description: "Discover your symbolic animal archetype and the strengths, instincts, relationship patterns, and growth themes it represents." },
  witchArchetypeReport: { title: "Witch Archetype", description: "Explore your symbolic witch archetype, its natural gifts, relationship patterns, and practices for personal reflection." },
  prediction2026: { title: "2026 Predictions", description: "Explore astrological themes for 2026 across love, career, well-being, and personal growth." },
  futurePartnerReport: { title: "Future Partner", description: "Explore astrological interpretations of a potential partner’s qualities, your relationship dynamics, and partnership timing." },
  pastLifeReport: { title: "Past Life", description: "Explore a symbolic past-life narrative, recurring patterns, and lessons for reflection in your present life." },
} as const;

export type ReportDescriptionKey = keyof typeof REPORT_DESCRIPTIONS;
