export const WITCH_SCORING_VERSION = "witch-archetype-v1";

export const WITCH_TRAITS = ["intuition", "care", "creation", "courage", "grounding", "renewal"] as const;
export type WitchTrait = (typeof WITCH_TRAITS)[number];
export type WitchKey = "moon_seer" | "hearth_keeper" | "wild_alchemist" | "star_weaver" | "threshold_guardian" | "earth_oracle";

export const WITCH_TRAIT_LABELS: Record<WitchTrait, string> = {
  intuition: "Intuition", care: "Care", creation: "Creation", courage: "Courage", grounding: "Grounding", renewal: "Renewal",
};

export interface WitchOption { id: string; text: string; trait: WitchTrait }
export interface WitchQuestion { id: string; prompt: string; note: string; options: WitchOption[] }

function question(id: string, prompt: string, note: string, responses: Record<WitchTrait, string>): WitchQuestion {
  return { id, prompt, note, options: WITCH_TRAITS.map((trait) => ({ id: `${id}-${trait}`, text: responses[trait], trait })) };
}

export const WITCH_QUESTIONS: WitchQuestion[] = [
  question("q1", "You find an unmarked door in a familiar place. What draws you in?", "Choose the first thought that feels like yours.", {
    intuition: "The feeling that it appeared for a reason", care: "Wondering who might need help on the other side", creation: "Imagining what I could make of the space", courage: "The chance to step through before doubt arrives", grounding: "Looking for a safe, practical way to explore", renewal: "The possibility that something new begins there",
  }),
  question("q2", "Someone you love is at a crossroads. What do you offer?", "Think about what you actually do, not what sounds ideal.", {
    intuition: "A question that helps them hear their own answer", care: "A place to speak without being judged", creation: "An unexpected option they have not considered", courage: "A reminder that they can make the hard choice", grounding: "Help with the next concrete step", renewal: "Permission to let an old chapter end",
  }),
  question("q3", "A plan you cared about falls apart. Your first response is to…", "There is no correct way to respond.", {
    intuition: "Pause and notice what this change is revealing", care: "Check in on everyone affected", creation: "Rebuild it in a more interesting form", courage: "Make a new decision quickly", grounding: "Protect what still works and start there", renewal: "Release the plan and look for the opening",
  }),
  question("q4", "Which kind of ritual would you keep?", "A ritual can be entirely ordinary.", {
    intuition: "Quiet reflection at night", care: "Sharing food and listening closely", creation: "Making something with my hands", courage: "A small act that pushes me beyond fear", grounding: "A morning routine that steadies me", renewal: "Marking endings and fresh starts",
  }),
  question("q5", "What do people tend to seek you out for?", "Choose the role you fall into naturally.", {
    intuition: "Seeing the pattern beneath the problem", care: "Feeling understood and held", creation: "Fresh ideas and unusual connections", courage: "Honesty when a choice feels difficult", grounding: "Dependability when life gets messy", renewal: "Help moving beyond what no longer fits",
  }),
  question("q6", "You are given a free afternoon. Where do you go?", "Follow the place that feels most restorative.", {
    intuition: "Somewhere quiet enough to hear my thoughts", care: "To someone whose company feels like home", creation: "To a studio, kitchen, notebook, or project", courage: "Somewhere I have never been", grounding: "Into nature, with nowhere to rush", renewal: "To clear space and begin again",
  }),
  question("q7", "What feels like a kind of power to you?", "Think of power as a quality, not a title.", {
    intuition: "Knowing when to trust a subtle signal", care: "Making someone feel safe enough to grow", creation: "Turning an idea into something real", courage: "Speaking up even when my voice shakes", grounding: "Remaining steady through uncertainty", renewal: "Changing without abandoning myself",
  }),
  question("q8", "When you feel stuck, what moves you forward?", "Pick what has helped in real life.", {
    intuition: "Silence until the next step becomes clearer", care: "A meaningful conversation", creation: "Trying a new way to express the problem", courage: "Taking one brave action", grounding: "Breaking it into manageable pieces", renewal: "Letting go of the version that is finished",
  }),
  question("q9", "Which sentence would you want to remember this year?", "Choose the one you need most today.", {
    intuition: "Listen to what you already know", care: "Your tenderness can have boundaries", creation: "Make the thing only you can make", courage: "You can begin before you feel ready", grounding: "Slow growth is still growth", renewal: "You may become someone new",
  }),
];

export interface WitchProfile {
  key: WitchKey;
  name: string;
  subtitle: string;
  symbol: string;
  primary: WitchTrait;
  secondary: WitchTrait;
  color: string;
  summary: string;
  gift: string;
  blindSpot: string;
  relationships: string;
  work: string;
  practice: string;
  reflection: string;
}

export const WITCH_PROFILES: Record<WitchKey, WitchProfile> = {
  moon_seer: { key: "moon_seer", name: "Moon Seer", subtitle: "The quiet reader of patterns", symbol: "☾", primary: "intuition", secondary: "creation", color: "#B6AAFF", summary: "You notice what shifts beneath the surface and give shape to what others can only sense.", gift: "Your gift is perceptive imagination. You connect subtle clues, feelings, and possibilities into a new perspective.", blindSpot: "A strong inner signal can become overthinking when you wait for perfect certainty. Check your intuition against what you can observe.", relationships: "You connect through honesty, emotional depth, and room to think. Saying what you sense out loud helps people meet you where you are.", work: "You thrive when insight becomes a tangible idea: writing, research, design, strategy, or thoughtful guidance.", practice: "Write down one hunch, one piece of evidence, and one small action. Revisit it after a week.", reflection: "What have you sensed for a while but not yet found words for?" },
  hearth_keeper: { key: "hearth_keeper", name: "Hearth Keeper", subtitle: "The maker of safe places", symbol: "✺", primary: "care", secondary: "grounding", color: "#F0BE8B", summary: "You make warmth practical. People feel steadier because you turn attention into dependable care.", gift: "Your gift is sustained presence. You see what someone needs and help create a place where growth is possible.", blindSpot: "Care can become overgiving when you feel responsible for everyone. Your own needs deserve the same attention.", relationships: "You show love in consistent actions. Letting others care for you makes your bonds more equal and resilient.", work: "You shine in roles that build trust and continuity: teaching, hospitality, operations, care, or community work.", practice: "Choose one small act of care for yourself before offering the same energy outward.", reflection: "Where does kindness need a clearer boundary?" },
  wild_alchemist: { key: "wild_alchemist", name: "Wild Alchemist", subtitle: "The brave transformer", symbol: "✦", primary: "renewal", secondary: "courage", color: "#E2A1BC", summary: "You can feel when a chapter is ending, and you have the nerve to begin another.", gift: "Your gift is conscious change. You turn a difficult threshold into movement and invite others to imagine life after it.", blindSpot: "A fresh start can be tempting before the old story has been understood. Let change include integration, not only departure.", relationships: "You need honesty and room to evolve. Tell the people close to you what is changing while it is happening.", work: "You do well in transformation, creative ventures, crisis response, and work that asks for reinvention.", practice: "Name one thing to release, one lesson to keep, and one deliberate next step.", reflection: "What are you ready to change without having to erase?" },
  star_weaver: { key: "star_weaver", name: "Star Weaver", subtitle: "The maker of possibility", symbol: "✧", primary: "creation", secondary: "renewal", color: "#9FCDE8", summary: "You see the shape of what could be and bring people into the act of making it real.", gift: "Your gift is imaginative renewal. You combine unlikely ideas into something useful, beautiful, or unexpectedly hopeful.", blindSpot: "New ideas can multiply faster than you can finish them. A clear constraint can protect your best work.", relationships: "You bring curiosity and possibility to your bonds. Follow-through helps others trust that your visions include them.", work: "You flourish in design, storytelling, entrepreneurship, education, and collaborative problem solving.", practice: "Choose one idea and give it a simple shape before starting another: a sketch, page, prototype, or conversation.", reflection: "Which idea deserves your attention long enough to become real?" },
  threshold_guardian: { key: "threshold_guardian", name: "Threshold Guardian", subtitle: "The courageous protector", symbol: "◇", primary: "courage", secondary: "care", color: "#E5C788", summary: "You step forward when something precious needs protection, and your boldness is rooted in care.", gift: "Your gift is principled action. You can make a hard choice and help others feel safer doing the same.", blindSpot: "Protecting others can make you carry too much. Ask whether a boundary, a conversation, or shared responsibility would serve better.", relationships: "You are loyal and direct. Listening before acting makes your protection feel like partnership.", work: "You fit roles that need advocacy, leadership, conflict resolution, and responsible decisions under pressure.", practice: "Before a difficult action, write the value you are protecting and the gentlest effective next step.", reflection: "What deserves your courage right now, and what does not require a fight?" },
  earth_oracle: { key: "earth_oracle", name: "Earth Oracle", subtitle: "The steady intuitive", symbol: "✳", primary: "grounding", secondary: "intuition", color: "#B9D7AE", summary: "Your wisdom grows through attention, patience, and trust in what time reveals.", gift: "Your gift is grounded discernment. You notice subtle signals while remaining rooted in what can be done today.", blindSpot: "Waiting for the perfect moment can become a way to avoid movement. A small experiment can teach you more than another season of planning.", relationships: "You offer calm and reliability. Let others see the feelings underneath your steady surface.", work: "You suit research, craft, care, stewardship, planning, and work where sound judgment compounds over time.", practice: "Take a short walk, note one thing you observed, and turn it into one practical choice.", reflection: "What quiet truth has become clear through repetition?" },
};

const PROFILE_ORDER: WitchKey[] = ["moon_seer", "hearth_keeper", "wild_alchemist", "star_weaver", "threshold_guardian", "earth_oracle"];

export interface WitchResult {
  version: string;
  key: WitchKey;
  scores: Record<WitchTrait, number>;
  topTraits: WitchTrait[];
  explanation: string;
  generatedAt: string;
}

export function scoreWitchAnswers(answers: Record<string, string>, generatedAt = new Date().toISOString()): WitchResult {
  const scores = Object.fromEntries(WITCH_TRAITS.map((trait) => [trait, 0])) as Record<WitchTrait, number>;
  for (const item of WITCH_QUESTIONS) {
    const option = item.options.find((choice) => choice.id === answers[item.id]);
    if (!option) throw new Error(`Choose an answer for question ${item.id.slice(1)}.`);
    scores[option.trait] += 1;
  }
  const ranked = [...WITCH_TRAITS].sort((a, b) => scores[b] - scores[a] || WITCH_TRAITS.indexOf(a) - WITCH_TRAITS.indexOf(b));
  const ranking = PROFILE_ORDER.map((key, order) => ({ key, order, points: scores[WITCH_PROFILES[key].primary] * 2 + scores[WITCH_PROFILES[key].secondary] }))
    .sort((a, b) => b.points - a.points || scores[WITCH_PROFILES[b.key].primary] - scores[WITCH_PROFILES[a.key].primary] || a.order - b.order);
  const key = ranking[0].key;
  const profile = WITCH_PROFILES[key];
  return {
    version: WITCH_SCORING_VERSION, key, scores, topTraits: ranked.filter((trait) => scores[trait] > 0).slice(0, 2), generatedAt,
    explanation: scores[ranked[1]] > 0
      ? `Your choices leaned most toward ${WITCH_TRAIT_LABELS[ranked[0]].toLowerCase()} and ${WITCH_TRAIT_LABELS[ranked[1]].toLowerCase()}. ${profile.name} pairs ${WITCH_TRAIT_LABELS[profile.primary].toLowerCase()} with ${WITCH_TRAIT_LABELS[profile.secondary].toLowerCase()}; those two scores formed your strongest archetype match.`
      : `Every choice you made leaned toward ${WITCH_TRAIT_LABELS[ranked[0]].toLowerCase()}. ${profile.name} is the strongest match for that quality in this set of archetypes.`,
  };
}

export function isWitchResult(value: unknown): value is WitchResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WitchResult>;
  return candidate.version === WITCH_SCORING_VERSION
    && typeof candidate.key === "string" && candidate.key in WITCH_PROFILES
    && !!candidate.scores && WITCH_TRAITS.every((trait) => Number.isInteger(candidate.scores?.[trait]) && (candidate.scores?.[trait] ?? -1) >= 0)
    && Array.isArray(candidate.topTraits) && candidate.topTraits.length > 0 && candidate.topTraits.length <= 2
    && candidate.topTraits.every((trait) => WITCH_TRAITS.includes(trait))
    && typeof candidate.explanation === "string"
    && typeof candidate.generatedAt === "string";
}
