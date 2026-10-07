import { assetUrl } from "./assets";

export const SPIRIT_TRAITS = [
  "courage",
  "connection",
  "intuition",
  "adaptability",
  "grounding",
  "transformation",
] as const;

export type SpiritTrait = (typeof SPIRIT_TRAITS)[number];

export const SPIRIT_ANIMAL_KEYS = [
  "lion",
  "bear",
  "eagle",
  "horse",
  "wolf",
  "elephant",
  "dolphin",
  "owl",
  "snake",
  "fox",
  "butterfly",
  "deer",
] as const;

export type SpiritAnimalKey = (typeof SPIRIT_ANIMAL_KEYS)[number];

export function isSpiritAnimalKey(value: unknown): value is SpiritAnimalKey {
  return typeof value === "string" && SPIRIT_ANIMAL_KEYS.includes(value as SpiritAnimalKey);
}

export const SPIRIT_ANIMAL_IMAGE_URLS: Partial<Record<SpiritAnimalKey, string>> = {
  lion: assetUrl("/lion.png"),
  bear: assetUrl("/bear.png"),
  eagle: assetUrl("/eagle.png?v=9a946126"),
  horse: assetUrl("/horse.png"),
  wolf: assetUrl("/wolf.png"),
  elephant: assetUrl("/elephant.png"),
  dolphin: assetUrl("/dolphin.png"),
  owl: assetUrl("/owl.png"),
  snake: assetUrl("/snake.png"),
  fox: assetUrl("/fox.png"),
  butterfly: assetUrl("/butterfly.png"),
  deer: assetUrl("/deer.png"),
};

export interface SpiritAnimalProfile {
  key: SpiritAnimalKey;
  name: string;
  emoji: string;
  archetype: string;
  element: "Fire" | "Earth" | "Air" | "Water";
  weights: Record<SpiritTrait, 0 | 1 | 2>;
}

const weights = (
  primary: [SpiritTrait, SpiritTrait],
  secondary: [SpiritTrait, SpiritTrait]
): Record<SpiritTrait, 0 | 1 | 2> =>
  Object.fromEntries(
    SPIRIT_TRAITS.map((trait) => [trait, primary.includes(trait) ? 2 : secondary.includes(trait) ? 1 : 0])
  ) as Record<SpiritTrait, 0 | 1 | 2>;

// Every animal has two primary and two secondary traits. Across the complete
// set, every trait appears exactly four times at each weight, keeping every
// animal profile on the same mathematical scale.
export const SPIRIT_ANIMALS: Record<SpiritAnimalKey, SpiritAnimalProfile> = {
  lion: { key: "lion", name: "Lion", emoji: "🦁", archetype: "The Courageous Guardian", element: "Fire", weights: weights(["courage", "connection"], ["grounding", "intuition"]) },
  bear: { key: "bear", name: "Bear", emoji: "🐻", archetype: "The Steady Protector", element: "Earth", weights: weights(["courage", "grounding"], ["connection", "transformation"]) },
  eagle: { key: "eagle", name: "Eagle", emoji: "🦅", archetype: "The Far-Seeing Pioneer", element: "Fire", weights: weights(["courage", "intuition"], ["adaptability", "transformation"]) },
  horse: { key: "horse", name: "Horse", emoji: "🐎", archetype: "The Free-Hearted Pathfinder", element: "Fire", weights: weights(["courage", "adaptability"], ["connection", "grounding"]) },
  wolf: { key: "wolf", name: "Wolf", emoji: "🐺", archetype: "The Instinctive Ally", element: "Water", weights: weights(["connection", "intuition"], ["adaptability", "transformation"]) },
  elephant: { key: "elephant", name: "Elephant", emoji: "🐘", archetype: "The Wise Keeper", element: "Earth", weights: weights(["connection", "grounding"], ["courage", "intuition"]) },
  dolphin: { key: "dolphin", name: "Dolphin", emoji: "🐬", archetype: "The Joyful Connector", element: "Water", weights: weights(["connection", "adaptability"], ["courage", "grounding"]) },
  owl: { key: "owl", name: "Owl", emoji: "🦉", archetype: "The Quiet Seer", element: "Air", weights: weights(["intuition", "grounding"], ["connection", "transformation"]) },
  snake: { key: "snake", name: "Snake", emoji: "🐍", archetype: "The Alchemist", element: "Water", weights: weights(["intuition", "transformation"], ["adaptability", "courage"]) },
  fox: { key: "fox", name: "Fox", emoji: "🦊", archetype: "The Resourceful Strategist", element: "Air", weights: weights(["adaptability", "transformation"], ["grounding", "intuition"]) },
  butterfly: { key: "butterfly", name: "Butterfly", emoji: "🦋", archetype: "The Graceful Renewer", element: "Air", weights: weights(["adaptability", "transformation"], ["connection", "courage"]) },
  deer: { key: "deer", name: "Deer", emoji: "🦌", archetype: "The Gentle Wayfinder", element: "Earth", weights: weights(["grounding", "transformation"], ["adaptability", "intuition"]) },
};

export const SPIRIT_ANIMAL_HERO_GRADIENTS: Record<SpiritAnimalKey, string> = {
  lion: "radial-gradient(circle at 50% 18%, rgba(234,88,12,0.48), transparent 38%), radial-gradient(circle at 85% 100%, rgba(245,158,11,0.24), transparent 46%), linear-gradient(145deg,#3f1605 0%,#251006 52%,#0A0E1A 100%)",
  bear: "radial-gradient(circle at 50% 18%, rgba(180,83,9,0.40), transparent 38%), radial-gradient(circle at 85% 100%, rgba(217,119,6,0.20), transparent 46%), linear-gradient(145deg,#32190d 0%,#21130d 52%,#0A0E1A 100%)",
  eagle: "radial-gradient(circle at 50% 18%, rgba(245,158,11,0.48), transparent 38%), radial-gradient(circle at 85% 100%, rgba(251,191,36,0.24), transparent 46%), linear-gradient(145deg,#3b1c08 0%,#24150c 52%,#0A0E1A 100%)",
  horse: "radial-gradient(circle at 50% 18%, rgba(180,83,9,0.42), transparent 38%), radial-gradient(circle at 85% 100%, rgba(234,88,12,0.20), transparent 46%), linear-gradient(145deg,#351708 0%,#21130c 52%,#0A0E1A 100%)",
  wolf: "radial-gradient(circle at 50% 15%, rgba(37,99,235,0.52), transparent 40%), radial-gradient(circle at 82% 100%, rgba(14,165,233,0.26), transparent 48%), linear-gradient(145deg,#061d4a 0%,#081a3b 52%,#050914 100%)",
  elephant: "radial-gradient(circle at 50% 18%, rgba(132,148,45,0.38), transparent 38%), radial-gradient(circle at 85% 100%, rgba(180,133,61,0.18), transparent 46%), linear-gradient(145deg,#263014 0%,#252012 52%,#0A0E1A 100%)",
  dolphin: "radial-gradient(circle at 50% 18%, rgba(6,182,212,0.44), transparent 38%), radial-gradient(circle at 85% 100%, rgba(59,130,246,0.24), transparent 46%), linear-gradient(145deg,#083344 0%,#0c1f46 52%,#0A0E1A 100%)",
  owl: "radial-gradient(circle at 50% 18%, rgba(168,111,68,0.40), transparent 38%), radial-gradient(circle at 85% 100%, rgba(194,154,105,0.18), transparent 46%), linear-gradient(145deg,#302017 0%,#211715 52%,#0A0E1A 100%)",
  snake: "radial-gradient(circle at 50% 18%, rgba(16,185,129,0.38), transparent 38%), radial-gradient(circle at 85% 100%, rgba(6,182,212,0.18), transparent 46%), linear-gradient(145deg,#06382d 0%,#082b35 52%,#0A0E1A 100%)",
  fox: "radial-gradient(circle at 50% 18%, rgba(234,88,12,0.50), transparent 38%), radial-gradient(circle at 85% 100%, rgba(249,115,22,0.24), transparent 46%), linear-gradient(145deg,#421204 0%,#2b1005 52%,#0A0E1A 100%)",
  butterfly: "radial-gradient(circle at 50% 18%, rgba(217,70,239,0.42), transparent 38%), radial-gradient(circle at 85% 100%, rgba(139,92,246,0.24), transparent 46%), linear-gradient(145deg,#3b0b45 0%,#261047 52%,#0A0E1A 100%)",
  deer: "radial-gradient(circle at 50% 18%, rgba(161,124,72,0.42), transparent 38%), radial-gradient(circle at 85% 100%, rgba(132,148,45,0.20), transparent 46%), linear-gradient(145deg,#302719 0%,#222515 52%,#0A0E1A 100%)",
};

export interface SpiritAnimalQuestionOption {
  id: string;
  label: string;
  primaryTrait: SpiritTrait;
  secondaryTrait: SpiritTrait;
}

export interface SpiritAnimalQuestion {
  id: string;
  prompt: string;
  context: string;
  options: SpiritAnimalQuestionOption[];
}

const TRAIT_INDEX: Record<SpiritTrait, number> = Object.fromEntries(
  SPIRIT_TRAITS.map((trait, index) => [trait, index])
) as Record<SpiritTrait, number>;

function buildOptions(
  questionId: string,
  secondaryOffset: number,
  labels: Record<SpiritTrait, string>
): SpiritAnimalQuestionOption[] {
  return SPIRIT_TRAITS.map((primaryTrait, index) => ({
    id: `${questionId}-${String.fromCharCode(97 + index)}`,
    label: labels[primaryTrait],
    primaryTrait,
    secondaryTrait: SPIRIT_TRAITS[(TRAIT_INDEX[primaryTrait] + secondaryOffset) % SPIRIT_TRAITS.length],
  }));
}

export const SPIRIT_ANIMAL_QUESTIONS: SpiritAnimalQuestion[] = [
  {
    id: "q1",
    prompt: "A plan suddenly falls apart. What do you do first?",
    context: "Choose the response that feels most natural, even if several sound good.",
    options: buildOptions("q1", 1, {
      courage: "Take charge and make the first decisive move",
      connection: "Bring everyone together and listen before acting",
      intuition: "Pause and follow the quiet signal I trust inside",
      adaptability: "Improvise quickly with whatever is available",
      grounding: "Stabilize the essentials and rebuild step by step",
      transformation: "Treat the disruption as a chance to begin differently",
    }),
  },
  {
    id: "q2",
    prompt: "Which role do you naturally take in a group?",
    context: "Think about what people rely on you for without asking.",
    options: buildOptions("q2", 2, {
      courage: "The one who speaks up when something matters",
      connection: "The one who notices who needs support",
      intuition: "The one who senses what is not being said",
      adaptability: "The one who can work with any personality",
      grounding: "The one who keeps promises and creates structure",
      transformation: "The one who helps the group see a new possibility",
    }),
  },
  {
    id: "q3",
    prompt: "What kind of challenge brings out your best?",
    context: "Choose what energizes you rather than what looks impressive.",
    options: buildOptions("q3", 3, {
      courage: "A difficult goal that asks me to be bold",
      connection: "A shared mission where trust matters",
      intuition: "A mystery with patterns hidden beneath the surface",
      adaptability: "A fast-changing situation with no fixed playbook",
      grounding: "A long project that rewards patience and consistency",
      transformation: "A turning point that lets me reinvent my path",
    }),
  },
  {
    id: "q4",
    prompt: "When you need to recover, what restores you most?",
    context: "Imagine you have a full day with no obligations.",
    options: buildOptions("q4", 4, {
      courage: "Movement, challenge, and remembering my strength",
      connection: "Warm time with the few people I deeply trust",
      intuition: "Silence, dreams, music, or reflective time alone",
      adaptability: "A spontaneous outing or an entirely new experience",
      grounding: "Nature, familiar rituals, and an unhurried routine",
      transformation: "Clearing out the old and creating something new",
    }),
  },
  {
    id: "q5",
    prompt: "How do you usually make an important decision?",
    context: "Pick the approach you return to under real pressure.",
    options: buildOptions("q5", 5, {
      courage: "Commit once the essential risk is clear",
      connection: "Consider how the choice affects the people involved",
      intuition: "Notice which option feels quietly true",
      adaptability: "Choose a flexible route that leaves room to adjust",
      grounding: "Compare facts and choose the most dependable path",
      transformation: "Choose the option that helps me outgrow an old pattern",
    }),
  },
  {
    id: "q6",
    prompt: "A friend comes to you in a difficult moment. What do you offer?",
    context: "Choose the gift you give most naturally.",
    options: buildOptions("q6", 1, {
      courage: "Protection and the strength to face what comes next",
      connection: "A safe place where they feel fully heard",
      intuition: "A perceptive question that reaches the real issue",
      adaptability: "Practical options suited to the changing situation",
      grounding: "Calm presence and reliable, concrete help",
      transformation: "Hope that this moment can become a new beginning",
    }),
  },
  {
    id: "q7",
    prompt: "Which environment makes you feel most alive?",
    context: "Follow your first response rather than analyzing it.",
    options: buildOptions("q7", 2, {
      courage: "A wide horizon where I can test my limits",
      connection: "A welcoming place alive with shared stories",
      intuition: "A quiet night landscape filled with subtle detail",
      adaptability: "A lively crossroads with constant movement",
      grounding: "An old forest, mountain trail, or peaceful garden",
      transformation: "A shoreline, threshold, or place shaped by change",
    }),
  },
  {
    id: "q8",
    prompt: "What quality are you trying to strengthen now?",
    context: "Choose the growth edge that feels most relevant today.",
    options: buildOptions("q8", 3, {
      courage: "Acting with confidence before certainty arrives",
      connection: "Letting myself trust and be known more deeply",
      intuition: "Hearing my inner wisdom above outside noise",
      adaptability: "Changing direction without losing myself",
      grounding: "Building steady habits that protect my energy",
      transformation: "Releasing an identity I have outgrown",
    }),
  },
  {
    id: "q9",
    prompt: "What do you protect most fiercely?",
    context: "Think beyond possessions to what feels sacred to you.",
    options: buildOptions("q9", 4, {
      courage: "The freedom to live by my convictions",
      connection: "The wellbeing of my chosen people",
      intuition: "My inner truth and private creative world",
      adaptability: "My independence and room to move",
      grounding: "The home, values, and routines that sustain me",
      transformation: "My right to change, heal, and become",
    }),
  },
  {
    id: "q10",
    prompt: "At your best, what impact do you hope to leave?",
    context: "Choose the legacy that feels closest to your nature.",
    options: buildOptions("q10", 5, {
      courage: "I helped others act bravely when it counted",
      connection: "I made people feel that they truly belonged",
      intuition: "I revealed meaning that others had overlooked",
      adaptability: "I found creative paths through difficult change",
      grounding: "I built something dependable that continued to support others",
      transformation: "I showed that renewal is possible at any stage",
    }),
  },
];

export interface SpiritAnimalAnswer {
  questionId: string;
  optionId: string;
}

export interface SpiritAnimalReportTemplate {
  animalKey: SpiritAnimalKey;
  animalName: string;
  emoji: string;
  archetype: string;
  element: SpiritAnimalProfile["element"];
  summary: string;
  whyThisAnimal: string;
  strengths: string[];
  shadowPatterns: string[];
  relationships: string;
  careerAndPurpose: string;
  lifeLesson: string;
  guidance: string[];
  affirmation: string;
}

export const SPIRIT_ANIMAL_REPORT_TEMPLATES: Record<SpiritAnimalKey, SpiritAnimalReportTemplate> = {
  lion: { animalKey: "lion", animalName: "Lion", emoji: "🦁", archetype: "The Courageous Guardian", element: "Fire", summary: "You move through life with protective courage, warm authority, and a strong instinct to stand up for what matters.", whyThisAnimal: "Your choices favor brave action and loyal connection, supported by practical judgment and a perceptive inner compass.", strengths: ["Courage under pressure", "Protective loyalty", "Natural leadership", "Generous confidence"], shadowPatterns: ["Taking on every battle alone", "Mistaking vulnerability for weakness", "Becoming overly responsible for others"], relationships: "You love visibly and defend the people in your circle. Your closest bonds grow when leadership becomes partnership and you allow others to support you too.", careerAndPurpose: "You thrive where conviction, responsibility, and visible impact meet: leadership, advocacy, entrepreneurship, coaching, or any role that asks you to rally people around a cause.", lifeLesson: "True strength includes restraint, listening, and the courage to receive care.", guidance: ["Choose the battles that protect your deepest values", "Invite trusted people into decisions before carrying everything yourself", "Use your visibility to make quieter voices safer"], affirmation: "My courage creates safety, and my open heart makes me strong." },
  bear: { animalKey: "bear", animalName: "Bear", emoji: "🐻", archetype: "The Steady Protector", element: "Earth", summary: "Your power is calm, self-contained, and dependable. You create safety by staying rooted when others feel uncertain.", whyThisAnimal: "Your answers combine courage with grounded patience, then add loyalty and a readiness to grow through difficult seasons.", strengths: ["Steady resilience", "Practical protection", "Healthy independence", "Patient strength"], shadowPatterns: ["Withdrawing for too long", "Carrying burdens without asking for help", "Resisting change until it becomes unavoidable"], relationships: "You show love through consistency, protection, and tangible care. Clear communication helps others understand the depth beneath your quiet exterior.", careerAndPurpose: "You suit work that rewards stamina, stewardship, and sound judgment, including operations, healing, finance, land-based work, management, or building lasting systems.", lifeLesson: "Rest is not retreat when it renews your ability to meet life fully.", guidance: ["Protect regular solitude without disappearing from your relationships", "Break heavy responsibilities into steady, visible steps", "Let change arrive gradually rather than waiting for a crisis"], affirmation: "I trust my pace, protect my peace, and move with steady power." },
  eagle: { animalKey: "eagle", animalName: "Eagle", emoji: "🦅", archetype: "The Far-Seeing Pioneer", element: "Fire", summary: "You are drawn to altitude: the wider view, the bold direction, and the possibility others have not yet recognized.", whyThisAnimal: "Your responses join courage with intuition and show an ability to adjust as a larger vision takes shape.", strengths: ["Strategic vision", "Decisive independence", "Pattern recognition", "Purposeful ambition"], shadowPatterns: ["Living too far in the future", "Impatience with small details", "Keeping emotional distance while pursuing a goal"], relationships: "You need honesty, space, and a shared sense of direction. Bonds deepen when you come down from the overview and stay present with everyday feelings.", careerAndPurpose: "You excel in strategy, innovation, leadership, research, creative direction, and ventures where a clear vision must become action.", lifeLesson: "A vision becomes meaningful when it remains connected to people and the present moment.", guidance: ["Translate every big vision into one grounded next step", "Ask what detail could change the whole picture", "Make room for relationships that challenge your perspective"], affirmation: "I see clearly, choose bravely, and bring my vision to earth." },
  horse: { animalKey: "horse", animalName: "Horse", emoji: "🐎", archetype: "The Free-Hearted Pathfinder", element: "Fire", summary: "Freedom, honest momentum, and lived experience are central to your nature. You learn by moving and meeting life directly.", whyThisAnimal: "Your answers emphasize brave movement and adaptability, balanced by loyalty and enough grounding to carry others with you.", strengths: ["Independent drive", "Vitality and momentum", "Authentic expression", "Responsive leadership"], shadowPatterns: ["Running when stillness feels uncomfortable", "Overcommitting to preserve every option", "Confusing limits with loss of freedom"], relationships: "You need bonds that offer trust without control. You are deeply loyal when your autonomy is respected and intentions are spoken plainly.", careerAndPurpose: "Dynamic, people-facing, entrepreneurial, travel, performance, sport, and change-oriented roles let your energy become useful rather than restless.", lifeLesson: "Commitment can give your freedom direction instead of taking it away.", guidance: ["Choose one meaningful direction before accelerating", "Build rhythms that support movement without trapping it", "Tell people when you need space instead of simply pulling away"], affirmation: "I move freely, commit consciously, and carry my truth forward." },
  wolf: { animalKey: "wolf", animalName: "Wolf", emoji: "🐺", archetype: "The Instinctive Ally", element: "Water", summary: "You balance strong intuition with devotion to your chosen circle. You notice subtle shifts and understand the power of belonging.", whyThisAnimal: "Your pattern centers connection and instinct, with flexibility and renewal helping you protect what matters without becoming rigid.", strengths: ["Loyal collaboration", "Emotional perception", "Strong instincts", "Protective intelligence"], shadowPatterns: ["Testing loyalty instead of naming your needs", "Absorbing the group's emotional climate", "Feeling torn between independence and belonging"], relationships: "You form deep bonds and value trust earned over time. Relationships flourish when you keep a clear identity inside the pack.", careerAndPurpose: "You thrive in collaborative strategy, community-building, counseling, investigation, teaching, and roles where reading people matters.", lifeLesson: "Belonging is strongest when it allows individuality, boundaries, and honest change.", guidance: ["Name your needs before resentment has time to grow", "Trust your first signal, then check it against evidence", "Choose communities that welcome both loyalty and independence"], affirmation: "I trust my instincts and belong without abandoning myself." },
  elephant: { animalKey: "elephant", animalName: "Elephant", emoji: "🐘", archetype: "The Wise Keeper", element: "Earth", summary: "You carry memory, responsibility, and care with unusual depth. Your steady presence helps people feel held and remembered.", whyThisAnimal: "Your answers place connection and grounded responsibility at the center, supported by quiet courage and perceptive wisdom.", strengths: ["Long-term loyalty", "Emotional steadiness", "Collective wisdom", "Responsible care"], shadowPatterns: ["Holding old pain too faithfully", "Feeling responsible for everyone's wellbeing", "Keeping traditions that no longer serve"], relationships: "You value continuity and show love through remembrance, practical help, and presence. Boundaries keep care from turning into exhaustion.", careerAndPurpose: "Mentoring, education, care work, institutional leadership, history, family enterprise, and long-range planning suit your patient influence.", lifeLesson: "Honor the past without asking it to decide the future.", guidance: ["Keep the lesson and release the weight of old stories", "Let others carry their fair share", "Create rituals that support the life you are building now"], affirmation: "My wisdom has roots, and my heart has room for the future." },
  dolphin: { animalKey: "dolphin", animalName: "Dolphin", emoji: "🐬", archetype: "The Joyful Connector", element: "Water", summary: "You connect through curiosity, emotional intelligence, and play. Your flexibility helps groups find hope and move together.", whyThisAnimal: "Your choices favor connection and adaptability, with courage and grounded care giving substance to your lightness.", strengths: ["Social intelligence", "Creative communication", "Playful resilience", "Cooperative problem-solving"], shadowPatterns: ["Using humor to avoid difficult feelings", "Scattering energy across too many people", "Adapting so much that your own preference gets lost"], relationships: "Communication is your bridge. You need warmth, mental movement, and enough emotional honesty that play never has to hide pain.", careerAndPurpose: "Communication, facilitation, design, teaching, media, hospitality, teamwork, and human-centered innovation can turn your social gifts into impact.", lifeLesson: "Joy becomes durable when it makes room for depth, limits, and honest emotion.", guidance: ["Ask what you want before adjusting to the room", "Use play to open difficult conversations, then stay for the truth", "Protect quiet time so your social energy can renew"], affirmation: "My joy connects, my truth deepens, and my presence helps life move." },
  owl: { animalKey: "owl", animalName: "Owl", emoji: "🦉", archetype: "The Quiet Seer", element: "Air", summary: "You seek the truth beneath appearances. Stillness, observation, and careful timing are among your strongest forms of power.", whyThisAnimal: "Your answers combine intuition with grounded discernment, strengthened by meaningful connection and an openness to transformation.", strengths: ["Deep observation", "Discernment", "Independent thought", "Calm insight"], shadowPatterns: ["Observing instead of participating", "Overthinking signals that were already clear", "Appearing distant while processing deeply"], relationships: "You bond through depth, honesty, and intellectual or spiritual intimacy. Sharing your process prevents silence from being misunderstood.", careerAndPurpose: "Research, analysis, psychology, writing, strategy, healing, and specialist roles reward your ability to see what others miss.", lifeLesson: "Wisdom must eventually leave the private mind and enter lived experience.", guidance: ["Act when the pattern is clear enough rather than perfectly proven", "Explain your silence to the people who care about you", "Pair solitary insight with one trusted conversation"], affirmation: "I see beneath the surface and share my wisdom at the right time." },
  snake: { animalKey: "snake", animalName: "Snake", emoji: "🐍", archetype: "The Alchemist", element: "Water", summary: "You are built for renewal. You sense when a cycle has ended and possess the courage to shed what no longer fits.", whyThisAnimal: "Your answers strongly join intuition with transformation, supported by flexible action and the bravery to cross thresholds.", strengths: ["Regenerative power", "Emotional depth", "Instinctive timing", "Capacity for reinvention"], shadowPatterns: ["Changing everything when one honest adjustment would do", "Guarding vulnerability through secrecy", "Remaining in transition without choosing a new form"], relationships: "You need emotional truth and room to evolve. Trust grows when transformation is communicated rather than revealed only after it is complete.", careerAndPurpose: "Healing, crisis work, research, transformation strategy, arts, psychology, and roles involving reinvention can channel your depth.", lifeLesson: "Release is complete only when it creates room for a conscious new choice.", guidance: ["Name what is ending before planning what comes next", "Let one trusted person witness your process", "Use intuition to guide change and evidence to shape its form"], affirmation: "I release with wisdom and renew myself with intention." },
  fox: { animalKey: "fox", animalName: "Fox", emoji: "🦊", archetype: "The Resourceful Strategist", element: "Air", summary: "You read situations quickly and find elegant paths through complexity. Intelligence becomes your form of adaptability.", whyThisAnimal: "Your pattern emphasizes adaptation and reinvention, steadied by practical awareness and a keen intuitive read of context.", strengths: ["Resourceful thinking", "Situational awareness", "Creative strategy", "Independent problem-solving"], shadowPatterns: ["Keeping too many contingency plans", "Hiding uncertainty behind cleverness", "Moving on before trust has time to form"], relationships: "You value wit, independence, and emotional intelligence. Letting others see the plan—and the feeling beneath it—builds stronger trust.", careerAndPurpose: "Strategy, product work, entrepreneurship, negotiation, communications, technology, and complex problem-solving fit your agile mind.", lifeLesson: "Resourcefulness is most powerful when it serves a clear value rather than constant escape.", guidance: ["Choose the simplest plan that protects what matters", "Share your reasoning instead of expecting others to infer it", "Stay long enough to learn what consistency can reveal"], affirmation: "I adapt with clarity and use my intelligence in service of what matters." },
  butterfly: { animalKey: "butterfly", animalName: "Butterfly", emoji: "🦋", archetype: "The Graceful Renewer", element: "Air", summary: "Your gift is becoming. You sense emerging possibilities and help change feel lighter, more beautiful, and more human.", whyThisAnimal: "Your responses favor adaptation and transformation, while connection and courage help your growth inspire rather than isolate.", strengths: ["Creative renewal", "Hopeful perspective", "Sensitivity to possibility", "Grace through transition"], shadowPatterns: ["Rushing the uncomfortable middle of change", "Chasing novelty instead of completing a cycle", "Underestimating the structure transformation needs"], relationships: "You bring freshness and inspiration to love. Stable bonds grow when others can trust that change will include communication and follow-through.", careerAndPurpose: "Creative work, branding, design, education, wellbeing, change communication, and community initiatives benefit from your ability to reframe experience.", lifeLesson: "Transformation needs a container: time, practice, and the courage to remain present between identities.", guidance: ["Give each new direction a clear season of commitment", "Celebrate small evidence of growth", "Keep one grounding ritual while other parts of life change"], affirmation: "I welcome change, honor the process, and unfold in my own time." },
  deer: { animalKey: "deer", animalName: "Deer", emoji: "🦌", archetype: "The Gentle Wayfinder", element: "Earth", summary: "You navigate with sensitivity, calm awareness, and quiet resilience. Gentleness is one of your most accurate forms of intelligence.", whyThisAnimal: "Your choices combine grounding with growth, guided by adaptability and a finely tuned awareness of subtle signals.", strengths: ["Gentle discernment", "Calm responsiveness", "Respectful boundaries", "Quiet resilience"], shadowPatterns: ["Avoiding necessary confrontation", "Becoming hyper-alert to other people's moods", "Mistaking gentleness for an obligation to yield"], relationships: "You offer tenderness and attentive care. You feel safest where kindness includes directness and boundaries are respected without drama.", careerAndPurpose: "Counseling, care, craft, nature, mediation, detail-rich creative work, and supportive leadership suit your calm influence.", lifeLesson: "Gentleness and firmness can live in the same choice.", guidance: ["Say the clear thing before discomfort becomes fear", "Return to your body when the room feels emotionally loud", "Choose environments where sensitivity is treated as skill"], affirmation: "I move gently, choose clearly, and trust my quiet strength." },
};

export interface SpiritAnimalDeepDive {
  innerNature: string;
  whenBalanced: string;
  underPressure: string;
  growthFocus: string;
  dailyPractices: string[];
}

// These animal-specific layers make the saved result useful beyond the initial
// reveal. They describe expression and practical integration without changing
// the scoring model or claiming a clinical personality assessment.
export const SPIRIT_ANIMAL_DEEP_DIVES: Record<SpiritAnimalKey, SpiritAnimalDeepDive> = {
  lion: {
    innerNature: "At your core, you want your presence to mean something. You are most fulfilled when your confidence protects, encourages, or creates direction for other people—not when it is used only to prove strength.",
    whenBalanced: "You lead without dominating, act decisively without rushing, and make people feel safer through your clarity. Your warmth is as visible as your authority.",
    underPressure: "You may become overly self-reliant, take disagreement personally, or assume that asking for help will weaken your position. This can turn healthy responsibility into exhaustion.",
    growthFocus: "Practice shared leadership. Let courage include listening, delegation, and the willingness to be seen before you have every answer.",
    dailyPractices: ["Choose one priority that deserves your strongest effort", "Ask one trusted person for input before a major decision", "End the day by naming a responsibility you can release"],
  },
  bear: {
    innerNature: "You are designed to conserve energy for what truly matters. Beneath your calm exterior is a powerful protective instinct and a need for enough space to hear your own pace.",
    whenBalanced: "You are patient, dependable, and difficult to destabilize. Others experience your presence as grounding because you respond from substance rather than urgency.",
    underPressure: "You may retreat without explaining, carry too much alone, or resist a necessary transition because familiar weight feels safer than uncertain movement.",
    growthFocus: "Use solitude as renewal rather than avoidance. Small, deliberate changes allow your stability to become a foundation for growth.",
    dailyPractices: ["Protect a quiet window with no demands or notifications", "Complete one practical task that restores order", "Tell someone what support would genuinely help"],
  },
  eagle: {
    innerNature: "Your mind naturally rises above immediate noise to search for meaning, direction, and possibility. You need a horizon worth moving toward and the freedom to interpret patterns independently.",
    whenBalanced: "You combine bold vision with precise timing. You can simplify complexity, name the larger purpose, and inspire action without losing sight of reality.",
    underPressure: "You may detach from ordinary emotions, dismiss details, or keep chasing the future while the present asks for care and follow-through.",
    growthFocus: "Bring altitude and ground together. Your clearest vision becomes trustworthy when it is translated into patient, observable steps.",
    dailyPractices: ["Write the larger purpose behind today's main task", "Turn one future goal into a concrete next action", "Give undivided attention to one present conversation"],
  },
  horse: {
    innerNature: "You need movement that feels honest. Freedom is less about avoiding commitment and more about having room to act, explore, and bring your full energy into life.",
    whenBalanced: "You are spirited, direct, and motivating. Your independence encourages others to move beyond hesitation while your loyalty keeps freedom connected to care.",
    underPressure: "You may accelerate before choosing a direction, resist useful structure, or leave situations simply because stillness makes discomfort easier to hear.",
    growthFocus: "Create commitments that support movement. The right structure gives your energy reach, continuity, and a destination.",
    dailyPractices: ["Move your body before making a restless decision", "Choose one direction to honor for the next seven days", "State your need for space clearly instead of withdrawing"],
  },
  wolf: {
    innerNature: "You read life through instinct and relationship. You want a circle where loyalty is real, differences are respected, and people understand the meaning behind one another's words.",
    whenBalanced: "You are perceptive, collaborative, and fiercely dependable. You can belong deeply while preserving your own instincts and independent judgment.",
    underPressure: "You may scan for signs of disloyalty, absorb emotions that are not yours, or silently test people instead of expressing what you need.",
    growthFocus: "Build belonging through direct communication. Trust grows faster when intuition starts a conversation rather than becoming a private conclusion.",
    dailyPractices: ["Name one need without testing whether others can guess it", "Separate what you sense from what you know", "Spend time with someone who welcomes your full individuality"],
  },
  elephant: {
    innerNature: "You experience identity through memory, continuity, and care. You notice what shaped people and naturally protect the stories, values, and bonds that deserve to endure.",
    whenBalanced: "You are emotionally steady, generous, and wise about long consequences. Your care creates continuity without preventing other people from growing.",
    underPressure: "You may carry old grief as a duty, become responsible for everyone's stability, or preserve a tradition after its meaning has faded.",
    growthFocus: "Let memory become wisdom rather than weight. Honor what came before while choosing what belongs in the life you are building now.",
    dailyPractices: ["Keep the lesson from one memory and release its burden", "Allow someone else to carry their share", "Create one small ritual for the future you want"],
  },
  dolphin: {
    innerNature: "Your intelligence is relational and creative. You understand tone, timing, and group energy, and you often find the opening that helps people reconnect with hope.",
    whenBalanced: "You communicate with warmth, solve problems playfully, and help groups adapt without losing their humanity. Your joy has depth rather than distraction.",
    underPressure: "You may use activity or humor to move around pain, spread yourself across too many relationships, or adapt until your own preference disappears.",
    growthFocus: "Let joy and emotional honesty coexist. Your lightness becomes more powerful when it can remain present for difficult feelings too.",
    dailyPractices: ["Ask yourself what you want before reading the room", "Use play to open a hard conversation, then stay with the truth", "Schedule quiet time after social intensity"],
  },
  owl: {
    innerNature: "You need time to observe before you speak. Your insight develops in stillness, where subtle contradictions and hidden patterns become easier to recognize.",
    whenBalanced: "You are discerning, composed, and quietly illuminating. You know when to watch, when to question, and when a clear truth is ready to be shared.",
    underPressure: "You may remain an observer when participation is required, overanalyze an already-clear signal, or appear distant while processing something deeply.",
    growthFocus: "Allow insight to become action. Wisdom grows when it is tested gently in real conversations and lived choices.",
    dailyPractices: ["Record the first pattern you notice before analyzing it", "Act when you have enough clarity rather than perfect certainty", "Explain your need for silence to someone close"],
  },
  snake: {
    innerNature: "You sense endings before they are obvious. Your life force gathers around transformation, emotional truth, and the instinct to shed identities that can no longer contain you.",
    whenBalanced: "You move through change with intention, protect your sensitivity without hiding, and help others understand that release can be intelligent and life-giving.",
    underPressure: "You may make a total break when a precise change would be enough, conceal vulnerability, or stay between identities without choosing what comes next.",
    growthFocus: "Give transformation a conscious form. Name what is ending, what is staying, and what the next version of you will practice consistently.",
    dailyPractices: ["Release one object, habit, or belief that has completed its purpose", "Share one vulnerable truth with a trusted person", "Choose one action that belongs to your emerging identity"],
  },
  fox: {
    innerNature: "You are alert to context and possibility. Your mind quickly notices alternate routes, hidden incentives, and efficient solutions that others may overlook.",
    whenBalanced: "You are adaptable, strategic, and elegantly practical. You use intelligence to protect what matters while remaining open to better information.",
    underPressure: "You may keep too many escape routes, hide uncertainty behind cleverness, or change direction before patience can reveal a deeper solution.",
    growthFocus: "Let strategy serve a clear value. Consistency is not the enemy of adaptability; it is how your best ideas gain trust and influence.",
    dailyPractices: ["Choose the simplest plan that meets the real need", "Explain your reasoning to one person affected by it", "Stay with one useful approach long enough to gather evidence"],
  },
  butterfly: {
    innerNature: "You orient toward possibility and renewal. You are sensitive to what is emerging and often recognize a new identity before its final shape is visible.",
    whenBalanced: "You move through change with grace, curiosity, and creative hope. Your evolution encourages other people to imagine a freer version of themselves.",
    underPressure: "You may rush the uncertain middle, pursue novelty instead of completion, or expect inspiration to replace the routines that real transformation requires.",
    growthFocus: "Give change a container. A season of consistency allows your new identity to become embodied rather than remaining an attractive possibility.",
    dailyPractices: ["Track one small sign that your growth is becoming real", "Keep one grounding ritual while other things change", "Finish one stage before beginning another transformation"],
  },
  deer: {
    innerNature: "You perceive subtle shifts in atmosphere, emotion, and safety. Your sensitivity is active intelligence: it helps you move carefully without needing to harden yourself.",
    whenBalanced: "You are gentle, alert, and quietly decisive. You can respond with care while maintaining clear boundaries and respect for your own needs.",
    underPressure: "You may avoid necessary conflict, monitor other people's moods too closely, or yield simply to restore calm even when something important remains unsaid.",
    growthFocus: "Pair gentleness with clear direction. A calm boundary protects sensitivity and allows kindness to remain sincere.",
    dailyPractices: ["Return attention to your body when the room feels loud", "Say one clear preference without apologizing for it", "Spend time in an environment where your nervous system can soften"],
  },
};

export interface SpiritAnimalScoringResult {
  animalKey: SpiritAnimalKey;
  traitScores: Record<SpiritTrait, number>;
  traitPercentages: Record<SpiritTrait, number>;
  animalScores: Record<SpiritAnimalKey, number>;
  topTraits: SpiritTrait[];
  scoringVersion: "spirit-animal-v1-balanced";
}

export function hasSpiritAnimalTraitPercentages(value: unknown): value is Record<SpiritTrait, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const percentages = value as Record<string, unknown>;
  const values = SPIRIT_TRAITS.map((trait) => percentages[trait]);
  if (!values.every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 100)) return false;
  const total = values.reduce<number>((sum, number) => sum + (number as number), 0);
  return total >= 97 && total <= 103;
}

export function spiritTraitPercentagesFromScores(value: unknown): Record<SpiritTrait, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const scores = value as Record<string, unknown>;
  const values = SPIRIT_TRAITS.map((trait) => scores[trait]);
  if (!values.every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0)) return null;
  const total = values.reduce<number>((sum, number) => sum + (number as number), 0);
  if (total <= 0) return null;
  return Object.fromEntries(
    SPIRIT_TRAITS.map((trait) => [trait, Math.round(((scores[trait] as number) / total) * 100)])
  ) as Record<SpiritTrait, number>;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function computeSpiritAnimalResult(answers: SpiritAnimalAnswer[]): SpiritAnimalScoringResult {
  if (!Array.isArray(answers) || answers.length !== SPIRIT_ANIMAL_QUESTIONS.length) {
    throw new Error("Please answer all 10 questions.");
  }

  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.optionId]));
  if (answerMap.size !== SPIRIT_ANIMAL_QUESTIONS.length) {
    throw new Error("Each question must be answered once.");
  }

  const traitScores = Object.fromEntries(SPIRIT_TRAITS.map((trait) => [trait, 0])) as Record<SpiritTrait, number>;
  const canonicalAnswers: string[] = [];

  for (const question of SPIRIT_ANIMAL_QUESTIONS) {
    const optionId = answerMap.get(question.id);
    const option = question.options.find((candidate) => candidate.id === optionId);
    if (!option) throw new Error("One or more answers are invalid.");
    traitScores[option.primaryTrait] += 2;
    traitScores[option.secondaryTrait] += 1;
    canonicalAnswers.push(`${question.id}:${option.id}`);
  }

  const animalScores = Object.fromEntries(
    SPIRIT_ANIMAL_KEYS.map((animalKey) => {
      const score = SPIRIT_TRAITS.reduce(
        (total, trait) => total + traitScores[trait] * SPIRIT_ANIMALS[animalKey].weights[trait],
        0
      );
      return [animalKey, score];
    })
  ) as Record<SpiritAnimalKey, number>;

  const highestScore = Math.max(...Object.values(animalScores));
  // A single forced-choice item moves a compatibility score by several points.
  // Treat profiles within three points as statistically indistinguishable at
  // this quiz length, then use a stable response fingerprint to select exactly
  // one. This prevents a few centrally positioned profiles from winning far
  // more often while never selecting a meaningfully weaker match.
  const finalistAnimals = SPIRIT_ANIMAL_KEYS.filter(
    (animalKey) => highestScore - animalScores[animalKey] <= 3
  );
  const tieSeed = canonicalAnswers.join("|");
  const rankedAnimals = [...finalistAnimals].sort(
    (left, right) => stableHash(`${tieSeed}|${right}`) - stableHash(`${tieSeed}|${left}`)
  );

  const traitPercentages = spiritTraitPercentagesFromScores(traitScores)!;

  const topTraits = [...SPIRIT_TRAITS]
    .sort((left, right) => traitScores[right] - traitScores[left] || TRAIT_INDEX[left] - TRAIT_INDEX[right])
    .slice(0, 3);

  return {
    animalKey: rankedAnimals[0],
    traitScores,
    traitPercentages,
    animalScores,
    topTraits,
    scoringVersion: "spirit-animal-v1-balanced",
  };
}

export function serializeSpiritAnimalAnswers(
  answers: Record<string, string>
): SpiritAnimalAnswer[] {
  return SPIRIT_ANIMAL_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: answers[question.id] || "",
  }));
}

export function formatSpiritAnswersForStorage(answers: SpiritAnimalAnswer[]) {
  return answers.map((answer) => {
    const question = SPIRIT_ANIMAL_QUESTIONS.find((candidate) => candidate.id === answer.questionId);
    const option = question?.options.find((candidate) => candidate.id === answer.optionId);
    return {
      questionId: answer.questionId,
      optionId: answer.optionId,
      prompt: question?.prompt || "",
      answer: option?.label || "",
    };
  });
}

export function buildSpiritAnimalReport(
  animalKey: SpiritAnimalKey,
  generatedAt = new Date().toISOString(),
  scoring?: Pick<SpiritAnimalScoringResult, "topTraits" | "traitPercentages">
) {
  return {
    ...SPIRIT_ANIMAL_REPORT_TEMPLATES[animalKey],
    ...SPIRIT_ANIMAL_DEEP_DIVES[animalKey],
    imageUrl: SPIRIT_ANIMAL_IMAGE_URLS[animalKey],
    heroGradient: SPIRIT_ANIMAL_HERO_GRADIENTS[animalKey],
    topTraits: scoring?.topTraits || [],
    traitPercentages: scoring?.traitPercentages || {},
    generatedAt,
  };
}

export type SpiritAnimalReportResult = ReturnType<typeof buildSpiritAnimalReport>;

export function hydrateSpiritAnimalReport(
  animalKey: SpiritAnimalKey,
  snapshot: unknown,
  generatedAt = new Date().toISOString(),
  traitScores?: unknown
): SpiritAnimalReportResult {
  const stored = snapshot && typeof snapshot === "object"
    ? (snapshot as Partial<SpiritAnimalReportResult>)
    : {};

  const traitPercentages = hasSpiritAnimalTraitPercentages(stored.traitPercentages)
    ? stored.traitPercentages
    : spiritTraitPercentagesFromScores(traitScores) || {};

  return {
    ...buildSpiritAnimalReport(animalKey, generatedAt),
    ...stored,
    animalKey,
    traitPercentages,
    imageUrl: SPIRIT_ANIMAL_IMAGE_URLS[animalKey] || stored.imageUrl,
    heroGradient: SPIRIT_ANIMAL_HERO_GRADIENTS[animalKey],
    generatedAt: stored.generatedAt || generatedAt,
  };
}
