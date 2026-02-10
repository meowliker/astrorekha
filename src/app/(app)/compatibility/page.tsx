"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getZodiacSign } from "@/lib/astrology-api";
import { getInstantCompatibility, getCompatibilityResult, saveCompatibilityResult } from "@/lib/compatibility-data";

const ZODIAC_SIGNS = [
  { name: "Aries", symbol: "♈", dates: "21 Mar - 19 Apr", element: "Fire", elementIcon: "≋", birthDate: "1990-04-01" },
  { name: "Taurus", symbol: "♉", dates: "20 Apr - 20 May", element: "Earth", elementIcon: "≡", birthDate: "1990-05-01" },
  { name: "Gemini", symbol: "♊", dates: "21 May - 21 Jun", element: "Air", elementIcon: "≋", birthDate: "1990-06-01" },
  { name: "Cancer", symbol: "♋", dates: "22 Jun - 22 Jul", element: "Water", elementIcon: "≋", birthDate: "1990-07-01" },
  { name: "Leo", symbol: "♌", dates: "23 Jul - 22 Aug", element: "Fire", elementIcon: "≋", birthDate: "1990-08-01" },
  { name: "Virgo", symbol: "♍", dates: "23 Aug - 22 Sep", element: "Earth", elementIcon: "≡", birthDate: "1990-09-01" },
  { name: "Libra", symbol: "♎", dates: "23 Sep - 22 Oct", element: "Air", elementIcon: "≋", birthDate: "1990-10-01" },
  { name: "Scorpio", symbol: "♏", dates: "23 Oct - 22 Nov", element: "Water", elementIcon: "≋", birthDate: "1990-11-01" },
  { name: "Sagittarius", symbol: "♐", dates: "23 Nov - 21 Dec", element: "Fire", elementIcon: "≋", birthDate: "1990-12-01" },
  { name: "Capricorn", symbol: "♑", dates: "22 Dec - 19 Jan", element: "Earth", elementIcon: "≡", birthDate: "1990-01-01" },
  { name: "Aquarius", symbol: "♒", dates: "20 Jan - 18 Feb", element: "Air", elementIcon: "≋", birthDate: "1990-02-01" },
  { name: "Pisces", symbol: "♓", dates: "19 Feb - 20 Mar", element: "Water", elementIcon: "≋", birthDate: "1990-03-01" },
];

const COMPATIBILITY_DATA: Record<string, Record<string, { score: number; description: string }>> = {
  Aries: {
    Aries: { score: 75, description: "Two fire signs create intense passion but may clash on leadership." },
    Taurus: { score: 55, description: "Different paces in life, but can balance each other well." },
    Gemini: { score: 83, description: "Exciting and dynamic duo with endless adventures." },
    Cancer: { score: 42, description: "Emotional differences require patience and understanding." },
    Leo: { score: 90, description: "A power couple with mutual admiration and respect." },
    Virgo: { score: 48, description: "Different approaches but can learn from each other." },
    Libra: { score: 65, description: "Opposites attract with good balance of energy." },
    Scorpio: { score: 58, description: "Intense connection but power struggles possible." },
    Sagittarius: { score: 88, description: "Adventure seekers who understand each other perfectly." },
    Capricorn: { score: 52, description: "Both ambitious but different methods to success." },
    Aquarius: { score: 70, description: "Independent spirits who give each other space." },
    Pisces: { score: 60, description: "Fire meets water - steamy but challenging." },
  },
  Taurus: {
    Aries: { score: 55, description: "Different paces in life, but can balance each other well." },
    Taurus: { score: 85, description: "Stable and sensual connection with shared values." },
    Gemini: { score: 45, description: "Different needs but can find common ground." },
    Cancer: { score: 92, description: "Perfect match for building a loving home together." },
    Leo: { score: 58, description: "Both stubborn but share love for luxury." },
    Virgo: { score: 88, description: "Earth signs create a grounded, lasting bond." },
    Libra: { score: 72, description: "Venus-ruled signs share love for beauty and harmony." },
    Scorpio: { score: 78, description: "Deep, intense connection with strong loyalty." },
    Sagittarius: { score: 40, description: "Very different lifestyles and priorities." },
    Capricorn: { score: 90, description: "Practical partners building a secure future." },
    Aquarius: { score: 35, description: "Challenging match with different values." },
    Pisces: { score: 82, description: "Romantic and nurturing connection." },
  },
  Gemini: {
    Aries: { score: 83, description: "Exciting and dynamic duo with endless adventures." },
    Taurus: { score: 45, description: "Different needs but can find common ground." },
    Gemini: { score: 70, description: "Fun and communicative but may lack stability." },
    Cancer: { score: 50, description: "Emotional vs intellectual - requires effort." },
    Leo: { score: 85, description: "Creative and fun-loving pair with great chemistry." },
    Virgo: { score: 55, description: "Both Mercury-ruled but different expressions." },
    Libra: { score: 90, description: "Air signs with perfect mental connection." },
    Scorpio: { score: 38, description: "Intense attraction but trust issues possible." },
    Sagittarius: { score: 78, description: "Adventurous minds exploring life together." },
    Capricorn: { score: 42, description: "Different priorities and communication styles." },
    Aquarius: { score: 88, description: "Intellectual soulmates with shared curiosity." },
    Pisces: { score: 52, description: "Creative connection but emotional differences." },
  },
  Cancer: {
    Aries: { score: 42, description: "Emotional differences require patience and understanding." },
    Taurus: { score: 92, description: "Perfect match for building a loving home together." },
    Gemini: { score: 50, description: "Emotional vs intellectual - requires effort." },
    Cancer: { score: 80, description: "Deep emotional understanding and nurturing love." },
    Leo: { score: 55, description: "Different needs but strong attraction." },
    Virgo: { score: 85, description: "Caring partners who support each other." },
    Libra: { score: 48, description: "Different emotional languages to learn." },
    Scorpio: { score: 94, description: "Intense emotional and spiritual connection." },
    Sagittarius: { score: 35, description: "Very different needs and lifestyles." },
    Capricorn: { score: 72, description: "Opposites who complete each other." },
    Aquarius: { score: 40, description: "Emotional vs detached - challenging match." },
    Pisces: { score: 95, description: "Soulmate connection with deep intuition." },
  },
  Leo: {
    Aries: { score: 90, description: "A power couple with mutual admiration and respect." },
    Taurus: { score: 58, description: "Both stubborn but share love for luxury." },
    Gemini: { score: 85, description: "Creative and fun-loving pair with great chemistry." },
    Cancer: { score: 55, description: "Different needs but strong attraction." },
    Leo: { score: 75, description: "Dramatic and passionate but ego clashes possible." },
    Virgo: { score: 52, description: "Different approaches to life and love." },
    Libra: { score: 88, description: "Glamorous couple with mutual appreciation." },
    Scorpio: { score: 62, description: "Intense attraction with power dynamics." },
    Sagittarius: { score: 92, description: "Fire signs igniting adventure and passion." },
    Capricorn: { score: 48, description: "Different values but mutual respect." },
    Aquarius: { score: 65, description: "Opposites with creative tension." },
    Pisces: { score: 58, description: "Romantic but different emotional needs." },
  },
  Virgo: {
    Aries: { score: 48, description: "Different approaches but can learn from each other." },
    Taurus: { score: 88, description: "Earth signs create a grounded, lasting bond." },
    Gemini: { score: 55, description: "Both Mercury-ruled but different expressions." },
    Cancer: { score: 85, description: "Caring partners who support each other." },
    Leo: { score: 52, description: "Different approaches to life and love." },
    Virgo: { score: 78, description: "Practical and organized partnership." },
    Libra: { score: 60, description: "Balance between analysis and harmony." },
    Scorpio: { score: 82, description: "Deep connection with mutual respect." },
    Sagittarius: { score: 42, description: "Different lifestyles and priorities." },
    Capricorn: { score: 90, description: "Earth signs building success together." },
    Aquarius: { score: 45, description: "Different values and approaches." },
    Pisces: { score: 72, description: "Opposites who balance each other." },
  },
  Libra: {
    Aries: { score: 65, description: "Opposites attract with good balance of energy." },
    Taurus: { score: 72, description: "Venus-ruled signs share love for beauty and harmony." },
    Gemini: { score: 90, description: "Air signs with perfect mental connection." },
    Cancer: { score: 48, description: "Different emotional languages to learn." },
    Leo: { score: 88, description: "Glamorous couple with mutual appreciation." },
    Virgo: { score: 60, description: "Balance between analysis and harmony." },
    Libra: { score: 75, description: "Harmonious but may avoid necessary conflicts." },
    Scorpio: { score: 55, description: "Attraction with different depths." },
    Sagittarius: { score: 82, description: "Fun-loving pair with shared optimism." },
    Capricorn: { score: 52, description: "Different priorities but mutual respect." },
    Aquarius: { score: 92, description: "Air signs with intellectual harmony." },
    Pisces: { score: 65, description: "Romantic but different approaches." },
  },
  Scorpio: {
    Aries: { score: 58, description: "Intense connection but power struggles possible." },
    Taurus: { score: 78, description: "Deep, intense connection with strong loyalty." },
    Gemini: { score: 38, description: "Intense attraction but trust issues possible." },
    Cancer: { score: 94, description: "Intense emotional and spiritual connection." },
    Leo: { score: 62, description: "Intense attraction with power dynamics." },
    Virgo: { score: 82, description: "Deep connection with mutual respect." },
    Libra: { score: 55, description: "Attraction with different depths." },
    Scorpio: { score: 85, description: "Intense and transformative but volatile." },
    Sagittarius: { score: 45, description: "Different needs for freedom and intimacy." },
    Capricorn: { score: 88, description: "Powerful partnership with shared ambition." },
    Aquarius: { score: 42, description: "Fixed signs with different values." },
    Pisces: { score: 92, description: "Deep spiritual and emotional bond." },
  },
  Sagittarius: {
    Aries: { score: 88, description: "Adventure seekers who understand each other perfectly." },
    Taurus: { score: 40, description: "Very different lifestyles and priorities." },
    Gemini: { score: 78, description: "Adventurous minds exploring life together." },
    Cancer: { score: 35, description: "Very different needs and lifestyles." },
    Leo: { score: 92, description: "Fire signs igniting adventure and passion." },
    Virgo: { score: 42, description: "Different lifestyles and priorities." },
    Libra: { score: 82, description: "Fun-loving pair with shared optimism." },
    Scorpio: { score: 45, description: "Different needs for freedom and intimacy." },
    Sagittarius: { score: 80, description: "Double the adventure but may lack grounding." },
    Capricorn: { score: 48, description: "Different approaches to life goals." },
    Aquarius: { score: 85, description: "Free spirits with shared ideals." },
    Pisces: { score: 55, description: "Dreamers with different expressions." },
  },
  Capricorn: {
    Aries: { score: 52, description: "Both ambitious but different methods to success." },
    Taurus: { score: 90, description: "Practical partners building a secure future." },
    Gemini: { score: 42, description: "Different priorities and communication styles." },
    Cancer: { score: 72, description: "Opposites who complete each other." },
    Leo: { score: 48, description: "Different values but mutual respect." },
    Virgo: { score: 90, description: "Earth signs building success together." },
    Libra: { score: 52, description: "Different priorities but mutual respect." },
    Scorpio: { score: 88, description: "Powerful partnership with shared ambition." },
    Sagittarius: { score: 48, description: "Different approaches to life goals." },
    Capricorn: { score: 82, description: "Power couple with shared goals." },
    Aquarius: { score: 55, description: "Different values but intellectual respect." },
    Pisces: { score: 70, description: "Dreams meet reality in balance." },
  },
  Aquarius: {
    Aries: { score: 70, description: "Independent spirits who give each other space." },
    Taurus: { score: 35, description: "Challenging match with different values." },
    Gemini: { score: 88, description: "Intellectual soulmates with shared curiosity." },
    Cancer: { score: 40, description: "Emotional vs detached - challenging match." },
    Leo: { score: 65, description: "Opposites with creative tension." },
    Virgo: { score: 45, description: "Different values and approaches." },
    Libra: { score: 92, description: "Air signs with intellectual harmony." },
    Scorpio: { score: 42, description: "Fixed signs with different values." },
    Sagittarius: { score: 85, description: "Free spirits with shared ideals." },
    Capricorn: { score: 55, description: "Different values but intellectual respect." },
    Aquarius: { score: 78, description: "Unique connection with shared vision." },
    Pisces: { score: 58, description: "Dreamers with different expressions." },
  },
  Pisces: {
    Aries: { score: 60, description: "Fire meets water - steamy but challenging." },
    Taurus: { score: 82, description: "Romantic and nurturing connection." },
    Gemini: { score: 52, description: "Creative connection but emotional differences." },
    Cancer: { score: 95, description: "Soulmate connection with deep intuition." },
    Leo: { score: 58, description: "Romantic but different emotional needs." },
    Virgo: { score: 72, description: "Opposites who balance each other." },
    Libra: { score: 65, description: "Romantic but different approaches." },
    Scorpio: { score: 92, description: "Deep spiritual and emotional bond." },
    Sagittarius: { score: 55, description: "Dreamers with different expressions." },
    Capricorn: { score: 70, description: "Dreams meet reality in balance." },
    Aquarius: { score: 58, description: "Dreamers with different expressions." },
    Pisces: { score: 85, description: "Deep emotional and spiritual understanding." },
  },
};

interface FullResult {
  score: number;
  description: string;
  sign1: string;
  sign2: string;
  matchLevel: string;
  matchSubtitle: string;
  relationshipGlance: string;
  wheelOfBalance: {
    emotional: number;
    intellectual: number;
    spiritual: number;
    sexual: number;
  };
  wheelDescriptions: {
    emotional: string;
    intellectual: string;
    spiritual: string;
    sexual: string;
  };
  toxicityScore: number;
  toxicityDescription: string;
  aspects: {
    love: number;
    marriage: number;
    trust: number;
    teamwork: number;
    communication: number;
    humor: number;
  };
  aspectDescriptions: {
    love: string;
    marriage: string;
    trust: string;
    teamwork: string;
    communication: string;
    humor: string;
  };
  challenges: {
    title: string;
    description: string;
    solution: string;
  }[];
}

interface AshtakootBreakdown {
  varna?: { score: number; max: number };
  vashya?: { score: number; max: number };
  tara?: { score: number; max: number };
  yoni?: { score: number; max: number };
  grahaMaitri?: { score: number; max: number };
  gana?: { score: number; max: number };
  bhakoot?: { score: number; max: number };
  nadi?: { score: number; max: number };
}

function generateFullResult(sign1: string, sign2: string, baseScore: number, baseDescription: string, breakdown?: AshtakootBreakdown): FullResult {
  const matchLevel = baseScore >= 80 ? "Excellent match" : baseScore >= 60 ? "Good match" : baseScore >= 40 ? "Challenging match" : "Difficult match";
  const matchSubtitle = baseScore >= 60 ? "Great potential for lasting love" : "May push one another to the extreme";
  
  const variance = (seed: number) => Math.max(15, Math.min(95, baseScore + (seed % 40) - 20));
  
  // Use Ashtakoot breakdown if available, otherwise generate from base score
  const emotional = breakdown?.gana ? Math.round((breakdown.gana.score / breakdown.gana.max) * 100) : variance(sign1.length * 7);
  const intellectual = breakdown?.grahaMaitri ? Math.round((breakdown.grahaMaitri.score / breakdown.grahaMaitri.max) * 100) : variance(sign2.length * 11);
  const spiritual = breakdown?.nadi ? Math.round((breakdown.nadi.score / breakdown.nadi.max) * 100) : variance((sign1.length + sign2.length) * 5);
  const sexual = breakdown?.yoni ? Math.round((breakdown.yoni.score / breakdown.yoni.max) * 100) : variance(sign1.length * sign2.length);
  
  const love = breakdown?.bhakoot ? Math.round((breakdown.bhakoot.score / breakdown.bhakoot.max) * 100) : variance(sign1.charCodeAt(0));
  const marriage = breakdown?.vashya ? Math.round((breakdown.vashya.score / breakdown.vashya.max) * 100) : variance(sign2.charCodeAt(0));
  const trust = breakdown?.tara ? Math.round((breakdown.tara.score / breakdown.tara.max) * 100) : variance(sign1.length * 13);
  const teamwork = breakdown?.varna ? Math.round((breakdown.varna.score / breakdown.varna.max) * 100) : variance(sign2.length * 17);
  const communication = variance((sign1.length + sign2.length) * 3);
  const humor = variance(sign1.charCodeAt(1) || 70);
  const toxicityScore = Math.max(15, 100 - baseScore - 10 + (sign1.length % 10));

  return {
    score: baseScore,
    description: baseDescription,
    sign1,
    sign2,
    matchLevel,
    matchSubtitle,
    relationshipGlance: `Loading personalized insights...`,
    wheelOfBalance: {
      emotional,
      intellectual,
      spiritual,
      sexual,
    },
    wheelDescriptions: {
      emotional: `Loading...`,
      intellectual: `Loading...`,
      spiritual: `Loading...`,
      sexual: `Loading...`,
    },
    toxicityScore,
    toxicityDescription: `Loading...`,
    aspects: {
      love,
      marriage,
      trust,
      teamwork,
      communication,
      humor,
    },
    aspectDescriptions: {
      love: `Loading...`,
      marriage: `Loading...`,
      trust: `Loading...`,
      teamwork: `Loading...`,
      communication: `Loading...`,
      humor: `Loading...`,
    },
    challenges: [
      { title: "Loading...", description: "Loading...", solution: "Loading..." },
      { title: "Loading...", description: "Loading...", solution: "Loading..." },
      { title: "Loading...", description: "Loading...", solution: "Loading..." },
    ],
  };
}

export default function CompatibilityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FullResult | null>(null);
  const [userSign, setUserSign] = useState<string>("Sagittarius");
  const [userSignFromBirthDate, setUserSignFromBirthDate] = useState<string | null>(null);
  const [selectedSign, setSelectedSign] = useState<string | null>(null);
  const [selectingFor, setSelectingFor] = useState<"user" | "partner">("partner");
  const [expandedAspect, setExpandedAspect] = useState<string | null>(null);
  const [expandedChallenge, setExpandedChallenge] = useState<number | null>(null);
  const [expandedWheel, setExpandedWheel] = useState<string | null>(null);
  const [showReadMore, setShowReadMore] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    const storedBirthDate = localStorage.getItem("birthDate");
    if (storedBirthDate) {
      const date = new Date(storedBirthDate);
      const sign = getZodiacSign(date.getMonth() + 1, date.getDate());
      setUserSign(sign);
      setUserSignFromBirthDate(sign);
    }
  }, []);

  const handleCheckCompatibility = async () => {
    if (!selectedSign) return;
    
    setLoading(true);
    
    try {
      // First, try to get cached result from Firestore
      const cachedResult = await getCompatibilityResult(userSign, selectedSign);
      
      if (cachedResult) {
        // Use cached result - instant!
        const fullResult = generateFullResult(
          userSign,
          selectedSign,
          cachedResult.overallScore,
          cachedResult.summary
        );
        
        // Merge cached insights
        fullResult.relationshipGlance = cachedResult.summary;
        fullResult.wheelDescriptions = {
          emotional: cachedResult.strengths[0] || "Strong emotional connection",
          intellectual: cachedResult.strengths[1] || "Good mental compatibility",
          spiritual: cachedResult.strengths[2] || "Shared values and beliefs",
          sexual: cachedResult.strengths[3] || "Physical chemistry present",
        };
        fullResult.toxicityScore = cachedResult.toxicityScore;
        fullResult.toxicityDescription = cachedResult.toxicityDescription;
        fullResult.challenges = cachedResult.challenges;
        
        setResult(fullResult);
        setLoading(false);
        return;
      }
      
      // No cached result - use instant pre-generated data (no API call needed)
      const instantData = getInstantCompatibility(userSign, selectedSign);
      
      const fullResult = generateFullResult(
        userSign,
        selectedSign,
        instantData.overallScore,
        instantData.summary
      );
      
      // Apply instant insights
      fullResult.wheelOfBalance = {
        emotional: instantData.emotionalScore,
        intellectual: instantData.intellectualScore,
        spiritual: instantData.spiritualScore,
        sexual: instantData.physicalScore,
      };
      fullResult.relationshipGlance = instantData.summary;
      fullResult.wheelDescriptions = {
        emotional: instantData.strengths[0] || "Strong emotional connection",
        intellectual: instantData.strengths[1] || "Good mental compatibility",
        spiritual: instantData.strengths[2] || "Shared values and beliefs",
        sexual: instantData.strengths[3] || "Physical chemistry present",
      };
      fullResult.toxicityScore = instantData.toxicityScore;
      fullResult.toxicityDescription = instantData.toxicityDescription;
      fullResult.challenges = instantData.challenges;
      
      setResult(fullResult);
      
      // Save to Firestore in background for future instant access
      saveCompatibilityResult(instantData).catch(console.error);
      
    } catch (error) {
      console.error("Compatibility error:", error);
      // Ultimate fallback to static data
      const compatibility = COMPATIBILITY_DATA[userSign]?.[selectedSign] || { score: 50, description: "A unique connection worth exploring." };
      const fullResult = generateFullResult(userSign, selectedSign, compatibility.score, compatibility.description);
      setResult(fullResult);
    } finally {
      setLoading(false);
      setLoadingInsights(false);
    }
  };
  
  const handleDownloadPDF = async () => {
    if (!result) return;
    
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(24);
    doc.setTextColor(220, 53, 69);
    doc.text("Compatibility Report", 105, 20, { align: "center" });
    
    // Signs
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(`${result.sign1} & ${result.sign2}`, 105, 35, { align: "center" });
    
    // Match Level
    doc.setFontSize(20);
    doc.setTextColor(100, 100, 100);
    doc.text(`${result.matchLevel} - ${result.score}%`, 105, 50, { align: "center" });
    doc.setFontSize(12);
    doc.text(result.matchSubtitle, 105, 58, { align: "center" });
    
    // Relationship at a glance
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("Relationship at a Glance", 20, 75);
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    const glanceLines = doc.splitTextToSize(result.relationshipGlance, 170);
    doc.text(glanceLines, 20, 85);
    
    // Wheel of Balance
    let yPos = 85 + glanceLines.length * 5 + 15;
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("Wheel of Balance", 20, yPos);
    yPos += 10;
    doc.setFontSize(10);
    doc.text(`Emotional: ${result.wheelOfBalance.emotional}%`, 20, yPos);
    doc.text(`Intellectual: ${result.wheelOfBalance.intellectual}%`, 105, yPos);
    yPos += 7;
    doc.text(`Spiritual: ${result.wheelOfBalance.spiritual}%`, 20, yPos);
    doc.text(`Sexual: ${result.wheelOfBalance.sexual}%`, 105, yPos);
    
    // Compatibility Aspects
    yPos += 15;
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("Compatibility Aspects", 20, yPos);
    yPos += 10;
    doc.setFontSize(10);
    Object.entries(result.aspects).forEach(([key, value]) => {
      doc.text(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}%`, 20, yPos);
      yPos += 6;
    });
    
    // Toxicity Score
    yPos += 10;
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("Toxicity Score", 20, yPos);
    yPos += 8;
    doc.setFontSize(12);
    doc.text(`${result.toxicityScore}%`, 20, yPos);
    yPos += 8;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    const toxicLines = doc.splitTextToSize(result.toxicityDescription, 170);
    doc.text(toxicLines, 20, yPos);
    
    // Challenges
    yPos += toxicLines.length * 5 + 15;
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("Biggest Challenges", 20, yPos);
    yPos += 10;
    
    result.challenges.forEach((challenge, index) => {
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(`${index + 1}. ${challenge.title}`, 20, yPos);
      yPos += 6;
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const descLines = doc.splitTextToSize(challenge.description, 165);
      doc.text(descLines, 25, yPos);
      yPos += descLines.length * 4 + 4;
      doc.setTextColor(46, 125, 50);
      const solLines = doc.splitTextToSize(`Solution: ${challenge.solution}`, 165);
      doc.text(solLines, 25, yPos);
      yPos += solLines.length * 4 + 8;
    });
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Generated by PalmCosmic", 105, 290, { align: "center" });
    
    doc.save(`compatibility-${result.sign1}-${result.sign2}.pdf`);
  };

  const getSignData = (name: string) => {
    return ZODIAC_SIGNS.find(s => s.name === name);
  };

  const getSignSymbol = (name: string) => {
    return getSignData(name)?.symbol || "?";
  };

  const getSignElement = (name: string) => {
    return getSignData(name)?.element || "Unknown";
  };

  const getAspectColor = (value: number) => {
    if (value >= 70) return "bg-gradient-to-r from-yellow-400 to-orange-400";
    if (value >= 50) return "bg-gradient-to-r from-cyan-400 to-blue-400";
    if (value >= 30) return "bg-gradient-to-r from-pink-400 to-rose-400";
    return "bg-gradient-to-r from-green-400 to-rose-400";
  };

  const handleSignSelect = (signName: string) => {
    if (selectingFor === "user") {
      setUserSign(signName);
    } else {
      setSelectedSign(signName);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm">
          <div className="flex items-center gap-4 px-4 py-3">
            <button
              onClick={() => result ? setResult(null) : router.push("/reports")}
              className="w-10 h-10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold italic flex-1 text-center pr-10">Compatibility Report</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-6">
            {!result ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Selected Signs Display */}
                <div className="flex items-center justify-center gap-4">
                  {/* User's Sign - Clickable */}
                  <button
                    onClick={() => setSelectingFor("user")}
                    className="flex flex-col items-center"
                  >
                    <div className={`w-20 h-20 rounded-full bg-gradient-to-br from-[#D4B896]/30 to-[#C4A676]/20 border-2 flex items-center justify-center relative transition-all ${
                      selectingFor === "user" ? "border-rose-400 ring-2 ring-rose-400/30" : "border-[#D4B896]/50"
                    }`}>
                      <span className="text-[#D4B896] text-3xl">{getSignSymbol(userSign)}</span>
                    </div>
                    <span className="text-[#D4B896] text-sm mt-2">{userSign}</span>
                  </button>

                  <div className="flex flex-col items-center">
                    <span className="text-[#D4B896]/60 text-2xl">+</span>
                  </div>

                  {/* Selected Sign - Clickable */}
                  <button
                    onClick={() => setSelectingFor("partner")}
                    className="flex flex-col items-center"
                  >
                    <div className={`w-20 h-20 rounded-full bg-gradient-to-br from-[#D4B896]/20 to-[#C4A676]/10 border-2 flex items-center justify-center transition-all ${
                      selectingFor === "partner" ? "border-rose-400 ring-2 ring-rose-400/30" : "border-[#D4B896]/30"
                    }`}>
                      {selectedSign ? (
                        <span className="text-[#D4B896] text-3xl">{getSignSymbol(selectedSign)}</span>
                      ) : (
                        <span className="text-[#D4B896]/50 text-3xl">?</span>
                      )}
                    </div>
                    <span className="text-[#D4B896]/70 text-sm mt-2">{selectedSign || "Select sign"}</span>
                  </button>
                </div>

                {/* Selection indicator */}
                <p className="text-center text-[#D4B896]/60 text-sm">
                  {selectingFor === "user" ? "Select your sign" : "Select partner's sign"}
                </p>

                {/* Zodiac Grid */}
                <div className="grid grid-cols-4 gap-3">
                  {ZODIAC_SIGNS.map((sign) => (
                    <motion.button
                      key={sign.name}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSignSelect(sign.name)}
                      className={`relative flex flex-col items-center p-2 rounded-xl border transition-all ${
                        (selectingFor === "user" && sign.name === userSign) || (selectingFor === "partner" && sign.name === selectedSign)
                          ? "bg-[#D4B896]/20 border-[#D4B896]"
                          : "bg-[#1A1F2E]/50 border-[#D4B896]/20 hover:border-[#D4B896]/40"
                      }`}
                    >
                      {/* You badge - only show on user's birth date sign */}
                      {sign.name === userSignFromBirthDate && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
                          You
                        </div>
                      )}
                      
                      {/* Decorative border frame */}
                      <div className="w-12 h-12 rounded-lg border border-[#D4B896]/30 flex items-center justify-center relative">
                        <div className="absolute -top-0.5 -left-0.5 w-2 h-2 border-t border-l border-[#D4B896]/50" />
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 border-t border-r border-[#D4B896]/50" />
                        <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 border-b border-l border-[#D4B896]/50" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 border-b border-r border-[#D4B896]/50" />
                        
                        <span className="text-[#D4B896] text-xl">{sign.symbol}</span>
                      </div>
                      
                      <span className="text-[#D4B896] text-[10px] mt-1 font-medium">{sign.name}</span>
                      <span className="text-[#D4B896]/50 text-[8px]">{sign.dates}</span>
                    </motion.button>
                  ))}
                </div>

                {/* Check Compatibility Button */}
                <Button
                  onClick={handleCheckCompatibility}
                  disabled={loading || !selectedSign}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white py-6 rounded-full text-lg font-medium"
                >
                  {loading ? (
                    <div className="flex flex-col items-center">
                      <div className="flex items-center">
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        {loadingInsights ? "Analyzing compatibility..." : "Calculating scores..."}
                      </div>
                      <span className="text-xs text-white/60 mt-1">This may take a moment</span>
                    </div>
                  ) : (
                    "Check compatibility"
                  )}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >

                {/* Signs Display with Score */}
                <div className="flex items-center justify-center gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#D4B896]/30 to-[#C4A676]/20 border-2 border-[#D4B896]/50 flex items-center justify-center">
                      <span className="text-[#D4B896] text-3xl">{getSignSymbol(result.sign1)}</span>
                    </div>
                    <span className="text-[#D4B896] text-sm mt-2">{result.sign1}</span>
                    <span className="text-[#D4B896]/50 text-xs flex items-center gap-1">
                      <span className="text-xs">≋</span> {getSignElement(result.sign1)}
                    </span>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-white text-2xl font-bold">{result.score}%</span>
                    <div className="w-16 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full mt-1" />
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#D4B896]/30 to-[#C4A676]/20 border-2 border-[#D4B896]/50 flex items-center justify-center">
                      <span className="text-[#D4B896] text-3xl">{getSignSymbol(result.sign2)}</span>
                    </div>
                    <span className="text-[#D4B896] text-sm mt-2">{result.sign2}</span>
                    <span className="text-[#D4B896]/50 text-xs flex items-center gap-1">
                      <span className="text-xs">≡</span> {getSignElement(result.sign2)}
                    </span>
                  </div>
                </div>

                {/* Match Level */}
                <div className="text-center">
                  <h2 className="text-white text-2xl font-bold">{result.matchLevel}</h2>
                  <p className="text-white/60 text-sm">{result.matchSubtitle}</p>
                </div>

                {/* Relationship at a glance */}
                <div className="bg-[#1A2535] rounded-2xl p-5 border border-[#2A3545]">
                  <h3 className="text-[#D4B896] text-lg font-semibold mb-3">Relationship at a glance</h3>
                  <p className="text-white/70 text-sm leading-relaxed">
                    {result.relationshipGlance.length > 200 
                      ? (showReadMore ? result.relationshipGlance : result.relationshipGlance.slice(0, 150) + "...")
                      : result.relationshipGlance
                    }
                  </p>
                  {result.relationshipGlance.length > 200 && (
                    <button 
                      onClick={() => setShowReadMore(!showReadMore)}
                      className="text-rose-400 text-sm mt-2 flex items-center gap-1"
                    >
                      {showReadMore ? "Show less" : "Read more"} 
                      {showReadMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Wheel of Balance - 4 Quadrant Design */}
                <div>
                  <h3 className="text-white text-xl font-bold mb-4">Wheel of balance</h3>
                  
                  {/* Quadrant Labels and Chart */}
                  <div className="relative">
                    {/* Top Labels */}
                    <div className="flex justify-between mb-2 px-4">
                      <div className="text-left">
                        <span className="px-3 py-1 bg-teal-500/20 text-teal-400 text-xs rounded-full">Emotional</span>
                        <p className="text-teal-400 text-lg font-bold mt-1">{result.wheelOfBalance.emotional}%</p>
                      </div>
                      <div className="text-right">
                        <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full">Intellectual</span>
                        <p className="text-amber-400 text-lg font-bold mt-1">{result.wheelOfBalance.intellectual}%</p>
                      </div>
                    </div>
                    
                    {/* Wheel Chart */}
                    <div className="relative flex justify-center my-4">
                      <svg viewBox="0 0 200 200" className="w-56 h-56">
                        {/* Background circle */}
                        <circle cx="100" cy="100" r="90" fill="#1A2535" />
                        
                        {/* Emotional - Top Left (teal) */}
                        <path
                          d={`M 100 100 L 100 ${100 - 90 * result.wheelOfBalance.emotional / 100} A ${90 * result.wheelOfBalance.emotional / 100} ${90 * result.wheelOfBalance.emotional / 100} 0 0 0 ${100 - 90 * result.wheelOfBalance.emotional / 100} 100 Z`}
                          fill="#2DD4BF"
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setExpandedWheel("emotional")}
                        />
                        
                        {/* Intellectual - Top Right (amber/orange) */}
                        <path
                          d={`M 100 100 L ${100 + 90 * result.wheelOfBalance.intellectual / 100} 100 A ${90 * result.wheelOfBalance.intellectual / 100} ${90 * result.wheelOfBalance.intellectual / 100} 0 0 0 100 ${100 - 90 * result.wheelOfBalance.intellectual / 100} Z`}
                          fill="#FBBF24"
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setExpandedWheel("intellectual")}
                        />
                        
                        {/* Spiritual - Bottom Left (cyan/blue) */}
                        <path
                          d={`M 100 100 L ${100 - 90 * result.wheelOfBalance.spiritual / 100} 100 A ${90 * result.wheelOfBalance.spiritual / 100} ${90 * result.wheelOfBalance.spiritual / 100} 0 0 0 100 ${100 + 90 * result.wheelOfBalance.spiritual / 100} Z`}
                          fill="#22D3EE"
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setExpandedWheel("spiritual")}
                        />
                        
                        {/* Sexual - Bottom Right (purple) */}
                        <path
                          d={`M 100 100 L 100 ${100 + 90 * result.wheelOfBalance.sexual / 100} A ${90 * result.wheelOfBalance.sexual / 100} ${90 * result.wheelOfBalance.sexual / 100} 0 0 0 ${100 + 90 * result.wheelOfBalance.sexual / 100} 100 Z`}
                          fill="#A78BFA"
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setExpandedWheel("sexual")}
                        />
                        
                        {/* Divider lines */}
                        <line x1="100" y1="10" x2="100" y2="190" stroke="#0A0E1A" strokeWidth="2" />
                        <line x1="10" y1="100" x2="190" y2="100" stroke="#0A0E1A" strokeWidth="2" />
                        
                      </svg>
                    </div>
                    
                    {/* Bottom Labels */}
                    <div className="flex justify-between mt-2 px-4">
                      <div className="text-left">
                        <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">Spiritual</span>
                        <p className="text-cyan-400 text-lg font-bold mt-1">{result.wheelOfBalance.spiritual}%</p>
                      </div>
                      <div className="text-right">
                        <span className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">Sexual</span>
                        <p className="text-purple-400 text-lg font-bold mt-1">{result.wheelOfBalance.sexual}%</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selected Wheel Attribute Card - Only shows when a quadrant is clicked */}
                {expandedWheel && (() => {
                  const attrs = {
                    emotional: { emoji: "😊", color: "teal", label: "Emotional", bgColor: "bg-teal-500/10", borderColor: "border-teal-500/30", textColor: "text-teal-400" },
                    intellectual: { emoji: "🧠", color: "amber", label: "Intellectual", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30", textColor: "text-amber-400" },
                    spiritual: { emoji: "✨", color: "cyan", label: "Spiritual", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/30", textColor: "text-cyan-400" },
                    sexual: { emoji: "💕", color: "purple", label: "Sexual", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30", textColor: "text-purple-400" },
                  };
                  const attr = attrs[expandedWheel as keyof typeof attrs];
                  const value = result.wheelOfBalance[expandedWheel as keyof typeof result.wheelOfBalance];
                  const description = result.wheelDescriptions[expandedWheel as keyof typeof result.wheelDescriptions];
                  
                  return (
                    <motion.div
                      key={expandedWheel}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`${attr.bgColor} rounded-2xl p-5 border ${attr.borderColor}`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">{attr.emoji}</span>
                        <span className={`${attr.textColor} text-lg font-semibold`}>{attr.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-white text-3xl font-bold">{value}%</span>
                        <span className="px-2 py-1 bg-white/10 text-white/60 text-xs rounded-full">
                          {value >= 60 ? "High" : value >= 40 ? "Medium" : "Low"}
                        </span>
                      </div>
                      <p className="text-white/70 text-sm leading-relaxed">{description}</p>
                    </motion.div>
                  );
                })()}

                {/* Toxicity Score */}
                <div>
                  <h3 className="text-white text-xl font-bold mb-4">Toxicity score</h3>
                  <div className="relative h-32 flex items-center justify-center mb-4">
                    <svg viewBox="0 0 100 60" className="w-64">
                      <defs>
                        <linearGradient id="toxicGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#3B82F6" />
                          <stop offset="33%" stopColor="#8B5CF6" />
                          <stop offset="66%" stopColor="#F97316" />
                          <stop offset="100%" stopColor="#EF4444" />
                        </linearGradient>
                      </defs>
                      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1A2535" strokeWidth="8" strokeLinecap="round" />
                      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#toxicGradient)" strokeWidth="8" strokeLinecap="round" />
                    </svg>
                    <div className="absolute bottom-0 text-center">
                      <span className="text-white text-3xl font-bold">{result.toxicityScore}%</span>
                      <div className="px-3 py-1 bg-white/10 rounded-full mt-1">
                        <span className="text-white/80 text-sm">
                          {result.toxicityScore >= 60 ? "High" : result.toxicityScore >= 40 ? "Medium" : "Low"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between text-white/50 text-xs px-4">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                  <p className="text-white/70 text-sm mt-4 leading-relaxed">{result.toxicityDescription}</p>
                </div>

                {/* Compatibility Aspects */}
                <div>
                  <h3 className="text-white text-xl font-bold mb-4">Compatibility aspects</h3>
                  <div className="space-y-4">
                    {Object.entries(result.aspects).map(([key, value]) => (
                      <div key={key}>
                        <button 
                          onClick={() => setExpandedAspect(expandedAspect === key ? null : key)}
                          className="w-full"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-white capitalize font-medium">{key}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-white/80">{value}%</span>
                              <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${expandedAspect === key ? "rotate-180" : ""}`} />
                            </div>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${value}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                              className={`h-full ${getAspectColor(value)}`}
                            />
                          </div>
                        </button>
                        <AnimatePresence>
                          {expandedAspect === key && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <p className="text-white/60 text-sm mt-2 pl-2 border-l-2 border-rose-500/50">
                                {result.aspectDescriptions[key as keyof typeof result.aspectDescriptions] !== "Loading..." 
                                  ? result.aspectDescriptions[key as keyof typeof result.aspectDescriptions]
                                  : (value >= 70 ? `Strong ${key} compatibility indicates a harmonious connection in this area.` :
                                     value >= 50 ? `Moderate ${key} compatibility suggests room for growth together.` :
                                     `${key.charAt(0).toUpperCase() + key.slice(1)} may require extra attention and effort from both partners.`)}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Advisor CTA */}
                <div className="bg-gradient-to-br from-[#1A3040] to-[#1A2535] rounded-2xl p-5 border border-[#2A4555]">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-cyan-500 flex items-center justify-center text-2xl">
                      👩‍🔮
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-semibold">Unsure about something?</h4>
                      <p className="text-white/60 text-sm">Talk to an advisor for a more personalized touch 💕</p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => router.push("/chat")}
                    className="w-full mt-4 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-full"
                  >
                    Ask 🔮
                  </Button>
                </div>

                {/* Biggest Challenges */}
                <div>
                  <h3 className="text-white text-xl font-bold mb-4">Biggest challenges in a relationship</h3>
                  <div className="space-y-4">
                    {result.challenges.map((challenge, index) => (
                      <div key={index} className="bg-[#1A2535] rounded-2xl p-5 border border-[#2A3545]">
                        <h4 className="text-[#D4B896] text-lg font-semibold mb-2">{challenge.title}</h4>
                        <p className="text-white/70 text-sm leading-relaxed mb-3">{challenge.description}</p>
                        <button
                          onClick={() => setExpandedChallenge(expandedChallenge === index ? null : index)}
                          className="flex items-center gap-2 text-rose-400 text-sm"
                        >
                          <Lightbulb className="w-4 h-4" />
                          How you can solve it
                          <ChevronDown className={`w-4 h-4 transition-transform ${expandedChallenge === index ? "rotate-180" : ""}`} />
                        </button>
                        <AnimatePresence>
                          {expandedChallenge === index && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <p className="text-rose-300/80 text-sm mt-3 pl-4 border-l-2 border-rose-500">
                                {challenge.solution}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Check Another Match Button */}
                <Button
                  onClick={() => {
                    setResult(null);
                    setSelectedSign(null);
                  }}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white py-6 rounded-full text-lg font-medium"
                >
                  Check Another Match
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
