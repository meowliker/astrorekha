export type LayoutVariant = "A" | "B";

export type SketchQuestionId =
  | "attracted_to"
  | "appearance"
  | "age_group"
  | "vibe"
  | "connection_type"
  | "energy_type"
  | "love_signal"
  | "relationship_feel"
  | "main_worry"
  | "future_goal";

export interface SketchQuestionOption {
  value: string;
  label: string;
  emoji: string;
}

export interface SketchQuestion {
  id: SketchQuestionId;
  title: string;
  options: SketchQuestionOption[];
}

export interface LayoutBFunnelConfig {
  testId: string;
  enabled: boolean;
  layoutBEnabled: boolean;
  variantAWeight: number;
  variantBWeight: number;
  maxSketchPerUser: number;
  questionOrder: SketchQuestionId[];
  questions: Record<SketchQuestionId, boolean>;
}

export const SKETCH_QUESTION_BANK: SketchQuestion[] = [
  {
    id: "attracted_to",
    title: "Who are you attracted to?",
    options: [
      { value: "male", label: "Male", emoji: "👨" },
      { value: "female", label: "Female", emoji: "👩" },
      { value: "any", label: "Any", emoji: "✨" },
    ],
  },
  {
    id: "appearance",
    title: "What appearance are you imagining?",
    options: [
      { value: "caucasian", label: "Caucasian / White", emoji: "👱" },
      { value: "hispanic", label: "Hispanic / Latino", emoji: "🧑" },
      { value: "african", label: "African / African-American", emoji: "🧑🏿" },
      { value: "asian", label: "Asian", emoji: "👦" },
      { value: "indian", label: "Indian / South Asian", emoji: "🧑🏽" },
      { value: "any", label: "Any", emoji: "🤗" },
    ],
  },
  {
    id: "age_group",
    title: "Which age group is your perfect match?",
    options: [
      { value: "20-25", label: "20-25", emoji: "🧒" },
      { value: "25-30", label: "25-30", emoji: "🧑" },
      { value: "30-35", label: "30-35", emoji: "🧑‍💼" },
      { value: "35-40", label: "35-40", emoji: "🧔" },
      { value: "40-45", label: "40-45", emoji: "👨‍🦱" },
      { value: "45-50", label: "45-50", emoji: "👨‍🦳" },
      { value: "50+", label: "50+", emoji: "🧓" },
    ],
  },
  {
    id: "vibe",
    title: "What vibe do you want your soulmate to have?",
    options: [
      { value: "cute", label: "Cute", emoji: "😊" },
      { value: "bold", label: "Bold", emoji: "⚡" },
      { value: "elegant", label: "Elegant", emoji: "✨" },
      { value: "mysterious", label: "Mysterious", emoji: "🌙" },
    ],
  },
  {
    id: "connection_type",
    title: "What kind of connection are you looking for?",
    options: [
      { value: "partnership", label: "Partnership", emoji: "🤝" },
      { value: "friendship", label: "Friendship", emoji: "💛" },
      { value: "adventure", label: "Adventure", emoji: "🌍" },
      { value: "emotional_depth", label: "Emotional Depth", emoji: "💖" },
      { value: "mutual_growth", label: "Mutual Growth", emoji: "🌱" },
    ],
  },
  {
    id: "energy_type",
    title: "Are you more drawn to similar or opposite energy?",
    options: [
      { value: "similar", label: "Similar energy", emoji: "✨" },
      { value: "opposite", label: "Opposite energy", emoji: "💥" },
    ],
  },
  {
    id: "love_signal",
    title: "What love signal means the most to you?",
    options: [
      { value: "heartfelt_words", label: "Heartfelt words", emoji: "💌" },
      { value: "helpful_gestures", label: "Helpful gestures", emoji: "🙌" },
      { value: "physical_affection", label: "Physical affection", emoji: "💑" },
      { value: "meaningful_presents", label: "Meaningful presents", emoji: "💝" },
      { value: "time_well_spent", label: "Time well spent", emoji: "🕰️" },
    ],
  },
  {
    id: "relationship_feel",
    title: "How do you want your relationship to feel?",
    options: [
      { value: "close", label: "Close and meaningful", emoji: "🤝" },
      { value: "playful", label: "Exciting and playful", emoji: "🎢" },
      { value: "harmonious", label: "Harmonious and strong", emoji: "🕊️" },
      { value: "passionate", label: "Full of passion and energy", emoji: "🔥" },
      { value: "secure", label: "Grounded and secure", emoji: "🔐" },
      { value: "growing", label: "Growing together", emoji: "🌱" },
      { value: "something_else", label: "Something else", emoji: "✨" },
    ],
  },
  {
    id: "main_worry",
    title: "Your main worry when it comes to love?",
    options: [
      { value: "broken_trust", label: "Broken trust", emoji: "🥀" },
      { value: "emotional_distance", label: "Emotional distance", emoji: "🧊" },
      { value: "lack_understanding", label: "Lack of understanding", emoji: "❓" },
      { value: "commitment_issues", label: "Commitment issues", emoji: "🔒" },
      { value: "fear_opening_up", label: "Fear of opening up", emoji: "🛡️" },
      { value: "heartbreak", label: "Heartbreak", emoji: "💔" },
      { value: "something_else", label: "Something else", emoji: "🎭" },
    ],
  },
  {
    id: "future_goal",
    title: "What’s the future you hope to create together?",
    options: [
      { value: "family_life", label: "Peaceful family life", emoji: "🏡" },
      { value: "adventures", label: "Adventures around the globe", emoji: "🌍" },
      { value: "grow_together", label: "Growing together", emoji: "🌱" },
      { value: "financial_security", label: "Financially secure", emoji: "💰" },
      { value: "change_world", label: "Changing the world", emoji: "🌟" },
    ],
  },
];

export const DEFAULT_LAYOUT_B_CONFIG: LayoutBFunnelConfig = {
  testId: "onboarding-layout-qa",
  enabled: true,
  layoutBEnabled: true,
  variantAWeight: 50,
  variantBWeight: 50,
  maxSketchPerUser: 1,
  questionOrder: [
    "attracted_to",
    "age_group",
    "vibe",
    "main_worry",
    "future_goal",
  ],
  questions: {
    attracted_to: true,
    appearance: false,
    age_group: true,
    vibe: true,
    connection_type: true,
    energy_type: false,
    love_signal: true,
    relationship_feel: false,
    main_worry: true,
    future_goal: true,
  },
};

export function normalizeLayoutBConfig(raw: any): LayoutBFunnelConfig {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const questions = {
    ...DEFAULT_LAYOUT_B_CONFIG.questions,
    ...(cfg.questions || {}),
  };

  const validOrder = Array.isArray(cfg.questionOrder)
    ? cfg.questionOrder.filter((id: unknown): id is SketchQuestionId =>
        typeof id === "string" && SKETCH_QUESTION_BANK.some((q) => q.id === id)
      )
    : [];

  const questionOrder = validOrder.length > 0 ? validOrder : DEFAULT_LAYOUT_B_CONFIG.questionOrder;

  return {
    ...DEFAULT_LAYOUT_B_CONFIG,
    ...cfg,
    variantAWeight: Number(cfg.variantAWeight ?? DEFAULT_LAYOUT_B_CONFIG.variantAWeight) || 50,
    variantBWeight: Number(cfg.variantBWeight ?? DEFAULT_LAYOUT_B_CONFIG.variantBWeight) || 50,
    maxSketchPerUser: Number(cfg.maxSketchPerUser ?? DEFAULT_LAYOUT_B_CONFIG.maxSketchPerUser) || 1,
    questionOrder,
    questions,
  };
}

export function getActiveSketchQuestions(config: LayoutBFunnelConfig): SketchQuestion[] {
  const byId = new Map(SKETCH_QUESTION_BANK.map((q) => [q.id, q]));
  return config.questionOrder
    .filter((id) => id !== "appearance")
    .filter((id) => config.questions[id] !== false)
    .map((id) => byId.get(id))
    .filter((q): q is SketchQuestion => !!q);
}
