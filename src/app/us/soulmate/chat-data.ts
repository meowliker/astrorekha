import { usTaxCents } from "@/lib/us-soulmate-tax";
import { usPrice } from "@/lib/us-soulmate-prices";
import { COMPLETE_US_SOULMATE_NAME, COMPLETE_US_SOULMATE_TITLE } from "@/lib/us-soulmate-product-names";
export const steps = ["name", "heart", "preferenceSelection", "preference", "feeling", "birthDate", "ethnicity"] as const;
export type Step = typeof steps[number];
export type Answers = Partial<Record<Step, string>>;
export type Message = { id: string; role: "artist" | "visitor"; text: string; zodiac?: boolean };

export const choices = {
  heart: ["I keep attracting the wrong people", "I feel like I’ve been waiting forever", "I’m confused about someone in my life", "I’ve almost given up on love"],
  preferenceSelection: ["I like men", "I like women", "I’m open to both"],
  preference: ["I like men", "I like women", "I’m open to both"],
  feeling: ["Safe — someone who stays", "Passionate — someone who sees me", "Peaceful — no games or guessing"],
  ethnicity: ["North Indian", "South Indian", "East / Northeast Indian", "West / Central Indian", "Any Indian background"],
} satisfies Partial<Record<Step, string[]>>;

export function preferenceOptions(selected: string | undefined) {
  const man = { value: "I like men", label: selected === "I like men" ? "Yes, a man" : "No, I meant a man" };
  const woman = { value: "I like women", label: selected === "I like women" ? "Yes, a woman" : "No, I meant a woman" };
  if (selected === "I like men") return [man, woman];
  if (selected === "I like women") return [woman, man];
  return [
    { value: "I’m open to both", label: "Yes, I’m open to either" },
    { value: "I like men", label: "Actually, a man" },
    { value: "I like women", label: "Actually, a woman" },
  ];
}

export function messageDelay(message: Message) {
  if (message.role === "visitor") return 0;
  if (message.zodiac) return 1800;
  // Longer replies have longer typing pauses, including the closing messages.
  return Math.min(6500, Math.max(1400, 800 + message.text.length * 22));
}

export const deliveryPlans = [
  {
    id: "standard", name: "Soulmate Sketch", price: usPrice("standard"),
    checkoutTitle: "Soulmate Sketch - Reveal the portrait of your Soulmate",
    delivery: "within 48 hours", displayHours: 48, label: "Your personal sketch", cta: "Choose Soulmate Sketch",
    features: ["Soulmate sketch in black & white", "Delivered within 48 hours"],
  },
  {
    id: "express", name: COMPLETE_US_SOULMATE_NAME, price: usPrice("express"),
    checkoutTitle: COMPLETE_US_SOULMATE_TITLE,
    delivery: "within 12 hours", displayHours: 12, label: "The complete experience", cta: "Choose Complete Soulmate Vision",
    features: ["Soulmate sketch in color — see their eye color", "Full written soulmate reading and description", "Express priority delivery — within 12 hours"],
  },
] as const;
export type DeliveryId = typeof deliveryPlans[number]["id"];
export function priceWithTax(base: number) {
  const cents = Math.round(base * 100);
  const tax = usTaxCents(cents);
  return { base, tax: tax / 100, total: (cents + tax) / 100 };
}
export const formatRupees = (value: number) => !Number.isFinite(value) ? "Price coming soon" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);

export function birthDateError(value: string, today = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Please choose your full date of birth.";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "Please choose a valid date of birth.";
  if (year < today.getFullYear() - 120) return "Please check your birth year.";
  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age--;
  return age < 18 ? "This experience is for adults aged 18 and over." : null;
}

export function getZodiac(value: string) {
  const [, month, day] = value.split("-").map(Number);
  const signs = ["Capricorn", "Aquarius", "Pisces", "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn"];
  const boundaries = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22];
  const name = signs[month - 1 + (day >= boundaries[month - 1] ? 1 : 0)];
  const element = ["Taurus", "Virgo", "Capricorn"].includes(name) ? "Earth" : ["Aries", "Leo", "Sagittarius"].includes(name) ? "Fire" : ["Gemini", "Libra", "Aquarius"].includes(name) ? "Air" : "Water";
  const profiles: Record<string, [string, string]> = {
    Aries: ["You tend to meet life head-on. When something matters to you, you would rather be honest about it than spend weeks wondering where you stand.", "Under that confidence, there may be a wish to stop being the one who always makes the first move. You want someone who chooses you with the same courage you bring."],
    Taurus: ["You notice the little things: a remembered detail, a kept promise, the comfort of someone showing up again. For you, trust grows through consistency.", "You may give people more chances than they realize. But once your heart feels safe, you want to settle into love without having to keep checking whether it will stay."],
    Gemini: ["A good conversation can stay with you all day. You are drawn to someone who can follow your curiosity, make you laugh, and surprise you with a different perspective.", "People may see your lively side and miss the thoughts you keep to yourself. You want a connection where you can be quiet or uncertain, too, and still feel understood."],
    Cancer: ["You often feel a change in someone before they say a word. You remember how people made you feel, and you tend to show love through small, thoughtful acts.", "You may have become the person everyone leans on, even when you need support yourself. Deep down, you want someone with whom you can soften, without having to explain every feeling."],
    Leo: ["You bring warmth to the people you care about. When you love someone, you want them to feel noticed, encouraged, and proud to stand beside you.", "Behind your bright presence, you may wonder who would show up if you stopped holding everything together. You want to be cherished in ordinary moments, not only admired from a distance."],
    Virgo: ["You notice what needs doing, often before anyone asks. Your care can look like practical help, a thoughtful question, or remembering something another person forgot.", "You may be harder on yourself than you are on anyone else. The connection you long for lets you put down the need to get everything right and simply feel welcome as you are."],
    Libra: ["You care about how a connection feels for both people. Thoughtfulness, fairness, and the ability to talk through a disagreement matter more to you than grand gestures alone.", "You may have kept the peace by leaving some of your own wishes unsaid. You want someone who asks what you need and stays curious long enough to hear the honest answer."],
    Scorpio: ["You are not usually interested in a connection that stays on the surface. Trust takes time, but when it arrives, your loyalty and attention run deep.", "You may protect your softer feelings until someone has earned access to them. What you want is honesty that feels steady enough for you to stop looking for what is being left unsaid."],
    Sagittarius: ["You are drawn to possibility: a new place, an unexpected conversation, a person who sees the world a little differently. Shared laughter can open your heart quickly.", "Wanting freedom does not mean you want distance. You may be looking for someone who makes commitment feel like a shared adventure, with room for both of you to keep growing."],
    Capricorn: ["You tend to show care by being dependable. You think about the future, take promises seriously, and often do the quiet work that makes other people feel secure.", "You may be so used to being capable that asking for care feels unfamiliar. You want a partner who sees the tenderness behind your strength and does not make you earn every moment of rest."],
    Aquarius: ["You value a connection that begins with real friendship. Someone who respects your individuality and enjoys your unusual questions can mean more to you than a perfectly rehearsed romance.", "You may need time to turn a feeling into words. You want someone who respects that space without mistaking it for indifference, and who lets closeness develop in your own way."],
    Pisces: ["You often notice the feeling beneath a conversation. Imagination, kindness, and small moments of tenderness can make a connection feel meaningful to you very quickly.", "You may sometimes hold on to the possibility in someone longer than their actions deserve. The love you want gives your hope something solid to rest on: patience, honesty, and care that comes back to you."],
  };
  const [reflection, deeperReflection] = profiles[name];
  return { name, element, reflection, deeperReflection };
}

export function validateAnswer(step: Step, value: string): string | null {
  if (!value.trim()) return "Please add an answer to continue.";
  if (step === "birthDate") return birthDateError(value);
  if (value.length > (step === "name" ? 40 : 200)) return "Please keep your answer a little shorter.";
  if ((step === "preferenceSelection" || step === "preference" || step === "ethnicity") && !(choices[step] as readonly string[]).includes(value)) return "Please choose one of the options.";
  return null;
}

export function sanitizeAnswers(value: unknown): Answers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Answers = {};
  // Only restore a contiguous, validated conversation; ignore malformed stored data.
  for (const step of steps) {
    const answer = (value as Record<string, unknown>)[step];
    if (typeof answer !== "string" || validateAnswer(step, answer)) break;
    result[step] = answer.trim();
  }
  return result;
}

export function conversation(answers: Answers, location: string | null): Message[] {
  const messages: Message[] = [];
  const bot = (id: string, text: string, zodiac = false) => messages.push({ id, role: "artist", text, zodiac });
  const reply = (step: Step) => messages.push({ id: `answer-${step}`, role: "visitor", text: step === "birthDate" ? new Date(`${answers[step]}T12:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : answers[step]! });
  bot("hello", "Hi, I’m glad you’re here. 🤍");
  bot("introduction", "Let’s put a face to the love you’re curious about.");
  if (location) bot("location", `A little hello to you in ${location}. Make yourself comfortable — this moment is yours.`);
  bot("name", "Before we begin, what’s your first name?");
  if (!answers.name) return messages;
  reply("name");
  bot("welcome", `Lovely to meet you, ${answers.name}. I’ll ask a few short questions to make your sketch personal to you.`);
  bot("heart", "First, where is your heart right now?");
  if (!answers.heart) return messages;
  reply("heart");
  const heartReplies = [
    "That can be tiring. Let’s make some space for what you actually want from a connection.",
    "Waiting can start to feel personal. You deserve to look ahead with a little curiosity, at your own pace.",
    "Mixed feelings can be hard to untangle. You don’t need to have everything figured out to explore this.",
    "I hear you. You don’t have to force yourself to feel hopeful today — a little curiosity is enough.",
  ];
  bot("heart-reply", heartReplies[choices.heart.indexOf(answers.heart)] || "Thank you for sharing that with me. I’ll keep what matters to you in mind as we continue.");
  bot("preferenceSelection", "When you imagine your soulmate, who would you like your sketch to show?");
  if (!answers.preferenceSelection) return messages;
  reply("preferenceSelection");
  const selectedFace = answers.preferenceSelection === "I like men" ? "a MAN" : answers.preferenceSelection === "I like women" ? "a WOMAN" : null;
  bot("preference", selectedFace ? `Let me make sure I have that right: you’d like your sketch to show ${selectedFace}?` : "Just to confirm: you’re happy for your sketch to show either a man or a woman?");
  if (!answers.preference) return messages;
  messages.push({ id: "answer-preference", role: "visitor", text: preferenceOptions(answers.preferenceSelection).find((option) => option.value === answers.preference)?.label || answers.preference });
  bot("preference-confirmed", answers.preference === "I like men" ? "Got it — a man. Thank you for confirming." : answers.preference === "I like women" ? "Got it — a woman. Thank you for confirming." : "Got it — you’re open to either. Thank you for confirming.");
  bot("feeling", `Take a breath, ${answers.name}. What would you most like that connection to feel like?`);
  if (!answers.feeling) return messages;
  reply("feeling");
  const feelingReplies = [
    "A feeling of safety. I’ll keep that sense of warmth and steadiness in mind for your portrait.",
    "Being truly seen. I’ll keep that spark and expressiveness in mind for your portrait.",
    "A little peace. I’ll keep that gentle, easy presence in mind for your portrait.",
  ];
  bot("feeling-reply", feelingReplies[choices.feeling.indexOf(answers.feeling)] || "I’ll keep that feeling in mind as part of the inspiration for your sketch.");
  bot("birthDate", "And what’s your date of birth? Let’s discover the zodiac inspiration behind your sketch.");
  if (!answers.birthDate) return messages;
  reply("birthDate");
  const zodiac = getZodiac(answers.birthDate);
  bot("birth-pause", "Give me a moment with this. You don’t need to type anything yet…");
  bot("zodiac", zodiac.name, true);
  bot("zodiac-name", `${zodiac.name}. I had a feeling, ${answers.name}.`);
  bot("zodiac-reflection", `A ${zodiac.element.toLowerCase()} sign. ${zodiac.reflection}`);
  bot("zodiac-deeper", `${answers.name}, there’s a softer side to this, too. ${zodiac.deeperReflection}`);
  bot("ethnicity", "One more thing, so I can shape the portrait: which Indian background would you like your soulmate sketch to reflect?");
  if (!answers.ethnicity) return messages;
  reply("ethnicity");
  bot("complete", `That’s everything I need, ${answers.name}. Stay with me for a moment…`);
  bot("gathering", "I’m bringing your answers and zodiac inspiration together. Give me a little moment with them. ✨");
  bot("ready", `${answers.name}, I have what I need now.`);
  bot("portrait-intro", "The next step is your personalized soulmate sketch — a face inspired by the connection you’ve described and the preferences you’ve shared.");
  bot("offer", "Your personalized soulmate sketch is ready to order. Choose a black-and-white Soulmate Sketch, or the Complete Soulmate Vision with a color sketch, full written reading and express priority delivery.");
  return messages;
}
