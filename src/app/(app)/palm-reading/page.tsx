"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Share2, Trash2, ChevronDown, ChevronUp, Camera, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { calculateZodiacSign, generateUserId } from "@/lib/user-profile";

type TabKey = "ageTimeline" | "wealth" | "mounts" | "love";

const TAB_LABELS: Record<TabKey, string> = {
  ageTimeline: "Timeline",
  wealth: "Wealth",
  mounts: "Mounts",
  love: "Love",
};

export default function PalmReadingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [reading, setReading] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("ageTimeline");
  const [expandedCosmic, setExpandedCosmic] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isFlowB, setIsFlowB] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { birthMonth, birthDay, birthYear } = useOnboardingStore();

  const zodiacSign = calculateZodiacSign(birthMonth, birthDay);
  const birthDate = `${birthYear}-${birthMonth}-${birthDay}`;

  useEffect(() => {
    // Check if user is Flow B
    const flow = localStorage.getItem("palmcosmic_onboarding_flow");
    const purchaseType = localStorage.getItem("palmcosmic_purchase_type");
    setIsFlowB(flow === "flow-b" || purchaseType === "one-time");
    
    loadExistingReading();
    return () => {
      // Cleanup camera stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const loadExistingReading = async () => {
    try {
      const userId = generateUserId();
      const docSnap = await getDoc(doc(db, "palm_readings", userId));
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.reading) {
          setReading(data.reading);
          setCapturedImage(data.palmImageUrl || null);
          setLoading(false);
          return;
        }
      }
      
      // Check if palm image exists in localStorage (from onboarding)
      const savedPalmImage = localStorage.getItem("palmcosmic_palm_image");
      if (savedPalmImage) {
        setCapturedImage(savedPalmImage);
        // For Flow B users, auto-analyze if they have a palm image but no reading
        const flow = localStorage.getItem("palmcosmic_onboarding_flow");
        if (flow === "flow-b") {
          setLoading(false);
          // Auto-analyze the palm image
          analyzePalm(savedPalmImage);
          return;
        }
      }
      
      setLoading(false);
    } catch (err) {
      console.error("Failed to load reading:", err);
      // Still check localStorage as fallback
      const savedPalmImage = localStorage.getItem("palmcosmic_palm_image");
      if (savedPalmImage) {
        setCapturedImage(savedPalmImage);
      }
      setLoading(false);
    }
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280, height: 720 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError("Could not access camera. Please allow camera permissions.");
      setShowCamera(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg", 0.8);
      setCapturedImage(imageData);
      
      // Stop camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setShowCamera(false);
      
      // Analyze the palm
      analyzePalm(imageData);
    }
  };

  const analyzePalm = async (imageData: string) => {
    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/palm-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData,
          birthDate,
          zodiacSign,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to analyze palm");
        return;
      }

      const palmReading = result.reading;

      // Check for NOT_A_PALM error
      if (palmReading?.meta?.errorMessage?.includes("NOT_A_PALM") || palmReading?.tabs === null) {
        setError(palmReading?.meta?.errorMessage?.replace("NOT_A_PALM: ", "") || 
          "Please upload a clear photo of your palm.");
        setReading(null);
        return;
      }

      setReading(palmReading);

      // Save to Firestore
      const userId = generateUserId();
      await setDoc(doc(db, "palm_readings", userId), {
        reading: palmReading,
        palmImageUrl: imageData,
        createdAt: new Date().toISOString(),
        birthDate,
        zodiacSign,
      });

    } catch (err) {
      console.error("Palm analysis error:", err);
      setError("Failed to analyze palm. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      setCapturedImage(imageData);
      analyzePalm(imageData);
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteReading = async () => {
    if (!confirm("Are you sure you want to delete this reading?")) return;
    
    try {
      const userId = generateUserId();
      await setDoc(doc(db, "palm_readings", userId), {
        reading: null,
        palmImageUrl: null,
        deletedAt: new Date().toISOString(),
      });
      setReading(null);
      setCapturedImage(null);
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleShare = async () => {
    const shareText = reading?.cosmicInsight 
      ? `✨ My Palm Reading\n\n${reading.cosmicInsight}\n\nGet your reading at PalmCosmic!`
      : "Check out my palm reading on PalmCosmic!";
    
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
      } catch (err) {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      alert("Reading copied to clipboard!");
    }
  };

  const renderTabButton = (key: TabKey) => (
    <button
      key={key}
      onClick={() => setActiveTab(key)}
      className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all ${
        activeTab === key
          ? "bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg"
          : "text-white/60 hover:text-white"
      }`}
    >
      {TAB_LABELS[key]}
    </button>
  );

  const renderAgeTimeline = () => {
    const t = reading?.tabs?.ageTimeline;
    if (!t) return null;
    
    return (
      <div className="space-y-4">
        <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
            📅 {t.title || "Life Timeline Predictions"}
          </h3>
          
          {t.stages?.map((stage: any, idx: number) => (
            <div key={idx} className="mb-4 last:mb-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-3 py-1 bg-black/30 rounded-full text-xs font-bold text-white border border-white/10">
                  {stage.range}
                </span>
                <span className="text-white font-bold">{stage.label}</span>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">{stage.description}</p>
            </div>
          ))}
        </div>

        {t.milestones && (
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h4 className="text-white font-bold mb-3">🕒 Key Life Milestones</h4>
            <div className="space-y-3">
              {Object.entries(t.milestones).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-primary">◉</span>
                  <div>
                    <span className="text-white font-semibold text-sm capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}:
                    </span>
                    <p className="text-white/60 text-sm">{value as string}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderWealth = () => {
    const t = reading?.tabs?.wealth;
    if (!t) return null;
    
    return (
      <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10 space-y-4">
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          💰 {t.title || "Wealth & Financial Analysis"}
        </h3>
        
        <div>
          <h4 className="text-white font-semibold text-sm mb-1">💵 Financial Potential</h4>
          <p className="text-white/70 text-sm">
            {t.financialPotential?.level && <span className="text-primary font-bold">{t.financialPotential.level}: </span>}
            {t.financialPotential?.details}
          </p>
        </div>

        <div>
          <h4 className="text-white font-semibold text-sm mb-1">📈 Business Aptitude</h4>
          <p className="text-white/70 text-sm">{t.businessAptitude}</p>
        </div>

        <div className="border-t border-white/10 pt-4">
          <h4 className="text-white font-semibold text-sm mb-1">Wealth Timeline</h4>
          <p className="text-white/70 text-sm">{t.wealthTimeline}</p>
        </div>

        <div>
          <h4 className="text-white font-semibold text-sm mb-1">Asset Accumulation</h4>
          <p className="text-white/70 text-sm">{t.assetAccumulation}</p>
        </div>

        <div>
          <h4 className="text-white font-semibold text-sm mb-1">Money Management Style</h4>
          <p className="text-white/70 text-sm">{t.moneyManagementStyle}</p>
        </div>
      </div>
    );
  };

  const renderMounts = () => {
    const t = reading?.tabs?.mounts;
    if (!t) return null;
    
    return (
      <div className="space-y-4">
        <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
            👑 {t.title || "Palm Mounts Analysis"}
          </h3>
          
          {t.mounts?.map((mount: any, idx: number) => (
            <div key={idx} className="mb-4 last:mb-0">
              <h4 className="text-white font-bold text-sm mb-1">✦ {mount.name}</h4>
              <p className="text-white/70 text-sm">{mount.description}</p>
            </div>
          ))}
        </div>

        {t.specialMarkings && (
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h4 className="text-white font-bold mb-3">📍 Special Markings</h4>
            <div className="space-y-3">
              {Object.entries(t.specialMarkings).map(([key, value]) => (
                <div key={key}>
                  <span className="text-white font-semibold text-sm capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}:
                  </span>
                  <p className="text-white/60 text-sm">{value as string}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLove = () => {
    const t = reading?.tabs?.love;
    if (!t) return null;
    
    return (
      <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10 space-y-4">
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          ❤️ {t.title || "Love & Partnership Predictions"}
        </h3>
        
        <div>
          <h4 className="text-white font-semibold text-sm mb-1">👥 Partner Characteristics</h4>
          <p className="text-white/70 text-sm">{t.partnerCharacteristics}</p>
        </div>

        <div>
          <h4 className="text-white font-semibold text-sm mb-1">🗓 Marriage Timing</h4>
          <p className="text-white/70 text-sm">{t.marriageTiming}</p>
        </div>

        <div className="border-t border-white/10 pt-4">
          <h4 className="text-white font-semibold text-sm mb-1">Partner&apos;s Financial Status</h4>
          <p className="text-white/70 text-sm">{t.partnersFinancialStatus}</p>
        </div>

        <div>
          <h4 className="text-white font-semibold text-sm mb-1">Relationship Challenges</h4>
          <p className="text-white/70 text-sm">{t.relationshipChallenges}</p>
        </div>

        <div>
          <h4 className="text-white font-semibold text-sm mb-1">Family Predictions</h4>
          <p className="text-white/70 text-sm">{t.familyPredictions}</p>
        </div>
      </div>
    );
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "ageTimeline": return renderAgeTimeline();
      case "wealth": return renderWealth();
      case "mounts": return renderMounts();
      case "love": return renderLove();
      default: return null;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md h-screen bg-[#0A0E1A] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <p className="text-white/60">Loading your reading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Camera view - matches onboarding step-13 UI
  if (showCamera) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md h-screen bg-background flex flex-col">
          <div className="relative flex-1 bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Hand outline overlay using palmoutline.png - flipped and sized like onboarding */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img
                src="/palmoutline.png"
                alt="Palm outline"
                width={380}
                height={470}
                className="object-contain opacity-70"
                style={{ transform: "scaleX(-1) scale(1.15)" }}
              />
            </div>

            {/* Back button */}
            <button
              onClick={() => {
                if (streamRef.current) {
                  streamRef.current.getTracks().forEach(track => track.stop());
                }
                setShowCamera(false);
              }}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/30 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>

            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="bg-background p-6 flex flex-col items-center gap-4">
            <p className="text-muted-foreground text-center text-sm">
              Place left palm inside outline and take a photo
            </p>

            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-primary border-4 border-primary/30 flex items-center justify-center"
            >
              <div className="w-12 h-12 rounded-full bg-primary" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Analyzing state
  if (analyzing) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md h-screen bg-[#0A0E1A] flex items-center justify-center">
          <div className="text-center px-8">
            <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-6" />
            <h2 className="text-white text-xl font-bold mb-2">Analyzing Your Palm...</h2>
            <p className="text-white/60 text-sm">
              Our cosmic AI is reading the lines of your destiny
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No reading yet - show capture UI
  if (!reading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden flex flex-col">
          <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
            <div className="flex items-center gap-4 px-4 py-3">
              <button onClick={() => router.push("/reports")} className="w-10 h-10 flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <h1 className="text-white text-xl font-semibold flex-1 text-center pr-10">Palm Reading</h1>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 w-full">
                <p className="text-red-400 text-center text-sm">{error}</p>
              </div>
            )}

            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary/20 to-purple-600/20 flex items-center justify-center mb-6">
              <span className="text-6xl">🖐️</span>
            </div>

            <h2 className="text-white text-2xl font-bold mb-2 text-center">
              Discover Your Destiny
            </h2>
            <p className="text-white/60 text-center mb-8 max-w-xs">
              Capture a clear photo of your palm to reveal insights about your life path, love, and fortune.
            </p>

            <div className="w-full space-y-3">
              <Button
                onClick={startCamera}
                className="w-full bg-gradient-to-r from-primary to-purple-600 py-6 text-lg"
              >
                <Camera className="w-5 h-5 mr-2" />
                Take Photo
              </Button>

              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="w-full py-4 border border-white/20 rounded-xl text-white text-center cursor-pointer hover:bg-white/5 transition-colors">
                  Upload from Gallery
                </div>
              </label>
            </div>

            <div className="mt-8 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl p-4 border border-purple-500/20">
              <p className="text-white/60 text-sm text-center">
                💡 For best results, use good lighting and spread your fingers slightly
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Reading result view
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => router.back()} className="px-4 py-2 bg-white/10 rounded-full border border-white/20">
              <span className="text-white text-sm">← Back</span>
            </button>
            <h1 className="text-white text-lg font-bold">Results</h1>
            {/* Only show New Scan button for Flow A (subscription) users */}
            {!isFlowB ? (
              <button 
                onClick={() => {
                  setReading(null);
                  setCapturedImage(null);
                }} 
                className="px-4 py-2 bg-white/10 rounded-full border border-white/20 flex items-center gap-1"
              >
                <Camera className="w-4 h-4 text-white" />
                <span className="text-white text-sm">New Scan</span>
              </button>
            ) : (
              <div className="w-24" /> // Placeholder for layout balance
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 space-y-4">
            {/* Your Palm Image */}
            {capturedImage && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10"
              >
                <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                  🖐️ Your Palm
                </h3>
                <div className="relative rounded-xl overflow-hidden">
                  <img
                    src={capturedImage}
                    alt="Your palm"
                    className="w-full h-48 object-cover rounded-xl"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <p className="absolute bottom-2 left-2 text-white/70 text-xs">
                    Reading derived from this palm
                  </p>
                </div>
              </motion.div>
            )}

            {/* Cosmic Insight Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: capturedImage ? 0.1 : 0 }}
              className="bg-gradient-to-br from-primary/20 to-purple-600/20 rounded-2xl p-5 border border-primary/30"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-bold text-xl">✦ Cosmic Insight</h2>
                <button
                  onClick={() => setExpandedCosmic(!expandedCosmic)}
                  className="text-primary text-sm font-semibold"
                >
                  {expandedCosmic ? "Show less" : "Show more"}
                </button>
              </div>
              <p className={`text-white/80 text-base leading-relaxed ${!expandedCosmic ? "line-clamp-4" : ""}`}>
                {reading?.cosmicInsight}
              </p>
            </motion.div>

            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
              {(["ageTimeline", "wealth", "mounts", "love"] as TabKey[]).map(renderTabButton)}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                {renderActiveTab()}
              </motion.div>
            </AnimatePresence>

            {/* Actions - Only show for Flow A users */}
            {!isFlowB && (
              <div className="pt-4 space-y-3">
                <Button
                  onClick={() => {
                    setReading(null);
                    setCapturedImage(null);
                  }}
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  New Reading
                </Button>

                <button
                  onClick={handleDeleteReading}
                  className="w-full py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 font-semibold flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete This Reading
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
