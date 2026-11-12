import {anthropic} from "@/lib/anthropic";
import {logClaudeUsage} from "@/lib/ai-usage-logger";
import {WESTERN_CHART_VERSION,type WesternChart} from "@/lib/western-zodiac";
export const WESTERN_REPORT_INSTRUCTIONS = "Use Western tropical astrology exclusively. Use the supplied calculated signs as authoritative. Do not use sidereal signs, Jyotish, nakshatras, dashas, Manglik, or ayanamsa. Never invent missing Moon signs, Ascendants, houses or transit dates. When birth time is unknown explain the limitation. Write in American English.";
export async function generateWesternBirthReport(chart:WesternChart,userId:string,reportId:string) {
 const model="claude-sonnet-4-5-20250929";
 const prompts:Record<string,string>={ascendant_nature:"Ascendant and core nature",moon_emotional:"Moon and emotional world",life_predictions:"Life themes and possibilities",career:"Career and vocation",relationships:"Relationships",wealth:"Money habits",health:"Well-being, without diagnosis",current_dasha:"Natal planetary patterns and cycles, without invented current transits or timing predictions",strengths_challenges:"Strengths and challenges",guidance_remedies:"Practical personal reflection and guidance"};
 const sections=await Promise.all(Object.entries(prompts).map(async([key,topic])=>{
  const response=await anthropic.messages.create({model,max_tokens:800,system:WESTERN_REPORT_INSTRUCTIONS,
    messages:[{role:"user",content:`Write 2 short personalized paragraphs about ${topic}. Tie them to the supplied chart. Use second-person prose. Chart: ${JSON.stringify(chart)}`} ]});
  await logClaudeUsage({feature:"birth_chart_report",operation:key,model,userId,requestId:response.id,usage:response.usage,metadata:{reportId,zodiacSystem:WESTERN_CHART_VERSION}});
  const text=response.content.filter(b=>b.type==="text").map(b=>b.type==="text"?b.text:"").join("\n").trim();
  if(!text)throw new Error("Empty report section");
  return [key,text];
 }));
 return {sections:{...Object.fromEntries(sections),_zodiac_system:WESTERN_CHART_VERSION}};
}
