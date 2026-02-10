import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client for Claude AI
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Helper function to generate palm reading insights
export async function generatePalmReading(palmData: {
  heartLine?: string;
  lifeLine?: string;
  headLine?: string;
  fateLine?: string;
}) {
  const prompt = `You are an expert palm reader. Based on the following palm line analysis, provide a detailed and personalized reading:

Heart Line: ${palmData.heartLine || "Not analyzed"}
Life Line: ${palmData.lifeLine || "Not analyzed"}
Head Line: ${palmData.headLine || "Not analyzed"}
Fate Line: ${palmData.fateLine || "Not analyzed"}

Provide insights about:
1. Love and relationships
2. Health and vitality
3. Career and success
4. Personal growth

Keep the tone mystical yet positive and encouraging. Format the response as JSON with keys: love, health, career, growth.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return response;
}

// Helper function for daily horoscope generation
export async function generateDailyHoroscope(zodiacSign: string, birthDate?: string) {
  const prompt = `You are a mystical astrologer. Generate a personalized daily horoscope for someone with the zodiac sign ${zodiacSign}${birthDate ? ` born on ${birthDate}` : ""}.

Include:
1. Overall energy for the day (1-10 scale)
2. Love forecast
3. Career forecast
4. Lucky numbers (3 numbers)
5. Lucky color
6. A piece of advice

Keep it mystical, positive, and under 200 words. Format as JSON with keys: energy, love, career, luckyNumbers, luckyColor, advice.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return response;
}
