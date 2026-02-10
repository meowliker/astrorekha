"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Coins, Send, HelpCircle, X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useUserStore } from "@/lib/user-store";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";
import { generateUserId } from "@/lib/user-profile";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date | string;
  palmImage?: string;
  traits?: Array<{ name: string; value: number; color: string }>;
}

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  palmImage?: string;
  traits?: Array<{ name: string; value: number; color: string }>;
}

const suggestedQuestions = [
  "What does my palm say about my future?",
  "What are my career prospects this year?",
  "How can I improve my relationships?",
];

const coinPackages = [
  {
    id: 1,
    coins: 50,
    price: 4.99,
    discount: null,
    popular: false,
  },
  {
    id: 2,
    coins: 150,
    price: 12.99,
    discount: 15,
    popular: true,
  },
  {
    id: 3,
    coins: 300,
    price: 19.99,
    discount: 30,
    popular: false,
  },
  {
    id: 4,
    coins: 500,
    price: 29.99,
    discount: 40,
    popular: false,
  },
];

function formatMessage(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [palmImage, setPalmImage] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState("");
  const [purchasingPackage, setPurchasingPackage] = useState<number | null>(null);
  const [palmReading, setPalmReading] = useState<any>(null);
  const [natalChart, setNatalChart] = useState<any>(null);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [showLowBalanceBubble, setShowLowBalanceBubble] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get coins from user store
  const { coins, deductCoins } = useUserStore();

  // Map coin packages to Stripe package IDs
  const coinPackageToStripeId: Record<number, string> = {
    50: "coins-50",
    150: "coins-150",
    300: "coins-300",
    500: "coins-500",
  };

  const handlePurchaseCoins = async (pkg: typeof coinPackages[0]) => {
    setPurchaseError("");
    setPurchasingPackage(pkg.id);

    try {
      const response = await fetch("/api/stripe/create-coin-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "coins",
          packageId: coinPackageToStripeId[pkg.coins] || "coins-50",
          userId: generateUserId(),
          email: localStorage.getItem("palmcosmic_email") || "",
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setPurchaseError(data.error);
        setPurchasingPackage(null);
      } else {
        setPurchaseError("Unable to start checkout. Please try again.");
        setPurchasingPackage(null);
      }
    } catch (error) {
      console.error("Coin purchase error:", error);
      setPurchaseError("Something went wrong. Please try again.");
      setPurchasingPackage(null);
    }
  };

  // Get user data from onboarding store
  const {
    gender,
    birthMonth,
    birthDay,
    birthYear,
    birthPlace,
    birthHour,
    birthMinute,
    birthPeriod,
    relationshipStatus,
    goals,
    sunSign,
    moonSign,
    ascendantSign,
  } = useOnboardingStore();

  // Initialize welcome message and load palm reading + chat history from Firebase
  useEffect(() => {
    setIsClient(true);
    
    // Load palm image from localStorage
    const savedPalmImage = localStorage.getItem("palmcosmic_palm_image");
    if (savedPalmImage) {
      setPalmImage(savedPalmImage);
    }

    const loadData = async () => {
      const userId = generateUserId();
      setCurrentUserId(userId);
      console.log("[Chat] Loading data for userId:", userId);

      // Load palm reading from Firebase
      try {
        const palmDocSnap = await getDoc(doc(db, "palm_readings", userId));
        if (palmDocSnap.exists()) {
          const data = palmDocSnap.data();
          setPalmReading(data.reading);
          if (data.palmImageUrl) setPalmImage(data.palmImageUrl);
        }
      } catch (err) {
        console.error("[Chat] Failed to load palm reading:", err);
      }

      // Load natal chart from Firebase (calculated by astro-engine)
      try {
        const chartDocSnap = await getDoc(doc(db, "natal_charts", userId));
        if (chartDocSnap.exists()) {
          setNatalChart(chartDocSnap.data());
          console.log("[Chat] Loaded natal chart from Firestore");
        } else {
          // No chart saved yet — calculate it now via astro-engine
          console.log("[Chat] No natal chart found, calculating...");
          try {
            const signsResponse = await fetch("/api/astrology/signs", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-user-id": userId,
              },
              body: JSON.stringify({
                birthMonth,
                birthDay,
                birthYear,
                birthHour,
                birthMinute,
                birthPeriod,
                birthPlace,
              }),
            });
            if (signsResponse.ok) {
              // Re-fetch the chart that was just saved
              const newChartSnap = await getDoc(doc(db, "natal_charts", userId));
              if (newChartSnap.exists()) {
                setNatalChart(newChartSnap.data());
                console.log("[Chat] Natal chart calculated and loaded");
              }
            }
          } catch (calcErr) {
            console.error("[Chat] Failed to calculate natal chart:", calcErr);
          }
        }
      } catch (err) {
        console.error("[Chat] Failed to load natal chart:", err);
      }

      // Load chat history from Firebase
      try {
        console.log("[Chat] Attempting to load chat from:", `chat_messages/${userId}`);
        const chatDocSnap = await getDoc(doc(db, "chat_messages", userId));
        console.log("[Chat] Chat doc exists:", chatDocSnap.exists());
        if (chatDocSnap.exists()) {
          const data = chatDocSnap.data();
          console.log("[Chat] Loaded chat data:", data);
          if (data.messages && data.messages.length > 0) {
            const loadedMessages: Message[] = data.messages.map((m: StoredMessage) => ({
              ...m,
              timestamp: new Date(m.timestamp),
            }));
            setMessages(loadedMessages);
            setChatLoaded(true);
            return;
          }
        }
      } catch (err) {
        console.error("[Chat] Failed to load chat history:", err);
      }

      // No saved chat - show welcome message
      const greeting = ascendantSign?.name 
        ? `Hey there! I'm Elysia. I can see you're a ${ascendantSign.name} rising - that's fascinating! I've got your birth chart and palm reading ready. What's on your mind today?`
        : `Hey! I'm Elysia, your cosmic guide. I've got access to your birth chart and palm reading. What would you like to explore today?`;
      
      setMessages([
        {
          role: "assistant",
          content: greeting,
          timestamp: new Date(),
        },
      ]);
      setChatLoaded(true);
    };

    loadData();
  }, [gender, ascendantSign]);

  // Show low balance bubble when coins < 3
  useEffect(() => {
    if (coins < 3) {
      setShowLowBalanceBubble(true);
    }
  }, [coins]);

  // Save chat messages to Firebase whenever they change
  useEffect(() => {
    // Only save if we have loaded chat, have a userId, and user has sent at least one message
    const hasUserMessage = messages.some(m => m.role === "user");
    if (!chatLoaded || messages.length === 0 || !currentUserId || !hasUserMessage) {
      console.log("[Chat] Skip save - chatLoaded:", chatLoaded, "messages:", messages.length, "userId:", currentUserId, "hasUserMessage:", hasUserMessage);
      return;
    }

    const saveChat = async () => {
      try {
        console.log("[Chat] Saving chat for userId:", currentUserId, "messages count:", messages.length);
        // Filter out undefined fields - Firebase doesn't allow undefined values
        const storedMessages: StoredMessage[] = messages.map((m) => {
          const msg: StoredMessage = {
            role: m.role,
            content: m.content,
            timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
          };
          // Only add optional fields if they exist
          if (m.palmImage) msg.palmImage = m.palmImage;
          if (m.traits) msg.traits = m.traits;
          return msg;
        });
        
        const chatRef = doc(db, "chat_messages", currentUserId);
        await setDoc(chatRef, {
          messages: storedMessages,
          updatedAt: new Date().toISOString(),
          userId: currentUserId,
        });
        console.log("[Chat] Chat saved successfully to:", `chat_messages/${currentUserId}`);
      } catch (err: any) {
        console.error("[Chat] Failed to save chat:", err);
        console.error("[Chat] Error code:", err?.code);
        console.error("[Chat] Error message:", err?.message);
      }
    };

    // Debounce save to avoid too many writes
    const timeoutId = setTimeout(saveChat, 500);
    return () => clearTimeout(timeoutId);
  }, [messages, chatLoaded, currentUserId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || isLoading) return;

    // Check if user has enough coins (3 coins per message)
    if (coins < 3) {
      setShowPricing(true);
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Build user profile for personalized responses
      const userProfile = {
        gender,
        birthDate: `${birthMonth} ${birthDay}, ${birthYear}`,
        birthTime: birthHour && birthPeriod ? `${birthHour}:${birthMinute} ${birthPeriod}` : null,
        birthPlace,
        relationshipStatus,
        goals,
        sunSign: sunSign?.name,
        moonSign: moonSign?.name,
        ascendantSign: ascendantSign?.name,
        hasPalmImage: !!palmImage,
      };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          userProfile,
          palmImageBase64: palmImage,
          palmReading: palmReading,
          natalChart: natalChart,
          context: {
            previousMessages: messages.slice(-20),
          },
        }),
      });

      const data = await response.json();

      if (data.reply) {
        const assistantMessage: Message = {
          role: "assistant",
          content: data.reply,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        deductCoins(3); // Deduct 3 coins per message

        try {
          const userId = generateUserId();
          await updateDoc(doc(db, "users", userId), {
            coins: increment(-3),
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error("Failed to persist coin deduction:", err);
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="bg-[#1A1F2E] px-4 py-3 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/reports")}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden shadow-lg shadow-purple-500/30">
              <Image
                src="/elysia.png"
                alt="Elysia"
                width={48}
                height={48}
                className="w-full h-full object-cover"
                priority
              />
            </div>
            <div>
              <h1 className="text-white font-semibold">Elysia</h1>
              <p className="text-rose-400 text-xs">online</p>
            </div>
          </div>
        </div>

        {/* Coin Balance */}
        <div className="relative">
          <button
            onClick={() => setShowWallet(!showWallet)}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <span className="text-white font-semibold">{coins}</span>
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
              <Coins className="w-3.5 h-3.5 text-white" />
            </div>
          </button>

          {/* Wallet Dropdown */}
          <AnimatePresence>
            {showWallet && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40"
                  onClick={() => setShowWallet(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-64 bg-[#1A1F2E] rounded-2xl shadow-2xl border border-white/10 p-4 z-50"
                >
                  <button
                    onClick={() => setShowWallet(false)}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <div className="mb-4">
                    <p className="text-white/60 text-sm mb-1">Wallet Balance</p>
                    <div className="flex items-center gap-2">
                      <Coins className="w-6 h-6 text-yellow-400" />
                      <span className="text-white text-2xl font-bold">{coins}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      setShowWallet(false);
                      setShowPricing(true);
                    }}
                    className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                  >
                    Get More Coins
                  </Button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Low Balance Bubble */}
      <AnimatePresence>
        {showLowBalanceBubble && coins < 3 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 mt-2"
          >
            <div className="bg-[#1A2332] rounded-2xl p-4 flex items-center gap-3 border border-white/10 shadow-lg">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                <Coins className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">You're running out of balance</p>
                <p className="text-white/60 text-xs">Refill to continue chatting.</p>
              </div>
              <button
                onClick={() => {
                  setShowLowBalanceBubble(false);
                  setShowPricing(true);
                }}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-full transition-colors"
              >
                Refill
              </button>
              <button
                onClick={() => setShowLowBalanceBubble(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((message, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] ${
                message.role === "user"
                  ? "bg-gradient-to-r from-primary to-purple-600 text-white"
                  : "bg-[#1A1F2E] text-white"
              } rounded-3xl px-5 py-3`}
            >
              {/* Palm Image with Traits */}
              {message.palmImage && message.traits && (
                <div className="mb-4 bg-[#0F1419] rounded-2xl p-4 flex gap-4">
                  <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                    <Image
                      src={message.palmImage}
                      alt="Palm"
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-3">
                    {message.traits.map((trait, idx) => (
                      <div key={idx}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: trait.color }}
                            />
                            <span className="text-white/80 text-sm">{trait.name}</span>
                          </div>
                          <span className="text-white font-semibold text-sm">{trait.value}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${trait.value}%`,
                              backgroundColor: trait.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-sm leading-relaxed whitespace-pre-wrap">{formatMessage(message.content)}</p>
              <p className="text-[10px] opacity-50 mt-2">
                {(message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp)).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </motion.div>
        ))}

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-[#1A1F2E] rounded-3xl px-5 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-white font-medium text-sm">People usually ask</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {suggestedQuestions.map((question, index) => (
            <button
              key={index}
              onClick={() => sendMessage(question)}
              className="flex-shrink-0 px-4 py-2 bg-[#1A1F2E] text-white/80 text-sm rounded-full hover:bg-[#252A3A] transition-colors border border-white/10"
            >
              {question}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 pb-6">
        <div className="flex gap-2 items-center">
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type to ask..."
            className="flex-1 px-5 py-3 bg-[#1A1F2E] text-white rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-white/10"
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 rounded-full bg-gradient-to-r from-primary to-purple-600 flex items-center justify-center hover:from-primary/90 hover:to-purple-600/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Pricing Modal */}
      <AnimatePresence>
        {showPricing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPricing(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0A0E1A] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="text-white text-lg sm:text-2xl font-bold mb-1 truncate">Get More Coins</h2>
                  <p className="text-white/60 text-xs sm:text-sm">Choose a package to continue</p>
                </div>
                <button
                  onClick={() => {
                    setShowPricing(false);
                    setPurchaseError("");
                  }}
                  className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </button>
              </div>

              {/* Floating Error Message */}
              <AnimatePresence>
                {purchaseError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl"
                  >
                    <p className="text-red-400 text-sm text-center">{purchaseError}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Coin Packages Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                {coinPackages.map((pkg) => (
                  <motion.button
                    key={pkg.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePurchaseCoins(pkg)}
                    disabled={purchasingPackage !== null}
                    className={`relative bg-gradient-to-br from-[#1A1F2E] to-[#0F1419] rounded-xl sm:rounded-2xl p-3 sm:p-6 border-2 transition-all ${
                      pkg.popular
                        ? "border-primary shadow-lg shadow-primary/20"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    {/* Discount Badge */}
                    {pkg.discount && (
                      <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 bg-gradient-to-r from-primary to-purple-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full shadow-lg">
                        {pkg.discount}% OFF
                      </div>
                    )}

                    {/* Popular Badge */}
                    {pkg.popular && (
                      <div className="absolute -top-1.5 left-2 sm:-top-2 sm:left-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full shadow-lg">
                        POPULAR
                      </div>
                    )}

                    {/* Coin Icon */}
                    <div className="flex justify-center mb-2 sm:mb-4 mt-2 sm:mt-0">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                        <Coins className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                      </div>
                    </div>

                    {/* Coin Amount */}
                    <div className="text-center mb-1 sm:mb-2">
                      <p className="text-white text-xl sm:text-3xl font-bold">{pkg.coins}</p>
                      <p className="text-white/60 text-[10px] sm:text-sm">Coins</p>
                    </div>

                    {/* Price */}
                    <div className="text-center mb-2 sm:mb-4">
                      <p className="text-white text-lg sm:text-2xl font-bold">${pkg.price}</p>
                    </div>

                    {/* Buy Button */}
                    <div className={`w-full py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center justify-center ${
                      pkg.popular
                        ? "bg-gradient-to-r from-primary to-purple-600 text-white"
                        : "bg-white/10 text-white hover:bg-white/20"
                    }`}>
                      {purchasingPackage === pkg.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Buy Now"
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* Pricing Info */}
              <div className="mt-4 sm:mt-6 text-center">
                <p className="text-white/60 text-xs sm:text-sm mb-2 flex items-center justify-center gap-1">
                  💬 1 question = 3
                  <span className="inline-flex items-center">
                    <Coins className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400" />
                  </span>
                </p>
              </div>

              {/* Footer */}
              <div className="mt-2 sm:mt-3 text-center">
                <p className="text-white/40 text-[10px] sm:text-xs">
                  Secure payment powered by Stripe • Cancel anytime
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
