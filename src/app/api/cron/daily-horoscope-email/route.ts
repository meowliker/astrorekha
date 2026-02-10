import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendTemplateEmail, BREVO_TEMPLATES } from "@/lib/brevo";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily-horoscope-email
 *
 * Cron job that sends daily personalized emails to active subscribers.
 * Randomly picks between a HOROSCOPE day or a TIP day.
 *
 * - Horoscope day: fetches today's horoscope per sign from Divine API / cache
 * - Tip day: picks a curated tip based on the user's zodiac element
 *
 * Protected by CRON_SECRET to prevent unauthorized access.
 */

const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const SIGN_ELEMENTS: Record<string, string> = {
  Aries: "Fire", Taurus: "Earth", Gemini: "Air", Cancer: "Water",
  Leo: "Fire", Virgo: "Earth", Libra: "Air", Scorpio: "Water",
  Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water",
};

// Daily themes that rotate by day of week
const DAILY_THEMES: Record<number, { theme: string; emoji: string }> = {
  0: { theme: "Weekly Reflection", emoji: "🌟" },
  1: { theme: "Love & Relationships", emoji: "💕" },
  2: { theme: "Career & Money", emoji: "💼" },
  3: { theme: "Health & Wellness", emoji: "🌿" },
  4: { theme: "Personal Growth", emoji: "✨" },
  5: { theme: "Weekend Preview", emoji: "🎯" },
  6: { theme: "Spiritual Insight", emoji: "🔮" },
};

// ── Curated tips bank by element ────────────────────────────────────
const TIPS_BY_ELEMENT: Record<string, string[]> = {
  Fire: [
    "Your fire energy is powerful today. Channel it into one focused goal instead of scattering it across many. Light a candle, set an intention, and let the universe meet you halfway.",
    "As a Fire sign, your enthusiasm is contagious. Use it to inspire someone around you today — a kind word from you can ignite someone else's confidence.",
    "Feeling restless? That's your inner fire asking for movement. Go for a walk, dance, or try something physically challenging. Your body needs to burn off that creative energy.",
    "Your boldness is your superpower, but today try the power of patience. Sometimes the best action is strategic stillness — let things come to you.",
    "Fire signs thrive on passion. Today, reconnect with something you loved as a child — drawing, playing, exploring. That spark of joy is still inside you.",
    "Your competitive spirit serves you well, but today focus on competing only with yesterday's version of yourself. Growth is personal, not comparative.",
    "The stars suggest a burst of creative energy today. Write down three wild ideas — no matter how unrealistic. One of them might just change your path.",
    "Your natural leadership shines brightest when you lift others up. Today, celebrate someone else's win genuinely. The universe rewards generosity of spirit.",
  ],
  Earth: [
    "Ground yourself today, Earth sign. Take off your shoes, feel the grass or floor beneath you, and breathe deeply for 2 minutes. Your stability is your gift to the world.",
    "Your practical nature is an asset, but today allow yourself to dream without limits. Write down your wildest vision — the universe doesn't judge the size of your dreams.",
    "Earth signs find peace in routine. Today, add one tiny new ritual — a morning stretch, a gratitude note, or a mindful cup of tea. Small shifts create big transformations.",
    "You're naturally reliable, but remember: you can't pour from an empty cup. Today, say no to one thing that drains you and yes to one thing that fills you up.",
    "Your connection to the material world is strong. Today, declutter one small space — a drawer, your desk, your phone. Physical clarity creates mental clarity.",
    "Earth signs are builders. Today, take one small step toward a long-term goal you've been putting off. Progress, not perfection, is your mantra.",
    "Nature is calling you today. Even 10 minutes outside — watching clouds, feeling the breeze — can reset your entire nervous system. You're an Earth sign; the earth heals you.",
    "Your patience is legendary, but today check in: are you being patient or just avoiding a necessary conversation? Sometimes growth requires gentle confrontation.",
  ],
  Air: [
    "Your mind is buzzing with ideas today, Air sign. Capture them — voice notes, sticky notes, whatever works. Your best idea might come disguised as a random thought.",
    "Air signs thrive on connection. Today, reach out to someone you haven't spoken to in a while. A simple message can rekindle a meaningful bond.",
    "Information overload is real for Air signs. Today, take a 30-minute digital detox. Put your phone in another room and just be. Your mind will thank you.",
    "Your gift of communication is powerful. Today, use it intentionally — speak words of encouragement to yourself. The way you talk to yourself shapes your reality.",
    "Feeling scattered? That's your Air nature trying to explore everything at once. Today, pick your top 3 priorities and let everything else wait. Focus is freedom.",
    "Air signs are natural mediators. If there's tension around you today, trust your ability to see all sides. Your balanced perspective is exactly what's needed.",
    "Your curiosity is a superpower. Today, learn one new thing — watch a documentary, read an article, or ask someone about their expertise. Knowledge feeds your soul.",
    "Overthinking is the shadow side of your brilliant mind. Today, when you catch yourself spiraling, place your hand on your chest and take 5 slow breaths. Come back to now.",
  ],
  Water: [
    "Your intuition is especially strong today, Water sign. That gut feeling you've been ignoring? Pay attention to it. Your emotions are data, not noise.",
    "Water signs absorb the energy around them. Today, protect your peace — if a conversation or situation feels heavy, it's okay to step away. Your sensitivity is a strength, not a weakness.",
    "Journaling is medicine for Water signs. Today, write down how you're really feeling — no filter, no judgment. Getting emotions on paper frees them from your body.",
    "Your empathy is a gift, but today practice compassionate boundaries. You can care about someone without carrying their burden. Their journey is theirs to walk.",
    "Water finds its way around any obstacle. Today, instead of forcing a solution, flow with the situation. The answer will reveal itself when you stop pushing.",
    "Your emotional depth allows you to connect with people on a soul level. Today, have one meaningful conversation — not small talk, but real talk. It will fill your cup.",
    "Water signs are natural healers. Today, heal yourself first — take a bath, listen to calming music, or sit near water. You can't heal others from a place of depletion.",
    "The Moon affects you more than most. Check today's moon phase and notice how it mirrors your mood. Understanding your cycles gives you power over them.",
  ],
};

// ── Sign-specific tip additions ─────────────────────────────────────
const SIGN_SPECIFIC_TIPS: Record<string, string[]> = {
  Aries: [
    "Aries, your ruling planet Mars gives you warrior energy today. Use it wisely — fight for what matters, not everything that irritates you.",
    "Your impulsive side wants to act NOW. Today, try the 10-minute rule: wait 10 minutes before any big decision. If it still feels right, go for it.",
  ],
  Taurus: [
    "Taurus, Venus blesses you with an eye for beauty today. Surround yourself with things that please your senses — flowers, good food, soft music.",
    "Your stubbornness can be reframed as determination. Today, channel it toward a positive habit you've been trying to build.",
  ],
  Gemini: [
    "Gemini, Mercury sharpens your wit today. Use your words to uplift, not just entertain. A thoughtful compliment from you can change someone's entire day.",
    "Your dual nature isn't a flaw — it's versatility. Today, embrace both sides of yourself without judgment.",
  ],
  Cancer: [
    "Cancer, the Moon is your guide today. Create a cozy sanctuary at home — even rearranging one corner can shift the energy of your entire space.",
    "Your nurturing instinct is beautiful, but today nurture yourself first. Cook your favorite meal, wrap up in a blanket, and just be.",
  ],
  Leo: [
    "Leo, the Sun fuels your radiance today. Step into the spotlight — share your work, speak up in a meeting, or post that thing you've been hesitating about.",
    "Your generosity is legendary, Leo. Today, be generous with yourself too. You deserve the same love you give so freely to others.",
  ],
  Virgo: [
    "Virgo, Mercury gives you laser focus today. Use it to tackle that one task you've been procrastinating on. You'll feel lighter once it's done.",
    "Your inner critic is loud, but today practice self-compassion. You're doing better than you think. Progress isn't always visible.",
  ],
  Libra: [
    "Libra, Venus enhances your charm today. Use it to smooth over any rough edges in your relationships. A gentle approach works wonders.",
    "Your desire for balance is noble, but today accept that some days are messy. Imperfect action beats perfect inaction every time.",
  ],
  Scorpio: [
    "Scorpio, Pluto deepens your insight today. Trust what you sense beneath the surface — your ability to read between the lines is unmatched.",
    "Your intensity is magnetic, Scorpio. Today, direct it inward — meditate, reflect, or dive deep into a subject that fascinates you.",
  ],
  Sagittarius: [
    "Sagittarius, Jupiter expands your horizons today. Plan a future adventure — even researching a dream destination can lift your spirits.",
    "Your optimism is infectious, Sag. Today, share it with someone who's struggling. Your perspective can be the light they need.",
  ],
  Capricorn: [
    "Capricorn, Saturn rewards your discipline today. Review your goals and celebrate how far you've come. You're closer than you think.",
    "Your ambition drives you, but today remember: rest is productive too. The mountain isn't going anywhere. Recharge so you can climb stronger.",
  ],
  Aquarius: [
    "Aquarius, Uranus sparks innovation today. That unconventional idea you've been sitting on? The world might be ready for it now.",
    "Your humanitarian spirit is beautiful, Aquarius. Today, start small — one act of kindness in your immediate circle creates ripples you can't see.",
  ],
  Pisces: [
    "Pisces, Neptune heightens your creativity today. Express yourself through art, music, or writing. Your imagination is a portal to healing.",
    "Your dreamy nature is a gift, Pisces. Today, ground one dream into reality — write down one concrete step you can take this week.",
  ],
};

function extractSignName(sign: any): string | null {
  if (!sign) return null;
  if (typeof sign === "string") return sign;
  if (sign.name) return sign.name;
  return null;
}

function getRandomTip(sign: string): string {
  const element = SIGN_ELEMENTS[sign] || "Fire";
  const elementTips = TIPS_BY_ELEMENT[element] || TIPS_BY_ELEMENT["Fire"];
  const signTips = SIGN_SPECIFIC_TIPS[sign] || [];

  // 40% chance of sign-specific tip, 60% element tip
  const allTips = signTips.length > 0 && Math.random() < 0.4 ? signTips : elementTips;
  return allTips[Math.floor(Math.random() * allTips.length)];
}

function isHoroscopeDay(): boolean {
  // Roughly 50/50 random, but seeded by date so all users get the same type on the same day
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return seed % 2 === 0;
}

/**
 * Returns the current hour (0-23) in a given IANA timezone.
 * Returns null if the timezone string is invalid.
 */
function getHourInTimezone(tz: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    return hourPart ? parseInt(hourPart.value, 10) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const today = new Date();
    const dayOfWeek = today.getDay();
    const theme = DAILY_THEMES[dayOfWeek] || DAILY_THEMES[4];
    const dateStr = today.toISOString().split("T")[0];
    const utcHour = today.getUTCHours();

    // Decide: horoscope day or tip day
    const sendHoroscope = isHoroscopeDay();
    const contentType = sendHoroscope ? "horoscope" : "tip";
    const contentTypeLabel = sendHoroscope ? "Daily Horoscope" : "Cosmic Tip";
    const contentEmoji = sendHoroscope ? "🔮" : "✨";

    console.log(`[Cron] ${dateStr} UTC ${utcHour}:00 — Sending ${contentType} emails (theme: ${theme.theme})`);

    // 1. Get all active subscribers
    const usersSnapshot = await adminDb
      .collection("users")
      .where("subscriptionStatus", "==", "active")
      .get();

    if (usersSnapshot.empty) {
      return NextResponse.json({
        success: true,
        message: "No active subscribers found",
        contentType,
        sent: 0,
      });
    }

    // 2. Group users by sun sign — only include users whose local time is 9 AM
    const signGroups: Record<string, Array<{ email: string; docId: string }>> = {};
    let skippedTimezone = 0;
    let skippedAlreadySent = 0;
    const TARGET_HOUR = 9; // Send at 9 AM local time
    const sentKey = `daily_email_sent_${dateStr}`;

    for (const userDoc of usersSnapshot.docs) {
      const data = userDoc.data();
      const email = data.email;
      if (!email) continue;

      // Check if we already sent to this user today (prevent duplicates from hourly runs)
      if (data[sentKey]) {
        skippedAlreadySent++;
        continue;
      }

      // Check if it's 9 AM in the user's timezone
      const userTz = data.timezone || "Asia/Kolkata";
      const localHour = getHourInTimezone(userTz);
      if (localHour === null || localHour !== TARGET_HOUR) {
        skippedTimezone++;
        continue;
      }

      let sunSign = extractSignName(data.sunSign);

      // Fallback: check user_profiles
      if (!sunSign) {
        try {
          const profileSnap = await adminDb.collection("user_profiles").doc(userDoc.id).get();
          if (profileSnap.exists) {
            sunSign = extractSignName(profileSnap.data()?.sunSign);
          }
        } catch (_) {}
      }

      if (!sunSign || !ZODIAC_SIGNS.includes(sunSign)) continue;

      if (!signGroups[sunSign]) signGroups[sunSign] = [];
      signGroups[sunSign].push({ email, docId: userDoc.id });
    }

    // 3. Fetch content per sign
    const contentBySign: Record<string, string> = {};

    if (sendHoroscope) {
      // Fetch horoscope for each sign from cache or API
      for (const sign of Object.keys(signGroups)) {
        try {
          // Check Firestore cache first (format used by /api/horoscope/cached)
          const cacheDocId = `horoscope_daily_${sign.toLowerCase()}_${dateStr}`;
          const cacheSnap = await adminDb.collection("horoscopes").doc(cacheDocId).get();

          if (cacheSnap.exists) {
            const cached = cacheSnap.data();
            contentBySign[sign] =
              cached?.horoscope?.horoscope_data ||
              cached?.horoscope_data ||
              cached?.text ||
              `Today brings new energy for ${sign}. Stay open to opportunities and trust your intuition.`;
          } else {
            // Fetch from the horoscope API
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://palmcosmic.com";
            const res = await fetch(`${baseUrl}/api/horoscope/cached?sign=${sign.toLowerCase()}&period=daily`);

            if (res.ok) {
              const result = await res.json();
              contentBySign[sign] =
                result.data?.horoscope_data ||
                result.horoscope_data ||
                `Today brings new energy for ${sign}. Stay open to opportunities.`;
            } else {
              contentBySign[sign] = `Today brings new energy for ${sign}. Stay open to opportunities and trust your intuition.`;
            }
          }
        } catch (err) {
          console.error(`[Cron] Failed to fetch horoscope for ${sign}:`, err);
          contentBySign[sign] = `Today brings new energy for ${sign}. Stay open to opportunities and trust your intuition.`;
        }
      }
    } else {
      // Pick a random tip for each sign
      for (const sign of Object.keys(signGroups)) {
        contentBySign[sign] = getRandomTip(sign);
      }
    }

    // 4. Send emails
    let sentCount = 0;
    let errorCount = 0;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://palmcosmic.com";
    const formattedDate = today.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    for (const [sign, users] of Object.entries(signGroups)) {
      const content = contentBySign[sign] || "";

      for (const user of users) {
        try {
          await sendTemplateEmail(
            { email: user.email },
            BREVO_TEMPLATES.DAILY_HOROSCOPE,
            {
              SUN_SIGN: sign,
              CONTENT: content,
              CONTENT_TYPE_LABEL: contentTypeLabel,
              THEME: theme.theme,
              THEME_EMOJI: contentEmoji,
              DATE: formattedDate,
              APP_URL: appUrl,
            }
          );
          sentCount++;

          // Mark user as sent today to prevent duplicate emails from hourly runs
          try {
            await adminDb.collection("users").doc(user.docId).update({
              [sentKey]: true,
            });
          } catch (_) {}
        } catch (err) {
          errorCount++;
          console.error(`[Cron] Failed to send to ${user.email}:`, err);
        }
      }
    }

    console.log(`[Cron] Done — ${contentType} emails sent: ${sentCount}, errors: ${errorCount}, skippedTZ: ${skippedTimezone}, alreadySent: ${skippedAlreadySent}`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      utcHour,
      contentType,
      theme: theme.theme,
      sent: sentCount,
      errors: errorCount,
      skippedTimezone,
      skippedAlreadySent,
      signs: Object.keys(signGroups).length,
    });
  } catch (error: any) {
    console.error("[Cron] daily-horoscope-email error:", error);
    return NextResponse.json(
      { error: error.message || "Cron job failed" },
      { status: 500 }
    );
  }
}
