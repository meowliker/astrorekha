/**
 * Script to pre-populate Firestore with all 78 zodiac compatibility combinations
 * Run with: npx ts-node scripts/populate-compatibility.ts
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCAZeMkiUY6w1aDXZGL9HFZ9Rm9x-3WEMA",
  authDomain: "palm-cosmic.firebaseapp.com",
  projectId: "palm-cosmic",
  storageBucket: "palm-cosmic.firebasestorage.app",
  messagingSenderId: "35594331902",
  appId: "1:35594331902:web:493024eeb709b32a77e7af"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

const elements: Record<string, string> = {
  Aries: "fire", Taurus: "earth", Gemini: "air", Cancer: "water",
  Leo: "fire", Virgo: "earth", Libra: "air", Scorpio: "water",
  Sagittarius: "fire", Capricorn: "earth", Aquarius: "air", Pisces: "water"
};

const modalities: Record<string, string> = {
  Aries: "cardinal", Taurus: "fixed", Gemini: "mutable", Cancer: "cardinal",
  Leo: "fixed", Virgo: "mutable", Libra: "cardinal", Scorpio: "fixed",
  Sagittarius: "mutable", Capricorn: "cardinal", Aquarius: "fixed", Pisces: "mutable"
};

interface ChallengeItem {
  title: string;
  description: string;
  solution: string;
}

interface CompatibilityData {
  sign1: string;
  sign2: string;
  overallScore: number;
  emotionalScore: number;
  intellectualScore: number;
  physicalScore: number;
  spiritualScore: number;
  summary: string;
  strengths: string[];
  challenges: ChallengeItem[];
  toxicityScore: number;
  toxicityDescription: string;
  createdAt: string;
}

// Element-based compatibility insights
const ELEMENT_INSIGHTS: Record<string, {
  summary: string;
  strengths: string[];
  challenges: ChallengeItem[];
  toxicityScore: number;
  toxicityDescription: string;
}> = {
  "fire_fire": {
    summary: "A passionate and dynamic pairing! Both partners bring enthusiasm, creativity, and a zest for life. This relationship is never boring.",
    strengths: ["Shared enthusiasm and energy", "Mutual understanding of need for independence", "Exciting adventures together", "Strong physical chemistry"],
    challenges: [
      { title: "Competition for attention", description: "Both fire signs crave the spotlight and recognition. This can lead to rivalry rather than partnership.", solution: "Create separate spheres where each partner can shine. Celebrate each other's victories genuinely and take turns being in the spotlight." },
      { title: "Impulsive decision-making", description: "Fire signs act on instinct, which can lead to hasty decisions that affect both partners without proper discussion.", solution: "Implement a 24-hour rule for major decisions. When something feels urgent, agree to sleep on it and discuss together before acting." },
      { title: "Explosive arguments", description: "When two fire signs clash, tempers can escalate quickly into heated arguments that may include hurtful words.", solution: "Establish a 'cool down' signal that either partner can use. When triggered, take 20 minutes apart before continuing calmly." },
      { title: "Burnout from intensity", description: "The constant high energy can be exhausting. Without downtime, the relationship may feel overwhelming.", solution: "Schedule regular quiet time together - movie nights, nature walks, or simply reading side by side. Balance adventure with peace." }
    ],
    toxicityScore: 25,
    toxicityDescription: "This pairing has low toxicity when both partners respect each other's need for independence. The main risk comes from ego clashes and competition. With mutual admiration instead of rivalry, this can be a highly supportive relationship."
  },
  "earth_earth": {
    summary: "A stable and grounded connection built on shared values of security, loyalty, and practical goals. This relationship can stand the test of time.",
    strengths: ["Shared values around stability", "Strong financial compatibility", "Reliable and dependable partnership", "Deep loyalty to each other"],
    challenges: [
      { title: "Falling into routine", description: "Both partners value stability so much that the relationship can become predictable and lack excitement.", solution: "Schedule monthly 'adventure dates' where you try something completely new together - a cooking class, hiking trail, or spontaneous road trip." },
      { title: "Resistance to change", description: "When life requires adaptation, both partners may dig in their heels, making transitions harder than necessary.", solution: "Practice small changes regularly. Try a new restaurant weekly or rearrange furniture seasonally to build comfort with change." },
      { title: "Stubbornness in conflicts", description: "Neither partner wants to back down first, leading to prolonged standoffs over minor disagreements.", solution: "Agree that whoever notices the standoff first calls a 'pause.' Return to the discussion after both have had time to reflect." },
      { title: "Lack of spontaneity", description: "Over-planning everything can make the relationship feel like a business arrangement rather than a romance.", solution: "Keep one evening per week completely unplanned. Let the mood guide what you do together." }
    ],
    toxicityScore: 15,
    toxicityDescription: "This is one of the least toxic pairings. Both partners value loyalty and commitment deeply. The main risk is stagnation rather than conflict. Keep growing together and this relationship can last a lifetime."
  },
  "air_air": {
    summary: "An intellectually stimulating match! Endless conversations, shared ideas, and a love of social activities make this a mentally engaging partnership.",
    strengths: ["Excellent communication", "Shared love of learning", "Social compatibility", "Freedom and independence respected"],
    challenges: [
      { title: "Avoiding emotional depth", description: "Both partners prefer intellectual discussions and may unconsciously avoid deeper emotional conversations.", solution: "Set aside 'feelings time' weekly where you share vulnerabilities without analyzing them. Just listen and validate." },
      { title: "Chronic indecision", description: "Two air signs can endlessly discuss options without ever committing to a decision.", solution: "Use a decision deadline. If you can't decide together in 24 hours, flip a coin. Action beats perfect planning." },
      { title: "Emotional detachment", description: "During conflicts, both may retreat into logic, leaving emotional needs unaddressed.", solution: "Before problem-solving, acknowledge feelings first. Say 'I hear that you're frustrated' before offering solutions." },
      { title: "Scattered focus", description: "So many shared interests can mean nothing gets finished as you jump from project to project.", solution: "Choose one shared goal per quarter and see it through before starting something new together." }
    ],
    toxicityScore: 20,
    toxicityDescription: "Low toxicity overall. The danger isn't conflict but rather drifting apart emotionally while staying intellectually connected. Make sure to nurture the heart connection, not just the mind."
  },
  "water_water": {
    summary: "A deeply emotional and intuitive bond. Both partners understand each other's feelings on a profound level, creating an almost psychic connection.",
    strengths: ["Deep emotional understanding", "Strong intuitive connection", "Nurturing and supportive", "Rich inner life together"],
    challenges: [
      { title: "Emotional overwhelm", description: "When both partners are going through difficult times, emotions can amplify rather than balance.", solution: "Designate one partner as the 'anchor' during tough times. Take turns being the stable one when the other needs support." },
      { title: "Becoming too insular", description: "The relationship feels so complete that you may isolate from friends and family.", solution: "Maintain individual friendships and schedule regular social activities outside the relationship." },
      { title: "Enabling negative patterns", description: "Deep empathy can mean you validate each other's fears and anxieties rather than challenging them.", solution: "Agree to gently call out when you see your partner spiraling. 'I love you, and I think fear is talking right now.'" },
      { title: "Difficulty with practical matters", description: "So focused on emotional life that bills, chores, and logistics get neglected.", solution: "Create a simple weekly 'adulting hour' where you handle practical tasks together, making them less burdensome." }
    ],
    toxicityScore: 30,
    toxicityDescription: "Moderate toxicity risk if boundaries aren't maintained. The deep emotional connection can become codependent. Healthy water-water relationships require both partners to maintain their individual identities."
  },
  "air_fire": {
    summary: "A dynamic and inspiring combination! Air fans Fire's flames, creating excitement, creativity, and endless possibilities together.",
    strengths: ["Mutual inspiration", "Great communication", "Shared love of adventure", "Intellectual and passionate connection"],
    challenges: [
      { title: "Intensity mismatch", description: "Fire's passion can feel overwhelming to Air, while Air's detachment can feel cold to Fire.", solution: "Fire: count to five before reacting emotionally. Air: practice saying 'I feel' statements even when it's uncomfortable." },
      { title: "Lack of grounding", description: "Both signs love ideas and excitement but may neglect practical responsibilities together.", solution: "Assign practical tasks to specific days. Make 'boring' tasks into games or challenges to keep both engaged." },
      { title: "Restlessness in routine", description: "Neither partner thrives in routine, which can make long-term stability challenging.", solution: "Build variety into your routine. Same commitment, different expressions - like always having date night but never the same date twice." },
      { title: "Different conflict styles", description: "Fire wants to hash it out immediately; Air needs time to process and think.", solution: "Agree on a 30-minute window: Fire gets to express, then Air gets space to process before responding." }
    ],
    toxicityScore: 22,
    toxicityDescription: "Low to moderate toxicity. This pairing works well when both appreciate their differences. The main risk is burnout from constant activity. Remember to rest together, not just play together."
  },
  "earth_water": {
    summary: "A nurturing and supportive pairing. Earth provides stability while Water brings emotional depth, creating a fertile ground for growth.",
    strengths: ["Complementary strengths", "Emotional security", "Practical and intuitive balance", "Strong home and family focus"],
    challenges: [
      { title: "Emotional expression gap", description: "Earth shows love through actions; Water needs verbal and emotional expression. Both may feel unloved despite caring deeply.", solution: "Learn each other's love language. Earth: practice saying feelings aloud. Water: recognize acts of service as love." },
      { title: "Pace differences", description: "Water processes through feelings first; Earth wants to solve and move on. This can create frustration.", solution: "Water gets 10 minutes to feel heard before Earth offers solutions. Both needs get met in sequence." },
      { title: "Different social needs", description: "Earth may want quiet nights in while Water craves emotional connection through socializing.", solution: "Compromise with small gatherings at home. Water gets connection; Earth gets comfortable environment." },
      { title: "Handling stress differently", description: "Earth becomes more rigid under stress; Water becomes more emotional. These responses can clash.", solution: "Identify your stress signals early. When you notice them, name it: 'I'm stressed and need [space/comfort].'" }
    ],
    toxicityScore: 18,
    toxicityDescription: "Very low toxicity. This is a naturally complementary pairing. Earth provides the security Water craves, and Water helps Earth access deeper emotions. Conflicts are usually resolved through mutual care."
  },
  "fire_water": {
    summary: "A steamy but challenging combination. When balanced, this creates passion and depth; when unbalanced, conflicts can arise.",
    strengths: ["Intense attraction", "Passionate connection", "Can balance each other", "Never boring"],
    challenges: [
      { title: "Emotional flooding", description: "Fire's directness can overwhelm Water's sensitivity, causing Water to shut down or become defensive.", solution: "Fire: soften your delivery. Start with appreciation before addressing issues. Water: speak up before you're overwhelmed." },
      { title: "Different needs for expression", description: "Fire expresses outwardly and moves on; Water processes internally and needs time.", solution: "Create a 'processing protocol.' Fire expresses, then gives Water 24 hours before expecting resolution." },
      { title: "Steam or evaporation", description: "The combination can create passionate steam or Fire can 'evaporate' Water's emotional needs entirely.", solution: "Check in weekly: 'Do you feel emotionally seen by me?' Address gaps before they become chasms." },
      { title: "Conflict escalation", description: "Fire's heat meets Water's depth, and arguments can become intense and hurtful quickly.", solution: "Establish a safe word that means 'pause.' When used, both take 20 minutes before continuing." }
    ],
    toxicityScore: 45,
    toxicityDescription: "Moderate to high toxicity potential. This pairing requires conscious effort to work. The passion is real, but so is the potential for hurt. Success depends on both partners learning to regulate their natural responses."
  },
  "earth_fire": {
    summary: "A challenging but potentially rewarding match. Fire brings excitement while Earth provides stability, if both can appreciate their differences.",
    strengths: ["Fire motivates Earth", "Earth grounds Fire", "Can achieve great things together", "Balance of action and planning"],
    challenges: [
      { title: "Pace frustration", description: "Fire wants to act now; Earth wants to plan first. Both feel the other is being unreasonable.", solution: "Divide decisions: quick ones go Fire's way, major ones get Earth's planning process. Respect the system." },
      { title: "Excitement vs. stability", description: "Fire may feel Earth is boring; Earth may feel Fire is reckless. Neither is wrong, just different.", solution: "Appreciate what you lack. Fire: thank Earth for preventing disasters. Earth: thank Fire for adding joy." },
      { title: "Different values", description: "Fire values experience and adventure; Earth values security and accumulation. Financial conflicts are common.", solution: "Create separate 'fun money' and 'security money.' Both values get honored without conflict." },
      { title: "Feeling unseen", description: "Fire feels Earth doesn't appreciate their energy; Earth feels Fire doesn't value their contributions.", solution: "Weekly appreciation ritual: each partner names three specific things they valued about the other that week." }
    ],
    toxicityScore: 35,
    toxicityDescription: "Moderate toxicity risk. The fundamental difference in values can create ongoing friction. Success requires genuine respect for different approaches to life, not just tolerance."
  },
  "air_water": {
    summary: "An intriguing combination of mind and heart. When connected, creates beautiful understanding; may struggle to find common ground initially.",
    strengths: ["Intellectual and emotional blend", "Creative together", "Can learn from each other", "Unique perspective sharing"],
    challenges: [
      { title: "Logic vs. emotion", description: "Air approaches problems analytically; Water approaches them emotionally. Both feel misunderstood.", solution: "Validate before solving. Air: say 'That sounds really hard' before offering analysis. Water: appreciate Air's problem-solving intent." },
      { title: "Communication gaps", description: "Air communicates through ideas; Water through feelings. Messages get lost in translation.", solution: "Translate for each other. 'When I say X, I mean I feel Y.' Build a shared emotional vocabulary." },
      { title: "Different social needs", description: "Air thrives in groups and variety; Water prefers intimate, deep connections with few people.", solution: "Attend social events together but allow Water to leave early. Air can stay; Water recharges at home." },
      { title: "Feeling dismissed", description: "Water feels Air doesn't take their feelings seriously; Air feels Water is being irrational.", solution: "Neither is wrong. Agree that feelings are valid AND logic is useful. Both approaches have value." }
    ],
    toxicityScore: 28,
    toxicityDescription: "Low to moderate toxicity. The main challenge is bridging different ways of experiencing the world. When both partners genuinely try to understand the other's perspective, this can be a beautifully balanced relationship."
  },
  "air_earth": {
    summary: "A meeting of ideas and practicality. Can be highly productive when aligned, but may struggle with different approaches to life.",
    strengths: ["Ideas meet execution", "Complementary skills", "Can build something lasting", "Different perspectives"],
    challenges: [
      { title: "Dreamer vs. doer tension", description: "Air generates endless ideas; Earth wants to finish one thing before starting another.", solution: "Air writes ideas in a 'someday' list. Earth picks one per month to actually execute together." },
      { title: "Different social rhythms", description: "Air wants variety and new experiences; Earth prefers familiar places and people.", solution: "Alternate: one week Air picks the social activity, next week Earth does. Both get their needs met." },
      { title: "Feeling limited or flighty", description: "Earth feels Air is unreliable; Air feels Earth is limiting their potential.", solution: "Reframe: Earth provides a launchpad, not a cage. Air provides inspiration, not chaos." },
      { title: "Planning conflicts", description: "Air wants flexibility; Earth wants structure. Vacation planning can become a battleground.", solution: "Plan the framework (flights, hotels) but leave days unscheduled. Structure with flexibility." }
    ],
    toxicityScore: 25,
    toxicityDescription: "Low toxicity. This pairing works well professionally and can work romantically with effort. The key is seeing differences as complementary rather than conflicting."
  }
};

function getElementKey(sign1: string, sign2: string): string {
  const e1 = elements[sign1];
  const e2 = elements[sign2];
  const [el1, el2] = [e1, e2].sort();
  return `${el1}_${el2}`;
}

function generateScores(sign1: string, sign2: string): { overall: number; emotional: number; intellectual: number; physical: number; spiritual: number } {
  const e1 = elements[sign1];
  const e2 = elements[sign2];
  const m1 = modalities[sign1];
  const m2 = modalities[sign2];

  let baseScore = 65;

  // Same sign bonus
  if (sign1 === sign2) baseScore = 75;

  // Element compatibility
  if (e1 === e2) baseScore += 15;
  else if ((e1 === "fire" && e2 === "air") || (e1 === "air" && e2 === "fire")) baseScore += 12;
  else if ((e1 === "earth" && e2 === "water") || (e1 === "water" && e2 === "earth")) baseScore += 12;
  else if ((e1 === "fire" && e2 === "water") || (e1 === "water" && e2 === "fire")) baseScore -= 5;
  else if ((e1 === "earth" && e2 === "air") || (e1 === "air" && e2 === "earth")) baseScore -= 3;

  // Modality compatibility
  if (m1 === m2) baseScore += 5;
  else baseScore += 3;

  // Position-based adjustments
  const idx1 = ZODIAC_SIGNS.indexOf(sign1);
  const idx2 = ZODIAC_SIGNS.indexOf(sign2);
  const distance = Math.abs(idx1 - idx2);
  
  if (distance === 6) baseScore += 8; // Opposite signs
  if (distance === 4 || distance === 8) baseScore += 6; // Trine
  if (distance === 3 || distance === 9) baseScore -= 2; // Square

  baseScore = Math.max(55, Math.min(95, baseScore));

  // Generate sub-scores with slight variation
  const variation = () => Math.floor(Math.random() * 10) - 5;
  
  return {
    overall: baseScore,
    emotional: Math.max(50, Math.min(98, baseScore + variation())),
    intellectual: Math.max(50, Math.min(98, baseScore + variation())),
    physical: Math.max(50, Math.min(98, baseScore + variation())),
    spiritual: Math.max(50, Math.min(98, baseScore + variation())),
  };
}

async function populateFirestore() {
  console.log("Starting Firestore population...");
  
  let count = 0;
  const combinations: Array<[string, string]> = [];
  
  // Generate all 78 unique combinations (including same-sign pairs)
  for (let i = 0; i < ZODIAC_SIGNS.length; i++) {
    for (let j = i; j < ZODIAC_SIGNS.length; j++) {
      combinations.push([ZODIAC_SIGNS[i], ZODIAC_SIGNS[j]]);
    }
  }
  
  console.log(`Generated ${combinations.length} combinations to populate`);
  
  for (const [sign1, sign2] of combinations) {
    const [s1, s2] = [sign1, sign2].sort();
    const docId = `${s1.toLowerCase()}_${s2.toLowerCase()}`;
    const elementKey = getElementKey(sign1, sign2);
    const insights = ELEMENT_INSIGHTS[elementKey] || ELEMENT_INSIGHTS["fire_fire"];
    const scores = generateScores(sign1, sign2);
    
    const data: CompatibilityData = {
      sign1: s1,
      sign2: s2,
      overallScore: scores.overall,
      emotionalScore: scores.emotional,
      intellectualScore: scores.intellectual,
      physicalScore: scores.physical,
      spiritualScore: scores.spiritual,
      summary: insights.summary,
      strengths: insights.strengths,
      challenges: insights.challenges,
      toxicityScore: insights.toxicityScore,
      toxicityDescription: insights.toxicityDescription,
      createdAt: new Date().toISOString(),
    };
    
    try {
      const docRef = doc(db, "compatibility", docId);
      await setDoc(docRef, data);
      count++;
      console.log(`✓ ${count}/78: ${s1} + ${s2} (${docId})`);
    } catch (error) {
      console.error(`✗ Failed: ${s1} + ${s2}`, error);
    }
  }
  
  console.log(`\n✅ Successfully populated ${count} compatibility combinations!`);
  process.exit(0);
}

populateFirestore().catch(console.error);
