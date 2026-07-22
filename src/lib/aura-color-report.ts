export type AuraColor =
  | "Red"
  | "Orange"
  | "Yellow"
  | "Green"
  | "Blue"
  | "Indigo"
  | "Violet"
  | "White";

export interface AuraQuestionOption {
  id: string;
  label: string;
  points: Partial<Record<AuraColor, number>>;
}

export interface AuraQuestion {
  id: string;
  question: string;
  options: AuraQuestionOption[];
}

export interface AuraAnswer {
  questionId: string;
  optionId: string;
}

export interface AuraStoredAnswer {
  question: string;
  answer: string;
  points: Partial<Record<AuraColor, number>>;
}

export interface AuraColorProfile {
  color: AuraColor;
  title: string;
  archetype: string;
  shortMeaning: string;
  energySignature: string;
  coreQualities: string[];
  strengths: string[];
  growthAreas: string[];
  relationships: string;
  workAndPurpose: string;
  energyCare: string[];
  affirmation: string;
  gradient: string;
  accent: string;
}

export interface AuraReportResult {
  colorName: string;
  primaryColor: AuraColor;
  secondaryColor: AuraColor | null;
  auraArchetype: string;
  confidence?: number;
  scores?: Record<AuraColor, number>;
  overview: string;
  energySignature: string;
  coreQualities: string[];
  strengths: string[];
  growthAreas: string[];
  relationships: string;
  workAndPurpose: string;
  emotionalPattern: string;
  spiritualLesson: string;
  shadowPattern: string;
  energyCare: string[];
  affirmation: string;
  generatedAt: string;
}

export const AURA_COLORS: Record<AuraColor, AuraColorProfile> = {
  Red: {
    color: "Red",
    title: "Red Aura",
    archetype: "Activator",
    shortMeaning: "Grounded, driven, physical, protective",
    energySignature:
      "Your energy is direct and embodied. You move through life by taking action, protecting what matters, and trusting practical proof over vague promises.",
    coreQualities: ["Courageous", "protective", "decisive", "sensual", "resilient"],
    strengths: [
      "You can turn pressure into movement instead of staying stuck in overthinking.",
      "You bring loyalty and stability to the people who depend on you.",
      "You are naturally good at handling real-world responsibilities and urgent moments.",
    ],
    growthAreas: [
      "Your impatience can make slower emotional processes feel frustrating.",
      "You may carry stress in your body when you do not pause to release it.",
      "You can become overly self-reliant and forget to ask for support.",
    ],
    relationships:
      "In relationships, you show love through presence, effort, and consistency. You need honesty, loyalty, and physical reassurance more than dramatic promises.",
    workAndPurpose:
      "Your purpose energy strengthens in roles that reward courage, execution, leadership, building, operations, fitness, business, or any field where results are visible.",
    energyCare: [
      "Move your body before making emotionally charged decisions.",
      "Keep a simple routine that anchors sleep, food, and movement.",
      "Choose direct communication instead of storing resentment.",
    ],
    affirmation: "I am safe to act with strength and softness.",
    gradient: "from-rose-500 via-red-500 to-orange-500",
    accent: "#fb365c",
  },
  Orange: {
    color: "Orange",
    title: "Orange Aura",
    archetype: "Creator",
    shortMeaning: "Creative, warm, expressive, magnetic",
    energySignature:
      "Your energy is fluid, playful, and emotionally alive. You recharge through creative expression, shared experiences, beauty, and environments that let you feel instead of perform.",
    coreQualities: ["Creative", "warm", "sensual", "adaptable", "emotionally expressive"],
    strengths: [
      "You make people feel welcomed, seen, and emotionally lighter.",
      "You can find fresh possibilities where others only see routine.",
      "You bring charm and creative timing into personal and professional spaces.",
    ],
    growthAreas: [
      "Your mood can be shaped too strongly by the energy around you.",
      "You may postpone structure when something no longer feels exciting.",
      "You can confuse intensity with alignment if you do not slow down.",
    ],
    relationships:
      "In relationships, you need warmth, play, touch, and emotional freedom. You thrive with partners who celebrate your liveliness without trying to contain it.",
    workAndPurpose:
      "Your purpose energy suits creative business, content, design, hospitality, beauty, healing spaces, entertainment, community, and roles involving people.",
    energyCare: [
      "Create something small every day, even when it is not perfect.",
      "Protect your emotional space after intense social interactions.",
      "Balance pleasure with commitments you can actually maintain.",
    ],
    affirmation: "My joy is powerful, focused, and worthy of space.",
    gradient: "from-orange-500 via-amber-400 to-pink-500",
    accent: "#f97316",
  },
  Yellow: {
    color: "Yellow",
    title: "Yellow Aura",
    archetype: "Optimist",
    shortMeaning: "Optimistic, curious, intelligent, uplifting",
    energySignature:
      "Your energy is bright, quick, and mentally active. You are here to understand, teach, lighten heavy rooms, and make life feel more possible through clarity.",
    coreQualities: ["Curious", "optimistic", "analytical", "funny", "self-improving"],
    strengths: [
      "You learn quickly and can explain complex ideas in a simple way.",
      "You lift the energy of a room with humor, ideas, and perspective.",
      "You are naturally future-facing and good at spotting opportunities.",
    ],
    growthAreas: [
      "You may overthink feelings instead of letting yourself feel them fully.",
      "You can chase too many ideas before one has time to mature.",
      "Your nervous system needs more rest than your mind admits.",
    ],
    relationships:
      "In relationships, mental connection matters deeply. You need conversation, laughter, and a partner who respects both your independence and sensitivity.",
    workAndPurpose:
      "Your purpose energy shines in education, communication, marketing, entrepreneurship, strategy, analysis, writing, media, or teaching-centered roles.",
    energyCare: [
      "Write down racing thoughts so your mind can unclench.",
      "Choose one priority at a time when your energy feels scattered.",
      "Spend time in sunlight or bright spaces when your mood dips.",
    ],
    affirmation: "My mind is clear, calm, and guided by wisdom.",
    gradient: "from-yellow-300 via-amber-400 to-lime-400",
    accent: "#facc15",
  },
  Green: {
    color: "Green",
    title: "Green Aura",
    archetype: "Healer",
    shortMeaning: "Healing, balanced, nurturing, growth-oriented",
    energySignature:
      "Your energy is heart-centered and restorative. You naturally notice what needs care, repair, patience, and emotional truth.",
    coreQualities: ["Nurturing", "balanced", "loyal", "healing", "growth-minded"],
    strengths: [
      "You create emotional safety and help others feel less alone.",
      "You are patient with long journeys and steady personal growth.",
      "You can bring harmony without ignoring what is real.",
    ],
    growthAreas: [
      "You may over-give when you are afraid of disappointing people.",
      "You can hold on to relationships or responsibilities past their season.",
      "Your peace can become avoidance if you do not set boundaries.",
    ],
    relationships:
      "In relationships, you value tenderness, trust, and emotional maturity. You love deeply, but you need reciprocal care instead of one-sided responsibility.",
    workAndPurpose:
      "Your purpose energy fits healing, wellness, teaching, counseling, people leadership, nature-related work, design, or roles that improve quality of life.",
    energyCare: [
      "Use boundaries as a form of love, not rejection.",
      "Spend time around plants, open air, or uncluttered spaces.",
      "Let yourself receive help without immediately repaying it.",
    ],
    affirmation: "My heart can stay open without carrying everything.",
    gradient: "from-emerald-400 via-green-500 to-teal-400",
    accent: "#34d399",
  },
  Blue: {
    color: "Blue",
    title: "Blue Aura",
    archetype: "Communicator",
    shortMeaning: "Calm, honest, intuitive, communicative",
    energySignature:
      "Your energy is soothing, observant, and truth-seeking. You bring clarity through words, listening, and emotional steadiness.",
    coreQualities: ["Calm", "honest", "empathetic", "thoughtful", "communicative"],
    strengths: [
      "You can make complicated emotions easier to name and understand.",
      "You are trusted because your presence feels sincere and steady.",
      "You often sense the truth behind what people are saying.",
    ],
    growthAreas: [
      "You may silence your needs to keep the peace.",
      "You can absorb other people's emotions and mistake them for your own.",
      "You may delay action because you want the perfect words first.",
    ],
    relationships:
      "In relationships, you need emotional honesty, gentle communication, and space to process. Your love language often includes listening and thoughtful reassurance.",
    workAndPurpose:
      "Your purpose energy supports writing, counseling, teaching, music, customer care, research, spiritual work, communication, or service-oriented roles.",
    energyCare: [
      "Say the honest thing before resentment gathers.",
      "Use music, breath, or water rituals to clear emotional residue.",
      "Protect quiet time after long conversations.",
    ],
    affirmation: "My truth is gentle, clear, and safe to express.",
    gradient: "from-cyan-400 via-sky-500 to-blue-600",
    accent: "#38bdf8",
  },
  Indigo: {
    color: "Indigo",
    title: "Indigo Aura",
    archetype: "Mystic",
    shortMeaning: "Intuitive, perceptive, deep, visionary",
    energySignature:
      "Your energy is deep, private, and highly perceptive. You read patterns quickly and often know the emotional truth before it is spoken.",
    coreQualities: ["Intuitive", "perceptive", "private", "strategic", "emotionally deep"],
    strengths: [
      "You see hidden motives, patterns, and timing with unusual accuracy.",
      "You can transform painful experiences into wisdom.",
      "You are powerful when you trust your inner knowing and choose focus.",
    ],
    growthAreas: [
      "You may withdraw when people cannot understand your depth.",
      "You can become suspicious when your intuition is mixed with fear.",
      "You need grounding so your inner world does not become too heavy.",
    ],
    relationships:
      "In relationships, you crave depth, loyalty, and emotional honesty. Surface-level connection drains you, while trust makes you intensely devoted.",
    workAndPurpose:
      "Your purpose energy fits psychology, research, occult studies, strategy, investigation, product thinking, healing, transformation, or private creative work.",
    energyCare: [
      "Ground insights with evidence before making major choices.",
      "Keep a private journal to separate intuition from anxiety.",
      "Choose fewer, deeper commitments instead of emotional overextension.",
    ],
    affirmation: "My intuition is calm, grounded, and clear.",
    gradient: "from-blue-700 via-indigo-600 to-violet-600",
    accent: "#6366f1",
  },
  Violet: {
    color: "Violet",
    title: "Violet Aura",
    archetype: "Visionary",
    shortMeaning: "Spiritual, imaginative, idealistic, transformative",
    energySignature:
      "Your energy is imaginative and spiritually charged. You are drawn to meaning, symbolism, healing, creativity, and the unseen layers of life.",
    coreQualities: ["Visionary", "spiritual", "imaginative", "idealistic", "transformational"],
    strengths: [
      "You can inspire people to believe in a wider version of life.",
      "You connect ideas, emotions, and symbols in a naturally creative way.",
      "You are often pulled toward healing, art, spirituality, or reinvention.",
    ],
    growthAreas: [
      "You may escape into possibility when daily structure feels restrictive.",
      "You can expect others to understand emotions you have not clearly named.",
      "Your sensitivity needs practical grounding to become sustainable.",
    ],
    relationships:
      "In relationships, you need soul connection, imagination, and emotional depth. You do best with someone who respects your dreams while helping you stay grounded.",
    workAndPurpose:
      "Your purpose energy supports art, spirituality, healing, storytelling, coaching, design, content, innovation, or any role that turns vision into form.",
    energyCare: [
      "Translate big visions into one practical next step.",
      "Use meditation carefully; pair it with grounding movement.",
      "Keep your environment beautiful but simple.",
    ],
    affirmation: "My vision becomes stronger when I give it structure.",
    gradient: "from-violet-500 via-fuchsia-500 to-purple-700",
    accent: "#a855f7",
  },
  White: {
    color: "White",
    title: "White Aura",
    archetype: "Sage",
    shortMeaning: "Sensitive, clear, spiritual, cleansing",
    energySignature:
      "Your energy is clear, receptive, and subtle. You are highly sensitive to atmosphere, intention, and energetic clutter, which makes discernment essential.",
    coreQualities: ["Sensitive", "clear", "gentle", "spiritually aware", "purifying"],
    strengths: [
      "You can sense what feels clean, aligned, and honest very quickly.",
      "You bring softness and perspective into intense situations.",
      "You often help others reset simply through your presence.",
    ],
    growthAreas: [
      "You may absorb too much because your boundaries are porous.",
      "You can become overwhelmed by noise, conflict, or crowded emotional spaces.",
      "You need structure so sensitivity does not become avoidance.",
    ],
    relationships:
      "In relationships, you need peace, sincerity, and emotional cleanliness. You are not built for constant chaos or manipulative dynamics.",
    workAndPurpose:
      "Your purpose energy fits spiritual service, healing, aesthetics, wellness, caregiving, writing, design, or roles where calm attention is valuable.",
    energyCare: [
      "Clear your space regularly and keep fewer energetic obligations.",
      "Give yourself transition time after intense people or places.",
      "Use simple rituals to separate your feelings from others' feelings.",
    ],
    affirmation: "I can be sensitive and protected at the same time.",
    gradient: "from-slate-100 via-cyan-100 to-violet-200",
    accent: "#e0f2fe",
  },
};

const AURA_TEMPLATE_ARCHETYPES: Record<string, string> = {
  Red: "Activator",
  Orange: "Creator",
  Yellow: "Optimist",
  Green: "Healer",
  Blue: "Communicator",
  Indigo: "Mystic",
  Violet: "Visionary",
  White: "Sage",
  "Red-Orange": "Dynamo",
  "Red-Yellow": "Commander",
  "Red-Green": "Guardian",
  "Red-Blue": "Advocate",
  "Red-Indigo": "Strategist",
  "Red-Violet": "Alchemist",
  "Red-White": "Sentinel",
  "Orange-Red": "Performer",
  "Orange-Yellow": "Enthusiast",
  "Orange-Green": "Harmonizer",
  "Orange-Blue": "Storyteller",
  "Orange-Indigo": "Enchanter",
  "Orange-Violet": "Muse",
  "Orange-White": "Inspirer",
  "Yellow-Red": "Achiever",
  "Yellow-Orange": "Spark",
  "Yellow-Green": "Mentor",
  "Yellow-Blue": "Teacher",
  "Yellow-Indigo": "Analyst",
  "Yellow-Violet": "Philosopher",
  "Yellow-White": "Luminary",
  "Green-Red": "Protector",
  "Green-Orange": "Nurturer",
  "Green-Yellow": "Cultivator",
  "Green-Blue": "Counselor",
  "Green-Indigo": "Empath",
  "Green-Violet": "Weaver",
  "Green-White": "Peacemaker",
  "Blue-Red": "Mediator",
  "Blue-Orange": "Expressor",
  "Blue-Yellow": "Messenger",
  "Blue-Green": "Listener",
  "Blue-Indigo": "Oracle",
  "Blue-Violet": "Poet",
  "Blue-White": "Clarifier",
  "Indigo-Red": "Investigator",
  "Indigo-Orange": "Magician",
  "Indigo-Yellow": "Seer",
  "Indigo-Green": "Decoder",
  "Indigo-Blue": "Insight",
  "Indigo-Violet": "Prophet",
  "Indigo-White": "Channel",
  "Violet-Red": "Transformer",
  "Violet-Orange": "Artist",
  "Violet-Yellow": "Dreamer",
  "Violet-Green": "Devotee",
  "Violet-Blue": "Harmonist",
  "Violet-Indigo": "Illuminator",
  "Violet-White": "Ascendant",
  "White-Red": "Purifier",
  "White-Orange": "Blesser",
  "White-Yellow": "Beacon",
  "White-Green": "Restorer",
  "White-Blue": "Whisperer",
  "White-Indigo": "Clairvoyant",
  "White-Violet": "Enlightener",
};

export function getAuraArchetype(primaryColor: AuraColor, secondaryColor: AuraColor | null): string {
  const templateKey = getAuraTemplateKey(primaryColor, secondaryColor && secondaryColor !== primaryColor ? secondaryColor : null);
  return AURA_TEMPLATE_ARCHETYPES[templateKey] || AURA_COLORS[primaryColor].archetype;
}

export const AURA_QUESTIONS: AuraQuestion[] = [
  {
    id: "q1",
    question: "When you walk into a new room, what do you notice first?",
    options: [
      { id: "a", label: "The mood and emotional tension in the space", points: { Blue: 2, Green: 1 } },
      { id: "b", label: "Where to sit, what to do, and how things are arranged", points: { Yellow: 2, Red: 1 } },
      { id: "c", label: "The beauty, colors, lighting, and creative details", points: { Orange: 2, Violet: 1 } },
      { id: "d", label: "The deeper vibe, hidden meaning, or unspoken energy", points: { Indigo: 2, White: 1 } },
    ],
  },
  {
    id: "q2",
    question: "What helps you feel most like yourself again?",
    options: [
      { id: "a", label: "Movement, action, or completing something practical", points: { Red: 2, Yellow: 1 } },
      { id: "b", label: "A calm conversation with someone who understands", points: { Blue: 2, Green: 1 } },
      { id: "c", label: "Solitude, reflection, prayer, meditation, or journaling", points: { White: 2, Violet: 1 } },
      { id: "d", label: "Learning something, planning, or finding a clear answer", points: { Yellow: 2, Indigo: 1 } },
    ],
  },
  {
    id: "q3",
    question: "Which compliment feels most true to you?",
    options: [
      { id: "a", label: "You are strong and dependable", points: { Red: 2, Green: 1 } },
      { id: "b", label: "You are magnetic and creative", points: { Orange: 2, Violet: 1 } },
      { id: "c", label: "You are wise and intuitive", points: { Indigo: 2, White: 1 } },
      { id: "d", label: "You are bright and uplifting", points: { Yellow: 2, Orange: 1 } },
    ],
  },
  {
    id: "q4",
    question: "Under stress, what is your usual pattern?",
    options: [
      { id: "a", label: "I take control and try to fix the situation immediately", points: { Red: 2, Yellow: 1 } },
      { id: "b", label: "I become emotional and need warmth or reassurance", points: { Green: 2, Orange: 1 } },
      { id: "c", label: "I go quiet and process everything privately", points: { Indigo: 2, White: 1 } },
      { id: "d", label: "I feel overwhelmed and need peace, space, and silence", points: { White: 2, Violet: 1 } },
    ],
  },
  {
    id: "q5",
    question: "What kind of work naturally pulls your attention?",
    options: [
      { id: "a", label: "Building, leading, selling, organizing, or making things happen", points: { Red: 2, Yellow: 1 } },
      { id: "b", label: "Creating, designing, performing, styling, or connecting with people", points: { Orange: 2, Violet: 1 } },
      { id: "c", label: "Teaching, writing, counseling, healing, or helping people feel understood", points: { Blue: 2, Green: 1 } },
      { id: "d", label: "Research, strategy, spirituality, psychology, or deep problem solving", points: { Indigo: 2, White: 1 } },
    ],
  },
  {
    id: "q6",
    question: "What do people often come to you for?",
    options: [
      { id: "a", label: "Protection, practical help, or decisive advice", points: { Red: 2, Green: 1 } },
      { id: "b", label: "Fun, motivation, ideas, or confidence", points: { Orange: 2, Yellow: 1 } },
      { id: "c", label: "Emotional support, listening, or honest communication", points: { Blue: 2, Green: 1 } },
      { id: "d", label: "Spiritual insight, pattern reading, or a deeper perspective", points: { Indigo: 2, Violet: 1 } },
    ],
  },
  {
    id: "q7",
    question: "Which environment feels most nourishing?",
    options: [
      { id: "a", label: "A grounded, warm space with good food, comfort, and routine", points: { Red: 2, Green: 1 } },
      { id: "b", label: "A lively, beautiful place with music, color, and expression", points: { Orange: 2, Yellow: 1 } },
      { id: "c", label: "A quiet, clean space where I can think and breathe", points: { White: 2, Blue: 1 } },
      { id: "d", label: "A mystical, artistic, or meaningful space with depth", points: { Violet: 2, Indigo: 1 } },
    ],
  },
  {
    id: "q8",
    question: "In love, what do you need most?",
    options: [
      { id: "a", label: "Loyalty, effort, and consistency", points: { Red: 2, Green: 1 } },
      { id: "b", label: "Playfulness, chemistry, and shared experiences", points: { Orange: 2, Yellow: 1 } },
      { id: "c", label: "Honest communication and emotional safety", points: { Blue: 2, Green: 1 } },
      { id: "d", label: "Soul connection, privacy, and deep understanding", points: { Indigo: 2, Violet: 1 } },
    ],
  },
  {
    id: "q9",
    question: "Which inner challenge are you learning to balance?",
    options: [
      { id: "a", label: "Patience and softness", points: { White: 2, Blue: 1 } },
      { id: "b", label: "Focus and consistency", points: { Yellow: 2, White: 1 } },
      { id: "c", label: "Boundaries and receiving support", points: { Green: 2, White: 1 } },
      { id: "d", label: "Grounding my intuition into real action", points: { Violet: 2, Indigo: 1 } },
    ],
  },
  {
    id: "q10",
    question: "How do you usually make important decisions?",
    options: [
      { id: "a", label: "I trust action, facts, and what feels practical", points: { Yellow: 2, Red: 1 } },
      { id: "b", label: "I follow what feels alive, exciting, and emotionally true", points: { Green: 2, Orange: 1 } },
      { id: "c", label: "I talk it through and listen for inner calm", points: { Blue: 2, White: 1 } },
      { id: "d", label: "I wait for a deeper knowing or pattern to become clear", points: { Indigo: 2, Violet: 1 } },
    ],
  },
  {
    id: "q11",
    question: "Which version of you feels most natural?",
    options: [
      { id: "a", label: "The protector who gets things done", points: { Red: 2, Green: 1 } },
      { id: "b", label: "The creator who brings joy and color", points: { Orange: 2, Yellow: 1 } },
      { id: "c", label: "The listener who brings peace and truth", points: { Blue: 2, White: 1 } },
      { id: "d", label: "The seeker who senses what others miss", points: { Violet: 2, Indigo: 1 } },
    ],
  },
  {
    id: "q12",
    question: "What do you want your next chapter to feel like?",
    options: [
      { id: "a", label: "Powerful, stable, and financially secure", points: { Yellow: 2, Red: 1 } },
      { id: "b", label: "Creative, romantic, joyful, and expressive", points: { Orange: 2, Violet: 1 } },
      { id: "c", label: "Peaceful, loving, healthy, and emotionally honest", points: { Green: 2, Blue: 1 } },
      { id: "d", label: "Aligned, spiritual, intuitive, and deeply meaningful", points: { Violet: 2, Indigo: 1 } },
    ],
  },
];

export const AURA_COLOR_ORDER: AuraColor[] = ["Red", "Orange", "Yellow", "Green", "Blue", "Indigo", "Violet", "White"];

function emptyScores(): Record<AuraColor, number> {
  return AURA_COLOR_ORDER.reduce((acc, color) => {
    acc[color] = 0;
    return acc;
  }, {} as Record<AuraColor, number>);
}

function normalizeAnswers(answers: AuraAnswer[]): AuraAnswer[] {
  return answers.map((answer) => ({
    questionId: String(answer.questionId || "").trim(),
    optionId: String(answer.optionId || "").trim(),
  }));
}

export function computeAuraResult(answers: AuraAnswer[]): AuraReportResult {
  const normalized = normalizeAnswers(answers);
  const scores = emptyScores();

  for (const question of AURA_QUESTIONS) {
    const answer = normalized.find((candidate) => candidate.questionId === question.id);
    if (!answer) {
      throw new Error(`Missing answer for ${question.id}`);
    }

    const option = question.options.find((candidate) => candidate.id === answer.optionId);
    if (!option) {
      throw new Error(`Invalid answer for ${question.id}`);
    }

    for (const [color, value] of Object.entries(option.points) as [AuraColor, number][]) {
      scores[color] += value;
    }
  }

  const ranked = [...AURA_COLOR_ORDER].sort((a, b) => scores[b] - scores[a]);
  const primaryColor = ranked[0];
  const secondaryCandidate = ranked[1];
  const primaryScore = scores[primaryColor];
  const secondaryScore = scores[secondaryCandidate];
  const secondaryColor = primaryScore - secondaryScore <= 2 ? secondaryCandidate : null;

  const secondary = secondaryColor ? AURA_COLORS[secondaryColor] : null;
  const totalPoints = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const share = totalPoints > 0 ? primaryScore / totalPoints : 0;
  const spread = primaryScore - secondaryScore;
  const confidence = Math.max(68, Math.min(94, Math.round(72 + share * 40 + spread * 2)));

  if (!secondary) {
    return {
      ...buildAuraReportTemplate(primaryColor, null),
      confidence,
      scores,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    ...buildAuraReportTemplate(primaryColor, secondaryColor),
    confidence,
    scores,
    generatedAt: new Date().toISOString(),
  };
}

export function getAuraTemplateKey(primaryColor: AuraColor, secondaryColor: AuraColor | null): string {
  return secondaryColor ? `${primaryColor}-${secondaryColor}` : primaryColor;
}

export function buildAuraReportTemplate(
  primaryColor: AuraColor,
  secondaryColor: AuraColor | null
): Omit<AuraReportResult, "confidence" | "scores" | "generatedAt"> {
  const primary = AURA_COLORS[primaryColor];
  const secondary = secondaryColor ? AURA_COLORS[secondaryColor] : null;

  if (!secondary) {
    return {
      colorName: primary.title,
      energySignature: primary.shortMeaning,
      primaryColor,
      secondaryColor: null,
      auraArchetype: getAuraArchetype(primaryColor, null),
      overview: `${primary.energySignature} This aura points to a personality that becomes strongest when your daily life supports your natural rhythm instead of forcing you to imitate someone else's pace. Your energy is most attractive when it is simple, honest, and allowed to move without unnecessary performance.`,
      coreQualities: primary.coreQualities,
      strengths: [
        ...primary.strengths,
        `Your ${primaryColor} aura gives you a recognizable presence; people often know where they stand with you because your energy does not hide its truth for long.`,
        "You can become a stabilizing force when you choose environments that respect your natural pace.",
      ],
      growthAreas: [
        ...primary.growthAreas,
        "Your growth comes from noticing when your strongest gift has become your default defense.",
        "You may need to practice pausing before reacting, especially when your nervous system is already carrying old pressure.",
      ],
      relationships: `${primary.relationships} Your deeper relationship lesson is to let love meet the real version of you, not only the useful, impressive, or easy-to-understand version. When you feel safe, your aura becomes warmer and more generous; when you feel tested, it can become protective very quickly.`,
      workAndPurpose: `${primary.workAndPurpose} You do best when your work gives your energy a clear container: a mission, a rhythm, a responsibility, or a creative direction. Without that container, the same aura strength can turn into restlessness or self-doubt.`,
      emotionalPattern: `Emotionally, a ${primary.title.toLowerCase()} tends to process life through ${primary.shortMeaning.toLowerCase()}. You may not always explain what you feel immediately, but your body and behavior reveal it. The more you respect your emotional signals early, the less likely they are to turn into overwhelm.`,
      spiritualLesson: `Your spiritual lesson is to use your ${primaryColor.toLowerCase()} energy consciously. This means trusting your natural gifts without letting them become the only way you survive, love, work, or protect yourself.`,
      shadowPattern: `The shadow of this aura can appear when ${primary.growthAreas[0].toLowerCase()} When this happens, your energy may feel tight, reactive, or drained. The medicine is not to reject your aura color, but to bring it back into balance.`,
      energyCare: [
        ...primary.energyCare,
        "Notice which people leave your body relaxed and which people make you brace.",
        "Do one weekly reset where your space, schedule, and emotional commitments are simplified.",
      ],
      affirmation: primary.affirmation,
    };
  }

  return {
    colorName: `${primaryColor}-${secondaryColor} Aura`,
    primaryColor,
    secondaryColor,
    auraArchetype: getAuraArchetype(primaryColor, secondaryColor),
    overview: `Your aura reads as a blended ${primaryColor}-${secondaryColor} field. ${primary.energySignature} At the same time, ${secondary.energySignature.toLowerCase()} This blend suggests you are not one-note; your energy changes depending on safety, purpose, and the people around you. Your primary color shows your strongest visible pattern, while the secondary color reveals the energy that appears when you feel emotionally open or creatively engaged.`,
    energySignature: `${primary.shortMeaning} with ${secondary.shortMeaning.toLowerCase()}`,
    coreQualities: [...new Set([...primary.coreQualities.slice(0, 4), ...secondary.coreQualities.slice(0, 3)])],
    strengths: [
      primary.strengths[0],
      primary.strengths[1],
      secondary.strengths[0],
      secondary.strengths[1],
      "Your blend lets you respond to life through more than one kind of intelligence.",
      `The ${primaryColor} side gives your aura direction, while the ${secondaryColor} side adds nuance, texture, and emotional range.`,
    ],
    growthAreas: [
      primary.growthAreas[0],
      primary.growthAreas[1],
      secondary.growthAreas[0],
      secondary.growthAreas[1],
      "You may feel inconsistent when your two strongest energies want different speeds or forms of expression.",
      "Your growth comes from learning which color needs to lead in each situation instead of forcing one response for everything.",
    ],
    relationships: `${primary.relationships} Your ${secondaryColor} influence adds another layer: ${secondary.relationships.toLowerCase()}`,
    workAndPurpose: `${primary.workAndPurpose} Your ${secondaryColor} side also supports ${secondary.workAndPurpose.toLowerCase()}`,
    emotionalPattern: `Emotionally, your ${primaryColor}-${secondaryColor} blend can move between ${primary.shortMeaning.toLowerCase()} and ${secondary.shortMeaning.toLowerCase()}. This gives you range, but it can also make your inner world feel hard to explain. You may need different kinds of support depending on which side of the aura is active.`,
    spiritualLesson: `Your spiritual lesson is integration. The ${primaryColor} part of you wants to lead through its natural strength, while the ${secondaryColor} part asks for a different kind of honesty. When both are respected, your aura becomes more magnetic and less conflicted.`,
    shadowPattern: `The shadow of this blend can appear when ${primary.growthAreas[0].toLowerCase()} or when ${secondary.growthAreas[0].toLowerCase()} Instead of judging the contradiction, treat it as a signal that one part of your energy needs attention.`,
    energyCare: [
      ...primary.energyCare.slice(0, 3),
      ...secondary.energyCare.slice(0, 3),
      "Before saying yes, ask which part of your aura is responding: the part that feels aligned or the part that feels pressured.",
    ],
    affirmation: `${primary.affirmation} ${secondary.affirmation}`,
  };
}

export function serializeAuraAnswers(answerMap: Record<string, string>): AuraAnswer[] {
  return AURA_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: answerMap[question.id] || "",
  }));
}

export function formatAuraAnswersForStorage(answers: AuraAnswer[]): AuraStoredAnswer[] {
  const normalized = normalizeAnswers(answers);

  return AURA_QUESTIONS.map((question) => {
    const answer = normalized.find((candidate) => candidate.questionId === question.id);
    const option = question.options.find((candidate) => candidate.id === answer?.optionId);

    if (!option) {
      throw new Error(`Invalid answer for ${question.id}`);
    }

    return {
      question: question.question,
      answer: option.label,
      points: option.points,
    };
  });
}
