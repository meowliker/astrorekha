export interface NumerologyInput {
  name: string;
  birthDay: number;
  birthMonth: number;
  birthYear: number;
}

export interface CoreNumerologyNumber {
  key: "radical" | "destiny" | "name" | "soulUrge" | "personality";
  label: string;
  sanskritLabel: string;
  value: number;
  formula: string;
  summary: string;
}

export interface NumerologyReport {
  name: string;
  birthDateLabel: string;
  coreNumbers: CoreNumerologyNumber[];
  primary: NumberProfile;
  destiny: NumberProfile;
  nameProfile: NumberProfile;
  favorable: FavorableProfile;
  lifeSections: {
    characteristics: string[];
    health: string[];
    wealth: string[];
    happiness: string[];
    compatibility: string[];
    awareness: string[];
  };
}

interface FavorableProfile {
  signs: string;
  alphabets: string;
  gemstone: string;
  days: string;
  direction: string;
  planet: string;
  deity: string;
  fast: string;
  dates: string;
  mantra: string;
  place: string;
  time: string;
  remedies: string[];
}

interface NumberProfile {
  number: number;
  title: string;
  archetype: string;
  short: string;
  strengths: string[];
  cautions: string[];
}

const CHALDEAN_VALUES: Record<string, number> = {
  A: 1,
  I: 1,
  J: 1,
  Q: 1,
  Y: 1,
  B: 2,
  K: 2,
  R: 2,
  C: 3,
  G: 3,
  L: 3,
  S: 3,
  D: 4,
  M: 4,
  T: 4,
  E: 5,
  H: 5,
  N: 5,
  X: 5,
  U: 6,
  V: 6,
  W: 6,
  O: 7,
  Z: 7,
  F: 8,
  P: 8,
};

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

const NUMBER_PROFILES: Record<number, NumberProfile> = {
  1: {
    number: 1,
    title: "The Initiator",
    archetype: "Leadership, independence, visibility",
    short: "Number 1 carries a direct, solar quality. It prefers movement, responsibility, and clear self-expression.",
    strengths: ["Independent decision making", "Strong willpower", "Natural leadership", "Confidence in visible roles"],
    cautions: ["Impatience", "Pride", "Taking too much alone", "Feeling restricted by routine"],
  },
  2: {
    number: 2,
    title: "The Harmonizer",
    archetype: "Sensitivity, cooperation, emotional intelligence",
    short: "Number 2 is receptive and relational. It reads emotional atmosphere quickly and often creates peace around it.",
    strengths: ["Diplomacy", "Careful listening", "Partnership skills", "Creative intuition"],
    cautions: ["Overthinking", "Mood swings", "Avoiding direct conflict", "Depending on approval"],
  },
  3: {
    number: 3,
    title: "The Communicator",
    archetype: "Expression, learning, optimism",
    short: "Number 3 brings language, humor, imagination, and the urge to share ideas in a way others can feel.",
    strengths: ["Communication", "Teaching ability", "Social warmth", "Creative problem solving"],
    cautions: ["Scattered focus", "Overspending", "Restlessness", "Leaving tasks unfinished"],
  },
  4: {
    number: 4,
    title: "The Builder",
    archetype: "Structure, discipline, persistence",
    short: "Number 4 prefers order, proof, and reliable progress. It becomes powerful when plans are grounded.",
    strengths: ["Discipline", "Systems thinking", "Practical planning", "Endurance"],
    cautions: ["Rigidity", "Slow trust", "Work pressure", "Resistance to sudden change"],
  },
  5: {
    number: 5,
    title: "The Explorer",
    archetype: "Adaptability, commerce, movement",
    short: "Number 5 works through variety and quick intelligence. It learns fastest when life stays dynamic.",
    strengths: ["Adaptability", "Business instinct", "Fast learning", "Networking"],
    cautions: ["Impulsiveness", "Inconsistency", "Distraction", "Avoiding commitment"],
  },
  6: {
    number: 6,
    title: "The Nurturer",
    archetype: "Beauty, responsibility, family, service",
    short: "Number 6 carries warmth, refinement, and a strong sense of care for people and spaces.",
    strengths: ["Responsibility", "Aesthetic sense", "Relationship care", "Supportive leadership"],
    cautions: ["Overgiving", "Perfectionism", "Emotional burden", "Difficulty saying no"],
  },
  7: {
    number: 7,
    title: "The Seeker",
    archetype: "Research, spirituality, analysis",
    short: "Number 7 is inward, perceptive, and investigative. It wants meaning beneath the surface of events.",
    strengths: ["Deep analysis", "Spiritual curiosity", "Original thinking", "Private discipline"],
    cautions: ["Isolation", "Suspicion", "Emotional distance", "Over-analysing timing"],
  },
  8: {
    number: 8,
    title: "The Strategist",
    archetype: "Power, money, karma, execution",
    short: "Number 8 deals with consequence and material results. It grows through maturity and ethical ambition.",
    strengths: ["Financial planning", "Authority", "Long-term execution", "Resilience"],
    cautions: ["Control issues", "Work-life imbalance", "Delayed rewards", "Harsh self-judgment"],
  },
  9: {
    number: 9,
    title: "The Warrior-Healer",
    archetype: "Courage, compassion, completion",
    short: "Number 9 combines intensity with service. It can fight for causes while learning emotional release.",
    strengths: ["Courage", "Generosity", "Protective energy", "Big-picture thinking"],
    cautions: ["Anger", "Burnout", "Emotional extremes", "Trying to rescue everyone"],
  },
};

const FAVORABLE_PROFILES: Record<number, FavorableProfile> = {
  1: {
    signs: "Aries, Leo",
    alphabets: "A, J, S",
    gemstone: "Ruby",
    days: "Sunday, Monday",
    direction: "East [Poorva]",
    planet: "Sun",
    deity: "Lord Shiva",
    fast: "Sunday",
    dates: "1st, 10th, 19th, 28th",
    mantra: "Om Hram Hrim Hraum Sah Suryaya Namah",
    place: "East-facing workspaces, sunlight-rich rooms, and leadership seats support your confidence.",
    time: "April to May and August to September are supportive for visibility, launches, and recognition.",
    remedies: [
      "Begin important work on a Sunday morning when possible.",
      "Offer water to the rising Sun and keep your morning routine steady.",
      "Use red, gold, or copper accents for important meetings and launches.",
    ],
  },
  2: {
    signs: "Cancer, Taurus",
    alphabets: "B, K, T",
    gemstone: "Pearl",
    days: "Monday, Friday",
    direction: "North-West [Vayavya]",
    planet: "Moon",
    deity: "Goddess Parvati",
    fast: "Monday",
    dates: "2nd, 11th, 20th, 29th",
    mantra: "Om Som Somaya Namah",
    place: "Calm, water-adjacent, softly lit places help your mind settle and make cleaner choices.",
    time: "June to July and October are supportive for relationships, creativity, and emotional clarity.",
    remedies: [
      "Keep water near your study or work area to remind yourself to stay fluid.",
      "Avoid major decisions when emotionally tired.",
      "Wear white, silver, or soft blue on days needing patience.",
    ],
  },
  3: {
    signs: "Sagittarius, Pisces",
    alphabets: "C, L, U",
    gemstone: "Yellow Sapphire",
    days: "Thursday, Tuesday",
    direction: "North-East [Ishan]",
    planet: "Jupiter",
    deity: "Lord Vishnu",
    fast: "Thursday",
    dates: "3rd, 12th, 21st, 30th",
    mantra: "Om Gram Grim Graum Sah Gurave Namah",
    place: "Study rooms, teaching spaces, temples, and knowledge-led environments strengthen your luck.",
    time: "February to March and November to December favor learning, teaching, and bigger planning.",
    remedies: [
      "Donate or share knowledge on Thursdays.",
      "Write your top three priorities before starting the day.",
      "Use yellow or saffron accents when presenting or studying.",
    ],
  },
  4: {
    signs: "Aquarius, Scorpio",
    alphabets: "D, M, V",
    gemstone: "Hessonite",
    days: "Saturday, Sunday",
    direction: "South-West [Nairitya]",
    planet: "Rahu",
    deity: "Lord Ganesha",
    fast: "Saturday",
    dates: "4th, 13th, 22nd, 31st",
    mantra: "Om Raam Rahave Namah",
    place: "Stable corners, organized desks, and distraction-free rooms improve your execution.",
    time: "January to February and September are better for rebuilding systems and long-term work.",
    remedies: [
      "Keep documents, money records, and work tools orderly.",
      "Break big goals into weekly visible milestones.",
      "Avoid unnecessary risks on emotionally charged days.",
    ],
  },
  5: {
    signs: "Gemini, Virgo",
    alphabets: "E, N, W",
    gemstone: "Emerald",
    days: "Wednesday, Friday",
    direction: "North [Uttar]",
    planet: "Mercury",
    deity: "Lord Vishnu",
    fast: "Wednesday",
    dates: "5th, 14th, 23rd",
    mantra: "Om Bum Budhaya Namah",
    place: "Markets, offices, travel routes, and active learning spaces increase opportunity.",
    time: "May to June and September to October favor commerce, networking, and skill upgrades.",
    remedies: [
      "Double-check communication before sending important messages.",
      "Use green accents for trade, learning, or interviews.",
      "Keep one weekly no-distraction block for deep work.",
    ],
  },
  6: {
    signs: "Taurus, Libra",
    alphabets: "F, O, X",
    gemstone: "Diamond or Opal",
    days: "Friday, Wednesday",
    direction: "South-East [Agneya]",
    planet: "Venus",
    deity: "Goddess Lakshmi",
    fast: "Friday",
    dates: "6th, 15th, 24th",
    mantra: "Om Shum Shukraya Namah",
    place: "Beautiful, clean, well-lit spaces support your focus, charm, and relationship harmony.",
    time: "April to May and October to November are supportive for love, design, and comfort.",
    remedies: [
      "Keep your bedroom and work area uncluttered.",
      "Practice generosity without overcommitting.",
      "Use white, pink, or pastel tones on relationship-heavy days.",
    ],
  },
  7: {
    signs: "Pisces, Scorpio",
    alphabets: "G, P, Y",
    gemstone: "Cat's Eye",
    days: "Monday, Thursday",
    direction: "West [Paschim]",
    planet: "Ketu",
    deity: "Lord Ganesha",
    fast: "Thursday",
    dates: "7th, 16th, 25th",
    mantra: "Om Ketave Namah",
    place: "Quiet rooms, libraries, retreats, and water-side places help your intuition become practical.",
    time: "February, July, and November support spiritual work, research, and private decisions.",
    remedies: [
      "Spend a few minutes daily in silence before major decisions.",
      "Avoid withdrawing when a clear conversation would solve the issue.",
      "Keep a simple journal for dreams, instincts, and repeating patterns.",
    ],
  },
  8: {
    signs: "Capricorn, Aquarius",
    alphabets: "H, Q, Z",
    gemstone: "Blue Sapphire",
    days: "Saturday, Friday",
    direction: "West [Paschim]",
    planet: "Saturn",
    deity: "Lord Hanuman",
    fast: "Saturday",
    dates: "8th, 17th, 26th",
    mantra: "Om Sham Shanicharaya Namah",
    place: "Structured offices, legal or financial spaces, and long-term assets suit your growth.",
    time: "January, August, and December favor discipline, savings, and responsibility.",
    remedies: [
      "Track expenses and commitments weekly.",
      "Serve elders, workers, or people carrying heavy responsibilities.",
      "Avoid shortcuts in money matters; slow correctness brings protection.",
    ],
  },
  9: {
    signs: "Aries, Scorpio",
    alphabets: "I, R",
    gemstone: "Red Coral",
    days: "Tuesday, Sunday",
    direction: "South [Dakshin]",
    planet: "Mars",
    deity: "Lord Hanuman",
    fast: "Tuesday",
    dates: "9th, 18th, 27th",
    mantra: "Om Ang Angarakaya Namah",
    place: "Training grounds, active work areas, and purposeful travel increase courage and momentum.",
    time: "March to April and October to November favor decisive action and closures.",
    remedies: [
      "Channel anger into exercise, service, or focused work.",
      "Avoid starting conflicts when tired or hungry.",
      "Use red carefully: as courage, not aggression.",
    ],
  },
};

const LIFE_DETAIL_BY_NUMBER: Record<number, NumerologyReport["lifeSections"]> = {
  1: {
    characteristics: [
      "You are at your best when you are trusted with ownership and a visible goal.",
      "You dislike unnecessary control from others and prefer to lead through action.",
      "Respect, recognition, and self-made progress matter strongly to your confidence.",
    ],
    health: [
      "Number 1 is traditionally linked with vitality, heart rhythm, eyes, blood pressure, and stress heat.",
      "A steady morning routine, sunlight, hydration, and regular movement support balance.",
      "Your energy improves when you avoid long periods of suppressed frustration.",
      "Short bursts of exercise are better for you than waiting for the perfect long routine.",
      "Protect sleep during high-pressure phases because leadership stress can show up physically.",
    ],
    wealth: [
      "Money improves when you choose leadership, independent projects, government-linked work, sales, technology, or roles with status.",
      "Avoid ego-based purchases and rushed investments; your best gains come through disciplined visibility.",
      "You earn better when you own outcomes instead of staying hidden in assistant-like roles.",
      "Personal branding, authority, and decisive communication can become strong income channels.",
      "Keep one trusted advisor for money decisions so confidence does not turn into over-risking.",
    ],
    happiness: [
      "Happiness increases when your day includes autonomy, praise earned through real work, and a mission bigger than routine.",
      "Practice asking for support before frustration turns into isolation.",
      "You feel lighter when you have a clear target and visible proof that progress is happening.",
      "Healthy competition motivates you, but comparison can drain your natural confidence.",
      "Respect is a major emotional need; choose circles where your effort is acknowledged.",
    ],
    compatibility: [
      "Supportive numbers: 1, 3, 5, 7, and 9. These numbers respect your independence and respond well to your direct energy.",
      "Number 3 brings expression and optimism, while number 5 brings movement, business sense, and quick decisions.",
      "Number 7 supports deeper thinking and spiritual growth; number 9 adds courage and shared ambition.",
      "Challenging numbers: 4 and 8. These can feel restrictive because they demand patience, structure, and delayed results.",
      "Number 2 and 6 can be gentle matches when you soften your tone and make space for emotional needs.",
    ],
    awareness: [
      "Use 1, 10, 19, and 28 for launches, personal branding, and decisive steps.",
      "Watch the 4 and 8 date cycle for pressure, delay, or authority lessons.",
    ],
  },
  2: {
    characteristics: [
      "You sense subtle shifts in people and often know what is unsaid.",
      "Partnership, patience, and tact are natural assets when you trust your intuition.",
    ],
    health: [
      "Number 2 is traditionally linked with digestion, fluids, sleep, mood, and hormonal balance.",
      "Regular rest, gentle routines, and emotional boundaries are protective.",
      "Your body often responds quickly to emotional stress, so calm environments matter.",
      "Moon-like rhythms help you: consistent meals, softer evenings, and less late-night overthinking.",
      "Hydration, light walks, and creative downtime can stabilize your nervous system.",
    ],
    wealth: [
      "Wealth grows through partnership, hospitality, design, care, counseling, writing, or client-focused work.",
      "Avoid financial choices made only to keep someone pleased.",
      "You do well when money is connected to trust, service quality, and repeat clients.",
      "A reliable partner or mentor can improve financial confidence and decision speed.",
      "Track emotional spending, especially purchases made after conflict or loneliness.",
    ],
    happiness: [
      "You feel happiest around emotionally safe people, calm spaces, and creative rhythm.",
      "Direct communication prevents quiet resentment.",
      "A peaceful home or work corner has a bigger effect on your mood than you may realize.",
      "You need reassurance, but your confidence grows when you learn to self-soothe first.",
      "Music, art, water, and sincere conversations restore your emotional balance.",
    ],
    compatibility: [
      "Supportive numbers: 1, 2, 4, 6, and 7. These numbers can give emotional steadiness, loyalty, and a sense of being understood.",
      "Number 1 gives direction when you feel unsure, while number 6 brings care, comfort, and relationship warmth.",
      "Number 4 helps you ground your intuition into practical plans; number 7 understands your quieter inner world.",
      "Challenging numbers: 5 and 9. Number 5 may feel too restless, while number 9 can feel too intense or reactive.",
      "Number 8 can work well when both sides discuss expectations clearly and do not hide feelings behind duty.",
    ],
    awareness: ["Use 2, 11, 20, and 29 for reconciliation, collaboration, and creative decisions.", "Avoid overcommitting on days when mood is low."],
  },
  3: {
    characteristics: [
      "You are expressive, witty, and naturally drawn toward learning, guidance, and social influence.",
      "People often respond to your optimism, even when you are carrying serious thoughts inside.",
    ],
    health: [
      "Number 3 is traditionally linked with liver, throat, nerves, weight balance, and excess sweet or rich food.",
      "Rhythm in food, sleep, and screen time keeps your mind sharper.",
      "Your system improves when expression has a healthy outlet instead of staying bottled up.",
      "Watch irregular routines during social or creative phases; they can affect digestion and focus.",
      "Breathwork, singing, speaking practice, or journaling can release mental pressure.",
    ],
    wealth: [
      "Your money path strengthens through communication, teaching, marketing, media, consulting, law, education, or creative business.",
      "The main caution is scattered spending; budget before excitement peaks.",
      "You attract opportunities when your ideas are packaged clearly and consistently.",
      "Courses, content, public speaking, advisory work, and community-building can become income levers.",
      "Avoid too many parallel plans; wealth grows faster when one strong idea is completed.",
    ],
    happiness: [
      "You need expression, humor, friends, and visible progress to feel light.",
      "A creative outlet makes your emotional world easier to manage.",
      "You feel happiest when your voice matters and your ideas are received warmly.",
      "Learning something new keeps your optimism alive during routine-heavy periods.",
      "Choose friends who celebrate your growth without pulling you into distraction.",
    ],
    compatibility: [
      "Supportive numbers: 1, 3, 5, 6, and 9. These matches encourage your expression, creativity, humor, and social confidence.",
      "Number 1 helps you act on your ideas, while number 5 keeps life lively and mentally stimulating.",
      "Number 6 brings emotional warmth and beauty; number 9 adds courage and big-picture purpose.",
      "Challenging numbers: 4 and 8. They can feel heavy or controlling when you need freedom and creative flow.",
      "Number 2 and 7 can work if emotional sensitivity and personal space are respected.",
    ],
    awareness: ["Use 3, 12, 21, and 30 for teaching, content, learning, and public communication.", "Avoid promising too much in one burst of enthusiasm."],
  },
  4: {
    characteristics: ["You think in systems and become reliable under pressure.", "Your path improves when you let structure support you without making life rigid."],
    health: [
      "Number 4 is linked with bones, joints, skin, stress tension, and digestion under pressure.",
      "Consistent meals, sleep, and body movement matter more than intense short phases.",
      "Your body benefits from routine checklists, fixed rest windows, and reduced chaos.",
      "Long sitting or repetitive work can create stiffness, so build movement into the day.",
      "Stress becomes lighter when your workload is divided into practical weekly steps.",
    ],
    wealth: [
      "You build wealth through operations, engineering, analytics, property, processes, and disciplined saving.",
      "Avoid risky shortcuts and speculative choices made from frustration.",
      "Slow compounding suits you more than sudden high-drama opportunities.",
      "Your earning power rises when you create systems others can rely on.",
      "Keep written records, contracts, and budgets because clarity protects your money.",
    ],
    happiness: [
      "You feel safe when plans are clear and promises are kept.",
      "Leaving room for surprise keeps discipline from becoming heaviness.",
      "A clean workspace and predictable rhythm can calm your mind quickly.",
      "You feel valued when people notice your reliability, not only the final result.",
      "Allowing help can make life feel less like a permanent responsibility test.",
    ],
    compatibility: [
      "Supportive numbers: 1, 2, 4, 7, and 8. These numbers value loyalty, structure, depth, and long-term effort.",
      "Number 1 gives direction, number 2 brings softness, and number 7 understands your serious inner world.",
      "Number 8 can become a strong power match because both sides respect work, discipline, and responsibility.",
      "Challenging numbers: 3 and 5. Number 3 may feel scattered, and number 5 may feel unpredictable.",
      "Number 6 can work when family, money, and emotional duties are discussed openly.",
    ],
    awareness: ["Use 4, 13, 22, and 31 for system building and long-term repairs.", "Check contracts and details twice on these dates."],
  },
  5: {
    characteristics: ["You are quick, curious, persuasive, and built for movement.", "Your mind works best when options are open but priorities are clear."],
    health: [
      "Number 5 is linked with nerves, skin, respiratory rhythm, and overstimulation.",
      "Walking, breathwork, and fewer late-night inputs help your system reset.",
      "Your body responds well to variety, but it still needs a few non-negotiable routines.",
      "Caffeine, excessive scrolling, and irregular sleep can make your mind feel scattered.",
      "Travel and movement refresh you when paired with hydration and simple food discipline.",
    ],
    wealth: [
      "Commerce, sales, travel, media, trading, writing, and digital skills support money growth.",
      "Avoid impulsive purchases and short-lived ventures without a plan.",
      "You can monetize speed, communication, negotiation, and market awareness.",
      "Keep a decision filter for new opportunities so every exciting idea does not become a cost.",
      "A flexible income model suits you, but recurring revenue brings the stability you need.",
    ],
    happiness: [
      "Freedom, variety, conversation, and learning keep you alive inside.",
      "Commitment becomes easier when it still leaves space to experiment.",
      "You feel happiest when your week has movement, fresh ideas, and social exchange.",
      "Too much sameness can lower your mood, so plan healthy novelty intentionally.",
      "Choose relationships and work where curiosity is treated as a strength.",
    ],
    compatibility: [
      "Supportive numbers: 1, 3, 5, 6, and 9. These matches enjoy movement, communication, attraction, and fresh experiences.",
      "Number 1 supports fast decisions, while number 3 keeps conversation playful and expressive.",
      "Number 6 adds warmth and romance; number 9 adds passion and adventure.",
      "Challenging numbers: 2, 4, and 8. They may need more emotional certainty, routine, or commitment than you naturally prefer.",
      "Number 7 can work when both people respect privacy and avoid disappearing during confusion.",
    ],
    awareness: ["Use 5, 14, and 23 for communication, travel, interviews, and business movement.", "Avoid changing direction only because boredom appears."],
  },
  6: {
    characteristics: ["You carry charm, responsibility, beauty, and care.", "People may lean on you because your presence feels steady and refined."],
    health: [
      "Number 6 is linked with throat, kidneys, sugar balance, reproductive health, and comfort eating.",
      "Pleasure works best when paired with routine and moderation.",
      "Your body relaxes in beautiful, clean, peaceful surroundings.",
      "Emotional over-responsibility can create fatigue, so rest is part of your care cycle.",
      "Balanced food, music, and gentle movement help you return to harmony.",
    ],
    wealth: [
      "Design, luxury, service, hospitality, counseling, relationships, beauty, and home-related work can bring gains.",
      "Avoid spending to maintain appearances or emotional peace.",
      "You can earn well through taste, trust, presentation, and customer care.",
      "Money improves when you price your effort fairly instead of giving too much away.",
      "Family or relationship obligations should be budgeted clearly to avoid silent pressure.",
    ],
    happiness: [
      "Love, harmony, music, comfort, and beautiful surroundings feed you deeply.",
      "Boundaries keep care from becoming exhaustion.",
      "You feel happiest when home, relationships, and self-respect are aligned.",
      "Creative beauty, clothing, decor, fragrance, or food can quickly lift your state.",
      "Receiving care is as important as giving it; allow others to show up for you.",
    ],
    compatibility: [
      "Supportive numbers: 2, 3, 5, 6, and 9. These numbers connect with your warmth, beauty, care, and relationship focus.",
      "Number 2 brings emotional softness, while number 3 brings joy, expression, and social ease.",
      "Number 5 adds attraction and variety; number 9 brings loyalty, protection, and passion.",
      "Challenging numbers: 1, 7, and 8. Number 1 may feel dominant, number 7 distant, and number 8 too duty-heavy.",
      "Number 6 with another 6 can be deeply harmonious if both avoid over-expecting perfection.",
    ],
    awareness: ["Use 6, 15, and 24 for love, family, home, art, and healing conversations.", "Do not take responsibility for every emotional problem around you."],
  },
  7: {
    characteristics: ["You are thoughtful, observant, private, and drawn toward hidden meanings.", "You need solitude, but too much distance can make simple things feel complicated."],
    health: [
      "Number 7 is linked with nerves, sleep, digestion, mysterious fatigue, and sensitivity to environment.",
      "Water, silence, clean food, and regular grounding practices help.",
      "Your body may need solitude after intense people-heavy phases.",
      "Over-analysis can disturb rest, so evening mental closure is important.",
      "Nature, meditation, slow breathing, and reduced noise support your inner balance.",
    ],
    wealth: [
      "Research, spirituality, analytics, writing, technology, psychology, travel, and advisory roles can support money.",
      "Avoid waiting for perfect certainty before taking practical steps.",
      "You earn best when your knowledge is specialized and trusted.",
      "Private work, deep study, consulting, and insight-based services suit your money path.",
      "Do not undervalue your ideas simply because they arrive quietly.",
    ],
    happiness: [
      "You feel happy when life has meaning, space, and honest depth.",
      "Choose people who respect your privacy without making you disappear.",
      "Quiet success often satisfies you more than noisy attention.",
      "Spiritual practice, reading, research, and travel can restore wonder.",
      "A small circle of genuine people is better for you than constant social availability.",
    ],
    compatibility: [
      "Supportive numbers: 1, 2, 4, 7, and 9. These matches can respect your depth, privacy, and need for meaning.",
      "Number 1 gives confidence to your ideas, while number 2 understands your sensitivity without forcing it.",
      "Number 4 brings stability and patience; number 9 adds spiritual courage and emotional intensity.",
      "Challenging numbers: 5 and 6. Number 5 may feel too restless, while number 6 may ask for more visible affection than you easily show.",
      "Number 3 can help you express yourself, but you may need quiet breaks from its social energy.",
    ],
    awareness: ["Use 7, 16, and 25 for research, spiritual practice, planning, and deep decisions.", "Do not confuse temporary withdrawal with final truth."],
  },
  8: {
    characteristics: ["You are serious, capable, strategic, and shaped by responsibility.", "Your path often rewards patience after long periods of invisible effort."],
    health: [
      "Number 8 is linked with bones, teeth, joints, chronic stress, and circulation.",
      "Strength training, posture, sleep, and consistent treatment plans help.",
      "Your body responds well to disciplined maintenance rather than quick fixes.",
      "Heavy responsibility can sit in the back, knees, or shoulders, so recovery must be scheduled.",
      "Respecting limits prevents ambition from becoming physical exhaustion.",
    ],
    wealth: [
      "Money grows through management, finance, law, real estate, operations, and long-cycle work.",
      "Avoid pessimism and all-or-nothing risk.",
      "You are suited for assets, authority, negotiations, and work where patience is rewarded.",
      "Keep financial ethics very clean because number 8 magnifies consequences.",
      "Delayed gains are common, but consistent structure can create strong long-term wealth.",
    ],
    happiness: [
      "You feel secure when finances, duties, and long-term plans are clear.",
      "Softness and play are not distractions; they keep ambition humane.",
      "You feel happiest when your effort produces measurable stability.",
      "Respect, fairness, and loyalty matter deeply in your emotional life.",
      "Letting yourself enjoy small wins prevents life from becoming only duty.",
    ],
    compatibility: [
      "Supportive numbers: 2, 4, 6, and 8. These numbers understand responsibility, stability, home, money, and long-term building.",
      "Number 2 softens your seriousness, while number 4 helps create practical structure.",
      "Number 6 supports home and comfort; another 8 can become a strong ambition-and-assets partnership.",
      "Challenging numbers: 1, 3, 5, and 9. These may trigger power struggles, scattered priorities, impulsiveness, or intensity.",
      "Number 7 can work when both people respect silence, maturity, and slow trust.",
    ],
    awareness: ["Use 8, 17, and 26 for structure, savings, accountability, and long-term planning.", "Be extra careful with legal or financial shortcuts."],
  },
  9: {
    characteristics: ["You are intense, generous, protective, and motivated by causes.", "Your courage becomes magnetic when it is guided by compassion rather than reaction."],
    health: [
      "Number 9 is linked with inflammation, blood, fever, accidents, and pressure from anger.",
      "Exercise, cooling food, rest, and mindful response patterns help greatly.",
      "Your energy needs a physical outlet; otherwise intensity can become irritation.",
      "Be careful with haste, sharp tools, driving speed, and conflict during tired phases.",
      "Cooling routines, stretching, and enough water help balance your inner heat.",
    ],
    wealth: [
      "You can grow through leadership, sports, medicine, defense, engineering, public work, and mission-led business.",
      "Avoid impulsive losses caused by anger, pride, or rescue patterns.",
      "Money improves when your work protects, builds, heals, or solves urgent problems.",
      "You may attract sudden opportunities, but should pause before aggressive financial moves.",
      "Generosity is natural, but clear limits protect your savings and peace.",
    ],
    happiness: [
      "Purpose, movement, loyalty, and service make life feel meaningful.",
      "Release old battles so new joy has space to arrive.",
      "You feel happiest when your courage is used for creation, not constant defense.",
      "Adventure, service, fitness, and meaningful responsibility can lift your mood.",
      "Forgiveness does not weaken you; it frees energy for the next chapter.",
    ],
    compatibility: [
      "Supportive numbers: 1, 3, 5, 6, and 9. These matches connect with your courage, passion, generosity, and need for purpose.",
      "Number 1 creates a strong leadership bond, while number 3 brings humor and emotional lightness.",
      "Number 5 adds adventure and movement; number 6 brings affection, loyalty, and home energy.",
      "Challenging numbers: 2, 4, 7, and 8. These may feel too sensitive, rigid, withdrawn, or controlling during conflict.",
      "Another 9 can be powerful and passionate, but both people must manage anger and avoid ego battles.",
    ],
    awareness: ["Use 9, 18, and 27 for action, completion, courage, and clearing stuck situations.", "Pause before heated replies or major financial moves."],
  },
};

function reduceNumber(value: number): number {
  let n = Math.abs(Math.trunc(value));
  while (n > 9) {
    n = String(n)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
  }
  return n || 0;
}

function cleanName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function sumName(name: string, predicate?: (letter: string) => boolean): number {
  return cleanName(name)
    .split("")
    .reduce((sum, letter) => {
      if (predicate && !predicate(letter)) return sum;
      return sum + (CHALDEAN_VALUES[letter] || 0);
    }, 0);
}

function digitsFormula(parts: number[]): string {
  const digits = parts.flatMap((part) => String(part).split("").map(Number));
  const total = digits.reduce((sum, digit) => sum + digit, 0);
  return `${digits.join(" + ")} = ${total} = ${reduceNumber(total)}`;
}

function ordinalDayList(days: string): string {
  return days;
}

export function calculateNumerologyReport(input: NumerologyInput): NumerologyReport {
  const radicalRaw = input.birthDay;
  const radical = reduceNumber(radicalRaw);
  const destinyRaw = String(input.birthDay)
    .concat(String(input.birthMonth), String(input.birthYear))
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);
  const destiny = reduceNumber(destinyRaw);
  const nameRaw = sumName(input.name);
  const nameNumber = reduceNumber(nameRaw);
  const soulRaw = sumName(input.name, (letter) => VOWELS.has(letter));
  const soulUrge = reduceNumber(soulRaw);
  const personalityRaw = sumName(input.name, (letter) => !VOWELS.has(letter));
  const personality = reduceNumber(personalityRaw);

  const primary = NUMBER_PROFILES[radical] || NUMBER_PROFILES[1];
  const destinyProfile = NUMBER_PROFILES[destiny] || NUMBER_PROFILES[1];
  const nameProfile = NUMBER_PROFILES[nameNumber] || NUMBER_PROFILES[1];
  const favorable = FAVORABLE_PROFILES[radical] || FAVORABLE_PROFILES[1];
  const lifeSections = LIFE_DETAIL_BY_NUMBER[radical] || LIFE_DETAIL_BY_NUMBER[1];

  return {
    name: input.name.trim(),
    birthDateLabel: `${String(input.birthDay).padStart(2, "0")}-${String(input.birthMonth).padStart(2, "0")}-${input.birthYear}`,
    coreNumbers: [
      {
        key: "radical",
        label: "Radical Number",
        sanskritLabel: "Mulank",
        value: radical,
        formula: `${input.birthDay} = ${String(input.birthDay).split("").join(" + ")} = ${radical}`,
        summary: primary.short,
      },
      {
        key: "destiny",
        label: "Destiny Number",
        sanskritLabel: "Bhagyank / Life Path",
        value: destiny,
        formula: digitsFormula([input.birthDay, input.birthMonth, input.birthYear]),
        summary: destinyProfile.short,
      },
      {
        key: "name",
        label: "Name Number",
        sanskritLabel: "Namank",
        value: nameNumber,
        formula: `${nameRaw} = ${nameNumber} using Chaldean letter values`,
        summary: nameProfile.short,
      },
      {
        key: "soulUrge",
        label: "Soul Urge Number",
        sanskritLabel: "Inner Desire",
        value: soulUrge,
        formula: `Vowels total ${soulRaw} = ${soulUrge}`,
        summary: NUMBER_PROFILES[soulUrge]?.short || "",
      },
      {
        key: "personality",
        label: "Personality Number",
        sanskritLabel: "Outer Expression",
        value: personality,
        formula: `Consonants total ${personalityRaw} = ${personality}`,
        summary: NUMBER_PROFILES[personality]?.short || "",
      },
    ],
    primary,
    destiny: destinyProfile,
    nameProfile,
    favorable: {
      ...favorable,
      dates: ordinalDayList(favorable.dates),
    },
    lifeSections,
  };
}
