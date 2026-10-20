import type { WitchKey, WitchTrait } from "./witch-archetype";

export interface WitchArchetypeDetails {
  // Editorial, independent archetype emphases. These are not psychometric measurements.
  qualities: Record<WitchTrait, number>;
  craftSignature: { element: string; symbol: string; setting: string; intention: string };
  ritual: { title: string; steps: string[] };
  shadowQuestion: string;
  whyThisArchetype: string;
  innerNature: string;
  strengths: string[];
  whenAligned: string;
  emotionalPattern: string;
  underPressure: string;
  decisionStyle: string;
  friendship: string;
  love: string;
  workRhythm: string;
  growthFocus: string;
  dailyPractices: string[];
  affirmation: string;
}

export const WITCH_ANSWER_ACCENTS: Record<WitchTrait, string> = {
  intuition: "You often looked for the quieter signal before acting. Give that instinct space, then check it against what you can observe.",
  care: "You considered how a choice would affect other people. Keep that empathy while making room for your own needs.",
  creation: "You reached for a new possibility or a way to make something. Choose one idea to develop beyond the first spark.",
  courage: "You were willing to move while the outcome was uncertain. Let your values guide where that boldness belongs.",
  grounding: "You preferred a steady, practical next step. Your consistency can make an ambitious idea sustainable.",
  renewal: "You noticed when an old form could be released. Carry its useful lessons into whatever you begin next.",
};

export const WITCH_ARCHETYPE_DETAILS: Record<WitchKey, WitchArchetypeDetails> = {
  moon_seer: {
    qualities: { intuition: 80, care: 45, creation: 70, courage: 25, grounding: 55, renewal: 35 },
    craftSignature: { element: "Moonlight", symbol: "A silver crescent", setting: "A quiet window or notebook", intention: "Turn a subtle feeling into a clear question" },
    ritual: { title: "The signal and the fact", steps: ["Write down one feeling or hunch without judging it.", "Beside it, record one thing you directly observed.", "Choose a small, reversible action that could help you learn more."] },
    shadowQuestion: "When does searching for another sign keep you from using what you already know?",
    whyThisArchetype: "The Moon Seer suits you because you notice the meaning beneath ordinary moments. You take in subtle shifts, sit with them, and turn what you sense into a fresh perspective. Your natural path is to make that quiet insight useful and shareable.",
    innerNature: "You often understand an experience before you can explain it. Images, patterns, and small changes in tone carry meaning for you. Solitude helps you sort a useful insight from a passing mood; expression helps you make that insight real.",
    strengths: ["Seeing connections that others miss", "Giving language to complicated feelings", "Combining imagination with careful observation", "Helping people ask a better question"],
    whenAligned: "You trust a hunch enough to explore it, then test it with evidence. Your imagination becomes useful work instead of remaining a private possibility.",
    emotionalPattern: "You may need more time than others to name what you feel. A quiet walk, notebook, or conversation with one trusted person can help your first impression become clear.",
    underPressure: "You can collect more signs than you need and delay a decision while trying to interpret them all. Choose one observation you can verify and one small action you can reverse.",
    decisionStyle: "You notice the subtle option first, then make your best choices when you pair that instinct with a practical check. Ask: what do I sense, what do I know, and what can I try?",
    friendship: "You prefer a few friendships with depth over constant company. Tell friends when you need quiet time so your distance is not mistaken for disinterest.",
    love: "You need curiosity and emotional honesty. Share your interpretation as a question rather than assuming you already know what your partner feels.",
    workRhythm: "Give yourself space to explore, followed by a clear deadline to share. Research, writing, design, and strategy suit your eye for hidden structure.",
    growthFocus: "Practice making your insights visible. A draft, sketch, or honest sentence gives other people something they can respond to.",
    dailyPractices: ["Write one hunch and one observable fact beside it", "Spend ten minutes making an idea tangible", "Ask one clarifying question before drawing a conclusion"],
    affirmation: "I can trust my perception and still stay open to what I learn.",
  },
  hearth_keeper: {
    qualities: { intuition: 45, care: 80, creation: 35, courage: 55, grounding: 70, renewal: 25 },
    craftSignature: { element: "Hearth", symbol: "A warm circle", setting: "A table made welcoming", intention: "Make care sustainable and reciprocal" },
    ritual: { title: "The shared cup", steps: ["Prepare a drink or a simple place to pause.", "Name one need of your own before thinking of someone else's.", "Offer one act of care you can give freely, and let another task wait."] },
    shadowQuestion: "Where have you made being needed the price of belonging?",
    whyThisArchetype: "The Hearth Keeper suits you because your care has substance. You remember what matters to people, make everyday life steadier, and build trust through what you consistently do. Your presence gives others room to feel safe and grow.",
    innerNature: "You notice the practical details that make people feel welcome: a remembered preference, a steady promise, a place to rest. Your warmth is strongest when it has structure, and your structure is kindest when it leaves room for change.",
    strengths: ["Making care visible through dependable actions", "Creating trust in groups and close relationships", "Noticing needs before they become crises", "Building routines that help others flourish"],
    whenAligned: "You support without taking over. People know what they can count on from you, and you leave enough energy to meet your own needs too.",
    emotionalPattern: "You often register another person's discomfort quickly and may put your own feelings second. Give yourself a moment to ask what belongs to you before responding.",
    underPressure: "You may become indispensable in ways that exhaust you. A clear request for help can protect the connection better than silently doing everything.",
    decisionStyle: "You think about the people affected and the resources available. Your best decisions include a limit: what can you offer sustainably?",
    friendship: "You are the friend who follows through. Let others know when you want companionship rather than another person to care for.",
    love: "Consistency matters more to you than grand promises. You thrive with someone who notices your effort and shares the everyday work of a relationship.",
    workRhythm: "You excel where continuity and trust matter: teaching, operations, care, hospitality, and community building. Protect time for focused work between requests.",
    growthFocus: "Let receiving become part of your definition of care. Your value does not depend on being needed every minute.",
    dailyPractices: ["Name one need of your own before the day begins", "Turn an unspoken expectation into a clear request", "Keep one small ritual that restores you"],
    affirmation: "I create warmth without carrying everything alone.",
  },
  wild_alchemist: {
    qualities: { intuition: 45, care: 35, creation: 55, courage: 70, grounding: 25, renewal: 80 },
    craftSignature: { element: "Wildfire", symbol: "A turning spiral", setting: "An open path or cleared desk", intention: "Change form while keeping the lesson" },
    ritual: { title: "Release and retain", steps: ["On paper, name a chapter that feels complete.", "Write one lesson you will carry into the next chapter.", "Put the page away and take one small action toward the new beginning."] },
    shadowQuestion: "What would you have to feel if you stopped moving for a moment?",
    whyThisArchetype: "The Wild Alchemist suits you because you recognize when an old chapter has run its course. You can face a threshold that others avoid and imagine who you might become beyond it. Your strength lies in changing consciously while carrying your hard-won lessons forward.",
    innerNature: "You are alert to the moment when an old way stops fitting. Change gives you energy, especially when it serves a truth you can no longer ignore. You are at your best when you carry the lesson forward instead of discarding the whole past.",
    strengths: ["Finding possibility inside a difficult transition", "Taking action when a chapter needs to close", "Helping others imagine life after a setback", "Adapting your identity without losing your core values"],
    whenAligned: "You choose change deliberately. Your courage is paired with a plan, and the people affected know what is happening rather than being left to guess.",
    emotionalPattern: "Restlessness may be your first clue that something matters. Before changing everything, ask whether you need an ending, a boundary, or a smaller adjustment.",
    underPressure: "You can mistake movement for progress and begin the next chapter before processing the last one. Pause long enough to name what you are keeping.",
    decisionStyle: "You see the cost of staying still clearly. Add one stabilizing question: what support will help this change last after the first burst of momentum?",
    friendship: "You bring honesty and fresh energy to your circle. Let friends know which parts of you are changing and which commitments remain steady.",
    love: "You need room to evolve together. Invite a partner into the process early, especially when your inner shift is not yet visible from the outside.",
    workRhythm: "Transformation projects, entrepreneurship, crisis response, and creative reinvention suit you. Pair bold starts with a collaborator or routine that supports completion.",
    growthFocus: "Learn the difference between release and escape. Integration gives your next chapter roots.",
    dailyPractices: ["Name one thing to release and one lesson to retain", "Take a small reversible step before a sweeping change", "Tell one trusted person what you are becoming"],
    affirmation: "I can change with courage and carry forward what matters.",
  },
  star_weaver: {
    qualities: { intuition: 55, care: 45, creation: 80, courage: 25, grounding: 35, renewal: 70 },
    craftSignature: { element: "Starlight", symbol: "A woven constellation", setting: "A page, canvas, or worktable", intention: "Give one possibility a form others can see" },
    ritual: { title: "Three stars, one thread", steps: ["List three ideas that keep returning.", "Circle one that matters to you now and set the others aside.", "Make a first version in twenty minutes, then show it to someone you trust."] },
    shadowQuestion: "Which unfinished possibility protects you from finding out what a finished one could do?",
    whyThisArchetype: "The Star Weaver suits you because you can see possibilities where others see separate pieces. You bring ideas, people, and experiences together into something new. When you give one vision a practical shape, your imagination becomes a gift others can join.",
    innerNature: "You connect ideas across places, people, and disciplines. Possibility feels vivid to you long before it has a plan. Your imagination becomes a gift to others when you build a simple bridge from vision to first version.",
    strengths: ["Combining unlikely ideas into fresh solutions", "Helping groups imagine a better option", "Finding beauty and meaning in change", "Starting creative work that invites collaboration"],
    whenAligned: "Your curiosity has a container. You keep a few promising ideas in motion and bring one of them far enough into the world to be tested.",
    emotionalPattern: "Inspiration lifts your energy, while repetitive finishing work can drain it. Notice when you need rest and when you need a smaller, clearer milestone.",
    underPressure: "You may open more possibilities when the real task is to choose. A constraint can be an ally rather than a threat to your creativity.",
    decisionStyle: "You compare possible futures quickly. Pick the option that serves your current priority, then set a date to review instead of reopening every choice daily.",
    friendship: "You bring play, ideas, and interesting people together. Follow up on plans so your friends experience your enthusiasm as reliable presence.",
    love: "You need room to dream aloud and room to be ordinary. Shared routines can give your relationship a stable place for new possibilities to grow.",
    workRhythm: "Design, storytelling, education, product work, and collaborative ventures use your gifts well. Work in cycles: explore, choose, make, show, refine.",
    growthFocus: "Finishing is another form of imagination. Let a small completed piece teach you more than a perfect idea kept private.",
    dailyPractices: ["Capture new ideas without starting all of them", "Give one chosen idea a thirty-minute making session", "Share an imperfect draft with someone useful"],
    affirmation: "I give my ideas shape, time, and a chance to grow.",
  },
  threshold_guardian: {
    qualities: { intuition: 45, care: 70, creation: 25, courage: 80, grounding: 55, renewal: 35 },
    craftSignature: { element: "Stone", symbol: "An open gate", setting: "A doorway or boundary you choose", intention: "Protect what matters with proportionate action" },
    ritual: { title: "The boundary at the gate", steps: ["Name the value you want to protect.", "Ask whether the moment calls for listening, a boundary, or action.", "Speak one clear sentence that honors both your value and the other person's agency."] },
    shadowQuestion: "Which responsibility could you share instead of carrying alone?",
    whyThisArchetype: "The Threshold Guardian suits you because you act when a person or principle needs protection. Your directness comes from loyalty, and you are willing to take responsibility when a moment asks for it. Your best power is brave action guided by listening and care.",
    innerNature: "You notice when a line has been crossed and feel an urge to act. Your courage comes from devotion to people and principles, not from a need for conflict. Discernment helps you protect what matters with the least force needed.",
    strengths: ["Speaking up when silence would cost too much", "Creating safety through clear boundaries", "Taking responsibility in uncertain moments", "Helping others find courage of their own"],
    whenAligned: "You are decisive and fair. You listen to the people involved, name the value at stake, and choose an action proportionate to the situation.",
    emotionalPattern: "Concern may arrive as urgency. Give yourself a brief pause to learn whether someone needs protection, support, or simply to be heard.",
    underPressure: "You can carry every problem as if it were yours to solve. Shared responsibility and a calm boundary are often stronger than a solo rescue.",
    decisionStyle: "You move quickly once a principle is clear. Check who else is affected and what response will still feel right tomorrow.",
    friendship: "You are loyal and willing to show up in hard moments. Ask friends what kind of help they want before stepping into action.",
    love: "Trust grows through honesty and mutual protection. Leave room for vulnerability, disagreement, and your partner's own agency.",
    workRhythm: "Advocacy, leadership, mediation, safety, and high-responsibility roles fit you. Build recovery time after demanding decisions.",
    growthFocus: "Make room for gentleness in your courage. You do not have to prove devotion by taking on every battle.",
    dailyPractices: ["Write down the value behind one difficult choice", "Ask whether support or action is needed", "Delegate or decline one responsibility that is not yours"],
    affirmation: "My courage is clear, caring, and wisely directed.",
  },
  earth_oracle: {
    qualities: { intuition: 70, care: 55, creation: 25, courage: 35, grounding: 80, renewal: 45 },
    craftSignature: { element: "Earth", symbol: "A rooted branch", setting: "A familiar path outdoors", intention: "Notice what repeats and make one grounded choice" },
    ritual: { title: "The three observations", steps: ["Walk slowly or sit somewhere familiar for five minutes.", "Notice three things that have changed since your last visit.", "Choose one modest adjustment to try this week, and review what it taught you."] },
    shadowQuestion: "When is patience helping you see clearly, and when is it delaying a choice?",
    whyThisArchetype: "The Earth Oracle suits you because your insight grows from close attention to real life. You notice what repeats, trust experience, and turn quiet understanding into dependable choices. Your steadiness makes space for others to slow down and see clearly too.",
    innerNature: "You learn from repetition and trust what experience reveals over time. Your intuition is quiet and practical: you notice a pattern, observe it again, and act when it has earned your trust. Stability gives you space to hear it.",
    strengths: ["Staying steady while others rush", "Noticing small changes with long-term meaning", "Turning insight into useful routines", "Making careful choices that last"],
    whenAligned: "Your patience supports movement rather than postponing it. You use what you know, test what you suspect, and adjust without losing your center.",
    emotionalPattern: "You may process feelings slowly and through the body. A walk, rest, or familiar task can reveal what was difficult to name in the moment.",
    underPressure: "You can hold on to a safe pattern after it stops serving you. A small experiment lets you explore change without abandoning your need for steadiness.",
    decisionStyle: "You weigh evidence and lived experience. Set a reasonable point at which you have enough information to choose, even if certainty is unavailable.",
    friendship: "You offer calm attention and remember what matters. Let friends see your own concerns rather than always being the steady listener.",
    love: "You value trust that grows through repeated actions. Tell a partner what reassurance and space look like for you instead of expecting them to infer it.",
    workRhythm: "Research, craft, stewardship, planning, and detailed care suit you. You do your best work with clear priorities and uninterrupted time.",
    growthFocus: "Let a good foundation support exploration. One modest risk can deepen your confidence in the ground beneath you.",
    dailyPractices: ["Notice one recurring signal in your day", "Turn that observation into one practical adjustment", "Try a small change and review it after a week"],
    affirmation: "I trust my pace and take the next grounded step.",
  },
};
