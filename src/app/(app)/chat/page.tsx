"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, HelpCircle, X, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { ASTROREKHA_ASSETS } from "@/lib/assets";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useUserStore } from "@/lib/user-store";
import { supabase } from "@/lib/supabase";
import { generateUserId } from "@/lib/user-profile";
import Script from "next/script";
import { usePricing } from "@/hooks/usePricing";
import { getPaymentAttributionPayload } from "@/lib/attribution-client";
import { trackMarketingEvent } from "@/lib/marketing-events-client";
import { normalizeIndianWhatsappNumber, toPayUPhoneNumber } from "@/lib/whatsapp";
import {
  CHAT_UNLIMITED_OFFER_EVENT_NAMES,
  CHAT_UNLIMITED_PASS_ID,
  CHAT_UNLIMITED_PASS_NAME,
  CHAT_UNLIMITED_PASS_PRICE_INR,
  CHAT_UNLIMITED_PASS_TYPE,
} from "@/lib/chat-unlimited-pass";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date | string;
  palmImage?: string;
  traits?: Array<{ name: string; value: number; color: string }>;
  followUpQuestions?: string[];
}

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  palmImage?: string;
  traits?: Array<{ name: string; value: number; color: string }>;
  followUpQuestions?: string[];
}

const suggestedQuestions = [
  "What does my palm say about my future?",
  "What are my career prospects this year?",
  "How can I improve my relationships?",
];

const COINS_PER_QUESTION = 3;

function toQuestionCount(coins: number): number {
  return Math.floor(Math.max(0, coins) / COINS_PER_QUESTION);
}

const QUESTION_PACKAGE_DISPLAY_COUNTS: Record<string, number> = {
  "coins-50": 15,
  "coins-150": 50,
  "coins-300": 100,
  "coins-500": 150,
};

const QUESTION_PACKAGE_FALLBACK_COUNTS = [15, 50, 100, 150];

function getQuestionPackageDisplayCount(packageId: string, coins: number, index: number): number {
  return QUESTION_PACKAGE_DISPLAY_COUNTS[packageId] ?? QUESTION_PACKAGE_FALLBACK_COUNTS[index] ?? toQuestionCount(coins);
}

// Fallback packages still map to existing backend coin package IDs.
const defaultCoinPackages = [
  { id: 1, coins: 45, price: 416, discount: 17, popular: false },
  { id: 2, coins: 150, price: 1082, discount: 28, popular: true },
  { id: 3, coins: 300, price: 1666, discount: 33, popular: false },
  { id: 4, coins: 450, price: 2499, discount: 29, popular: false },
];

const PENDING_PAYMENT_KEY = "astrorekha_pending_payu_payment";

function getUnlimitedOfferSeenKey(userId: string | null): string {
  return `astrorekha_chat_unlimited_offer_seen:${userId || "anon"}`;
}

function formatPassCountdown(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function savePendingPayUPayment(payment: {
  txnid: string;
  type: string;
  bundleId?: string;
  returnTo: string;
}) {
  localStorage.setItem(
    PENDING_PAYMENT_KEY,
    JSON.stringify({
      ...payment,
      createdAt: new Date().toISOString(),
    })
  );
}

function normalizePayUStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isPayUCancelOrFailure(value: unknown): boolean {
  const status = normalizePayUStatus(value);
  return (
    !status ||
    status.includes("cancel") ||
    status.includes("fail") ||
    status.includes("bounce") ||
    status.includes("drop") ||
    status === "usercancelled"
  );
}

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
  const [showChatInfo, setShowChatInfo] = useState(false);
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
  const [showUnlimitedOffer, setShowUnlimitedOffer] = useState(false);
  const [unlimitedOfferAlreadyShown, setUnlimitedOfferAlreadyShown] = useState(false);
  const [unlimitedPassEndsAt, setUnlimitedPassEndsAt] = useState<string | null>(null);
  const [purchasingUnlimitedPass, setPurchasingUnlimitedPass] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());

  // Backend balance stays coin-based while the chat UI presents questions.
  const { coins, deductCoins, setCoins } = useUserStore();
  const questionBalance = toQuestionCount(coins);
  const unlimitedPassRemainingSeconds = unlimitedPassEndsAt
    ? Math.max(0, Math.floor((new Date(unlimitedPassEndsAt).getTime() - countdownNow) / 1000))
    : 0;
  const hasActiveUnlimitedPass = unlimitedPassRemainingSeconds > 0;
  
  // Get dynamic pricing from API
  const { pricing } = usePricing();
  
  // Build question packages from the existing coin pricing model.
  const questionPackages = pricing?.coinPackages?.filter(p => p.active).map((p, i) => ({
    id: i + 1,
    coins: p.coins,
    questions: getQuestionPackageDisplayCount(p.id, p.coins, i),
    price: p.price,
    discount: p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : null,
    popular: i === 1, // Second package is popular
    packageId: p.id,
  })) || defaultCoinPackages.map((p, i) => {
    const packageId = `coins-${p.coins}`;
    return {
      ...p,
      questions: getQuestionPackageDisplayCount(packageId, p.coins, i),
      packageId,
    };
  });

  const refreshUnlimitedPassStatus = async (userId: string | null = currentUserId) => {
    if (!userId) return null;

    try {
      const response = await fetch(`/api/chat/unlimited-pass/status?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });
      const data = await response.json();
      const endsAt = typeof data?.pass?.endsAt === "string" ? data.pass.endsAt : null;
      setUnlimitedPassEndsAt(endsAt);

      const localSeen = localStorage.getItem(getUnlimitedOfferSeenKey(userId)) === "1";
      const serverSeen = !!data?.shown;
      setUnlimitedOfferAlreadyShown(localSeen || serverSeen);
      if (serverSeen && !localSeen) {
        localStorage.setItem(getUnlimitedOfferSeenKey(userId), "1");
      }

      return data;
    } catch (error) {
      console.error("[Chat] Failed to refresh unlimited pass:", error);
      return null;
    }
  };

  const refreshQuestionBalance = async (userId: string | null = currentUserId): Promise<number | null> => {
    if (!userId) return null;

    try {
      const storedEmail = String(
        localStorage.getItem("astrorekha_email") ||
        localStorage.getItem("astrorekha_checkout_email") ||
        ""
      )
        .trim()
        .toLowerCase();
      const params = new URLSearchParams({ userId });
      if (storedEmail) params.set("email", storedEmail);

      const response = await fetch(`/api/user/chat-balance?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) return null;

      const data = await response.json();
      const resolvedUserId = typeof data?.userId === "string" ? data.userId : userId;
      const resolvedEmail = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";

      if (resolvedUserId && resolvedUserId !== userId) {
        localStorage.setItem("astrorekha_user_id", resolvedUserId);
        setCurrentUserId(resolvedUserId);
      }

      if (resolvedEmail && !storedEmail) {
        localStorage.setItem("astrorekha_email", resolvedEmail);
        localStorage.setItem("astrorekha_checkout_email", resolvedEmail);
      }

      if (typeof data?.coins === "number") {
        setCoins(data.coins);
        return data.coins;
      }
    } catch (error) {
      console.error("[Chat] Failed to refresh question balance:", error);
    }

    return null;
  };

  const recordUnlimitedOfferShown = async (userId: string | null = currentUserId) => {
    if (!userId) return;
    const storageKey = getUnlimitedOfferSeenKey(userId);
    if (localStorage.getItem(storageKey) === "1") return;

    localStorage.setItem(storageKey, "1");
    setUnlimitedOfferAlreadyShown(true);
    await trackMarketingEvent({
      eventName: CHAT_UNLIMITED_OFFER_EVENT_NAMES.shown,
      productType: CHAT_UNLIMITED_PASS_TYPE,
      productId: CHAT_UNLIMITED_PASS_ID,
      productName: CHAT_UNLIMITED_PASS_NAME,
      amount: CHAT_UNLIMITED_PASS_PRICE_INR * 100,
      metadata: {
        trigger: "questions_exhausted",
      },
    });
  };

  const handleOutOfQuestions = async () => {
    setPurchaseError("");
    setShowLowBalanceBubble(false);
    setShowWallet(false);

    const userId = currentUserId || generateUserId();
    const status = await refreshUnlimitedPassStatus(userId);
    if (status?.active) return;

    const alreadyShown =
      unlimitedOfferAlreadyShown ||
      localStorage.getItem(getUnlimitedOfferSeenKey(userId)) === "1" ||
      !!status?.shown;

    if (!alreadyShown) {
      setShowPricing(false);
      setShowUnlimitedOffer(true);
      await recordUnlimitedOfferShown(userId);
      return;
    }

    setShowPricing(true);
  };

  const handlePurchaseQuestions = async (pkg: typeof questionPackages[0]) => {
    setPurchaseError("");
    setPurchasingPackage(pkg.id);

    try {
      const checkoutWhatsappNumber = normalizeIndianWhatsappNumber(
        localStorage.getItem("astrorekha_whatsapp_number")
      );
      const response = await fetch("/api/payu/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: generateUserId(),
          packageId: pkg.packageId,
          type: "coins",
          email: localStorage.getItem("astrorekha_email") || "",
          firstName: localStorage.getItem("astrorekha_name") || "Customer",
          whatsappNumber: checkoutWhatsappNumber,
          birthDetails: useOnboardingStore.getState(),
          attribution: getPaymentAttributionPayload(),
        }),
      });

      const data = await response.json();

      if (data.txnId) {
        savePendingPayUPayment({
          txnid: data.txnId,
          type: "coins",
          bundleId: pkg.packageId,
          returnTo: "/chat",
        });
        const bolt = (window as any).bolt;
        bolt.launch({
          key: data.key,
          txnid: data.txnId,
          hash: data.hash,
          amount: data.amount,
          firstname: data.firstName,
          email: data.email,
          phone: data.phone || toPayUPhoneNumber(checkoutWhatsappNumber),
          productinfo: data.productInfo,
          udf1: data.udf1,
          udf2: data.udf2,
          udf3: data.udf3,
          udf4: data.udf4,
          udf5: data.udf5,
          surl: `${window.location.origin}/api/payu/success`,
          furl: `${window.location.origin}/api/payu/failure`,
        }, {
          responseHandler: async (response: any) => {
            if (response.response.txnStatus === "SUCCESS") {
              await fetch("/api/payu/verify-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  txnid: response.response.txnid,
                  mihpayid: response.response.mihpayid,
                  status: "success",
                  hash: response.response.hash,
                  amount: data.amount,
                  productinfo: data.productInfo,
                  firstname: data.firstName,
                  email: data.email,
                  phone: data.phone || toPayUPhoneNumber(checkoutWhatsappNumber),
                  udf1: data.udf1,
                  udf2: data.udf2,
                  udf3: data.udf3,
                  udf4: data.udf4,
                  udf5: data.udf5,
                  key: data.key,
                }),
              });
              localStorage.removeItem(PENDING_PAYMENT_KEY);
              setPurchasingPackage(null);
              window.location.reload();
            } else if (isPayUCancelOrFailure(response.response.txnStatus)) {
              localStorage.removeItem(PENDING_PAYMENT_KEY);
              setPurchaseError("Payment was cancelled. You can try again whenever you're ready.");
              setPurchasingPackage(null);
            } else {
              window.location.href = `/payment/processing?txnid=${encodeURIComponent(data.txnId)}&source=coins`;
            }
          },
          catchException: (error: any) => {
            console.error("PayU Bolt error:", error);
            localStorage.removeItem(PENDING_PAYMENT_KEY);
            setPurchaseError("Payment was cancelled. You can try again whenever you're ready.");
            setPurchasingPackage(null);
          }
        });
      } else {
        setPurchaseError(data.error || "Unable to start checkout. Please try again.");
        setPurchasingPackage(null);
      }
    } catch (error) {
      console.error("Question purchase error:", error);
      setPurchaseError("Something went wrong. Please try again.");
      setPurchasingPackage(null);
    }
  };

  const handlePurchaseUnlimitedPass = async () => {
    setPurchaseError("");
    setPurchasingUnlimitedPass(true);

    try {
      const checkoutWhatsappNumber = normalizeIndianWhatsappNumber(
        localStorage.getItem("astrorekha_whatsapp_number")
      );
      const response = await fetch("/api/payu/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId || generateUserId(),
          packageId: CHAT_UNLIMITED_PASS_ID,
          type: CHAT_UNLIMITED_PASS_TYPE,
          email: localStorage.getItem("astrorekha_email") || "",
          firstName: localStorage.getItem("astrorekha_name") || "Customer",
          whatsappNumber: checkoutWhatsappNumber,
          birthDetails: useOnboardingStore.getState(),
          attribution: getPaymentAttributionPayload(),
        }),
      });

      const data = await response.json();

      if (data.txnId) {
        await trackMarketingEvent({
          eventName: CHAT_UNLIMITED_OFFER_EVENT_NAMES.checkoutStarted,
          productType: CHAT_UNLIMITED_PASS_TYPE,
          productId: CHAT_UNLIMITED_PASS_ID,
          productName: CHAT_UNLIMITED_PASS_NAME,
          paymentId: `pay_${data.txnId}`,
          payuTxnId: data.txnId,
          amount: Math.round(Number(data.amount || CHAT_UNLIMITED_PASS_PRICE_INR) * 100),
          metadata: {
            durationMinutes: 20,
          },
        });

        savePendingPayUPayment({
          txnid: data.txnId,
          type: CHAT_UNLIMITED_PASS_TYPE,
          bundleId: CHAT_UNLIMITED_PASS_ID,
          returnTo: "/chat",
        });
        const bolt = (window as any).bolt;
        bolt.launch({
          key: data.key,
          txnid: data.txnId,
          hash: data.hash,
          amount: data.amount,
          firstname: data.firstName,
          email: data.email,
          phone: data.phone || toPayUPhoneNumber(checkoutWhatsappNumber),
          productinfo: data.productInfo,
          udf1: data.udf1,
          udf2: data.udf2,
          udf3: data.udf3,
          udf4: data.udf4,
          udf5: data.udf5,
          surl: `${window.location.origin}/api/payu/success`,
          furl: `${window.location.origin}/api/payu/failure`,
        }, {
          responseHandler: async (response: any) => {
            if (response.response.txnStatus === "SUCCESS") {
              await fetch("/api/payu/verify-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  txnid: response.response.txnid,
                  mihpayid: response.response.mihpayid,
                  status: "success",
                  hash: response.response.hash,
                  amount: data.amount,
                  productinfo: data.productInfo,
                  firstname: data.firstName,
                  email: data.email,
                  phone: data.phone || toPayUPhoneNumber(checkoutWhatsappNumber),
                  udf1: data.udf1,
                  udf2: data.udf2,
                  udf3: data.udf3,
                  udf4: data.udf4,
                  udf5: data.udf5,
                  key: data.key,
                }),
              });
              localStorage.removeItem(PENDING_PAYMENT_KEY);
              setPurchasingUnlimitedPass(false);
              setShowUnlimitedOffer(false);
              setShowLowBalanceBubble(false);
              await refreshUnlimitedPassStatus(currentUserId || generateUserId());
            } else if (isPayUCancelOrFailure(response.response.txnStatus)) {
              localStorage.removeItem(PENDING_PAYMENT_KEY);
              setPurchaseError("Payment was cancelled. You can try again whenever you're ready.");
              setPurchasingUnlimitedPass(false);
            } else {
              window.location.href = `/payment/processing?txnid=${encodeURIComponent(data.txnId)}&source=chat_pass`;
            }
          },
          catchException: (error: any) => {
            console.error("PayU Bolt error:", error);
            localStorage.removeItem(PENDING_PAYMENT_KEY);
            setPurchaseError("Payment was cancelled. You can try again whenever you're ready.");
            setPurchasingUnlimitedPass(false);
          }
        });
      } else {
        setPurchaseError(data.error || "Unable to start checkout. Please try again.");
        setPurchasingUnlimitedPass(false);
      }
    } catch (error) {
      console.error("Unlimited chat purchase error:", error);
      setPurchaseError("Something went wrong. Please try again.");
      setPurchasingUnlimitedPass(false);
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

  // Initialize welcome message and load palm reading + chat history from Supabase
  useEffect(() => {
    setIsClient(true);
    
    // Load palm image from localStorage
    const savedPalmImage = localStorage.getItem("astrorekha_palm_image");
    if (savedPalmImage) {
      setPalmImage(savedPalmImage);
    }

    const loadData = async () => {
      const userId = localStorage.getItem("astrorekha_user_id") || generateUserId();
      setCurrentUserId(userId);
      await refreshQuestionBalance(userId);
      refreshUnlimitedPassStatus(userId);

      // Load palm reading from Supabase
      try {
        const { data: palmData } = await supabase.from("palm_readings").select("*").eq("id", userId).single();
        if (palmData) {
          setPalmReading(palmData.reading);
          if (palmData.palm_image_url) setPalmImage(palmData.palm_image_url);
        }
      } catch (err) {
        console.error("[Chat] Failed to load palm reading:", err);
      }

      // Load natal chart from Supabase (calculated by astro-engine)
      try {
        const { data: chartData } = await supabase.from("natal_charts").select("*").eq("id", userId).single();
        if (chartData) {
          setNatalChart(chartData);
        } else {
          // No chart saved yet — calculate it now via astro-engine
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
              const { data: newChart } = await supabase.from("natal_charts").select("*").eq("id", userId).single();
              if (newChart) {
                setNatalChart(newChart);
              }
            }
          } catch (calcErr) {
            console.error("[Chat] Failed to calculate natal chart:", calcErr);
          }
        }
      } catch (err) {
        console.error("[Chat] Failed to load natal chart:", err);
      }

      // Load chat history from Supabase
      try {
        let { data: chatDoc } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

        // Fallback: if user upgraded from anon to registered ID and old chat row still exists on anon ID,
        // load that history and migrate it to current user ID.
        if (!chatDoc) {
          const anonId = localStorage.getItem("astrorekha_anon_id");
          if (anonId && anonId !== userId) {
            const { data: anonChatDoc } = await supabase
              .from("chat_messages")
              .select("*")
              .eq("id", anonId)
              .maybeSingle();

            if (anonChatDoc?.messages?.length) {
              chatDoc = anonChatDoc;

              // Best-effort migration to current ID.
              await supabase.from("chat_messages").upsert(
                {
                  id: userId,
                  messages: anonChatDoc.messages,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "id" }
              );

              // Best-effort cleanup of old anon row.
              await supabase.from("chat_messages").delete().eq("id", anonId);
            }
          }
        }

        if (chatDoc?.messages && chatDoc.messages.length > 0) {
          const loadedMessages: Message[] = chatDoc.messages.map((m: StoredMessage) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
          setMessages(loadedMessages);
          setChatLoaded(true);
          return;
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
  }, []);

  useEffect(() => {
    if (!unlimitedPassEndsAt) return;
    const interval = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [unlimitedPassEndsAt]);

  useEffect(() => {
    if (!currentUserId) return;

    const refreshChatEntitlements = () => {
      refreshQuestionBalance(currentUserId);
      refreshUnlimitedPassStatus(currentUserId);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshChatEntitlements();
      }
    };

    refreshChatEntitlements();
    window.addEventListener("pageshow", refreshChatEntitlements);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", refreshChatEntitlements);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUserId]);

  // If an unlimited pass becomes active, hide any exhausted-balance UI.
  useEffect(() => {
    if (!hasActiveUnlimitedPass) return;
    setShowLowBalanceBubble(false);
    setShowPricing(false);
    setShowUnlimitedOffer(false);
  }, [hasActiveUnlimitedPass]);

  // Save chat messages to Supabase whenever they change
  useEffect(() => {
    // Only save if we have loaded chat, have a userId, and user has sent at least one message
    const hasUserMessage = messages.some(m => m.role === "user");
    if (!chatLoaded || messages.length === 0 || !currentUserId || !hasUserMessage) {
      return;
    }

    const saveChat = async () => {
      try {
        // Filter out undefined fields
        const storedMessages: StoredMessage[] = messages.map((m) => {
          const msg: StoredMessage = {
            role: m.role,
            content: m.content,
            timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
          };
          // Only add optional fields if they exist
          if (m.palmImage) msg.palmImage = m.palmImage;
          if (m.traits) msg.traits = m.traits;
          if (m.followUpQuestions?.length) msg.followUpQuestions = m.followUpQuestions;
          return msg;
        });
        
        await supabase.from("chat_messages").upsert(
          {
            id: currentUserId,
            messages: storedMessages,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
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

    // One visible question maps to the existing backend balance deduction.
    const unlimitedActiveForThisMessage = hasActiveUnlimitedPass;
    const initialUserId = currentUserId || generateUserId();
    const freshCoins = await refreshQuestionBalance(initialUserId);
    const userIdForMessage = localStorage.getItem("astrorekha_user_id") || initialUserId;
    const availableCoins = typeof freshCoins === "number" ? freshCoins : coins;

    if (!unlimitedActiveForThisMessage && availableCoins < COINS_PER_QUESTION) {
      await handleOutOfQuestions();
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [
      ...prev.map((message) => (
        message.followUpQuestions?.length
          ? { ...message, followUpQuestions: undefined }
          : message
      )),
      userMessage,
    ]);
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
          userId: userIdForMessage,
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

      if (response.status === 402 || data.error === "NO_QUESTIONS_LEFT") {
        await handleOutOfQuestions();
        setMessages((prev) => prev.filter((message) => message !== userMessage));
        return;
      }

      if (data.reply) {
        const assistantMessage: Message = {
          role: "assistant",
          content: data.reply,
          timestamp: new Date(),
          followUpQuestions: Array.isArray(data.followUpQuestions)
            ? data.followUpQuestions.filter((question: unknown) => typeof question === "string" && question.trim()).slice(0, 3)
            : [],
        };
        setMessages((prev) => [...prev, assistantMessage]);
        if (data.unlimitedPassEndsAt) {
          setUnlimitedPassEndsAt(data.unlimitedPassEndsAt);
        }

        if (!unlimitedActiveForThisMessage && !data.unlimitedPassActive) {
          deductCoins(COINS_PER_QUESTION);

          try {
            const userId = userIdForMessage;
            const { data: currentUser } = await supabase.from("users").select("coins").eq("id", userId).single();
            if (currentUser) {
              await supabase.from("users").update({
                coins: Math.max(0, (currentUser.coins || 0) - COINS_PER_QUESTION),
                updated_at: new Date().toISOString(),
              }).eq("id", userId);
            }
          } catch (err) {
            console.error("Failed to persist question deduction:", err);
          }
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

  const handleFollowUpClick = (question: string) => {
    sendMessage(question);
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
                src={ASTROREKHA_ASSETS.elysia}
                alt="Elysia"
                width={48}
                height={48}
                unoptimized
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

        {/* Header actions */}
        <div className="relative flex items-center gap-2">
          <button
            onClick={() => {
              setShowChatInfo((prev) => !prev);
              setShowWallet(false);
            }}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label="Chat disclaimer"
            title="Chat disclaimer"
          >
            <HelpCircle className="w-5 h-5 text-white/85" />
          </button>

          <AnimatePresence>
            {showChatInfo && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40"
                  onClick={() => setShowChatInfo(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-72 bg-[#1A1F2E] rounded-2xl shadow-2xl border border-white/10 p-4 z-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-white text-sm font-semibold">About Elysia Chat</p>
                      <p className="mt-2 text-xs leading-5 text-white/70">
                        Elysia&apos;s chat replies are AI-generated spiritual guidance, not professional advice.
                        AstroRekha assumes no liability for decisions or outcomes based on chat responses.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowChatInfo(false)}
                      className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors shrink-0"
                      aria-label="Close chat disclaimer"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <button
            onClick={() => {
              setShowWallet(!showWallet);
              setShowChatInfo(false);
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-full transition-colors ${
              hasActiveUnlimitedPass
                ? "bg-gradient-to-r from-emerald-500/25 to-cyan-500/20 border border-emerald-300/25 text-white"
                : "bg-white/10 hover:bg-white/20"
            }`}
          >
            <span className="text-white font-semibold">
              {hasActiveUnlimitedPass ? `${formatPassCountdown(unlimitedPassRemainingSeconds)} unlimited` : `${questionBalance} questions`}
            </span>
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
                    <p className="text-white text-4xl font-bold leading-none">
                      {hasActiveUnlimitedPass ? formatPassCountdown(unlimitedPassRemainingSeconds) : questionBalance}
                    </p>
                    <p className="mt-1 text-white/60 text-sm font-medium">
                      {hasActiveUnlimitedPass ? "unlimited chat left" : "questions left"}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setShowWallet(false);
                      if (hasActiveUnlimitedPass) return;
                      setShowPricing(true);
                    }}
                    disabled={hasActiveUnlimitedPass}
                    className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                  >
                    {hasActiveUnlimitedPass ? "Pass Active" : "Ask More Questions"}
                  </Button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Low Balance Bubble */}
      <AnimatePresence>
        {showLowBalanceBubble && coins < COINS_PER_QUESTION && !hasActiveUnlimitedPass && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 mt-2"
          >
            <div className="bg-[#1A2332] rounded-2xl p-4 flex items-center gap-3 border border-white/10 shadow-lg">
              <div className="flex-1">
                <p className="text-white font-medium text-sm">You're out of questions</p>
                <p className="text-white/60 text-xs">Add more to continue chatting.</p>
              </div>
              <button
                onClick={() => {
                  setShowLowBalanceBubble(false);
                  setShowPricing(true);
                }}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-full transition-colors"
              >
                Add
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
            <div className="max-w-[85%]">
              <div
                className={`${
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

                {message.role === "assistant" && message.followUpQuestions?.length ? (
                  <div className="mt-3 flex flex-col items-start gap-1.5">
                    {message.followUpQuestions.map((question, followUpIndex) => (
                      <button
                        key={`${index}-${followUpIndex}`}
                        type="button"
                        onClick={() => handleFollowUpClick(question)}
                        className="group inline-flex max-w-full items-start gap-2 rounded-2xl border border-fuchsia-300/20 bg-gradient-to-r from-fuchsia-500/18 via-primary/12 to-cyan-400/10 px-3 py-1.5 text-left text-[11px] font-medium leading-snug text-white/90 shadow-[0_8px_22px_rgba(236,72,153,0.10),inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur transition-all hover:-translate-y-0.5 hover:border-fuchsia-200/35 hover:from-fuchsia-500/24 hover:via-primary/18 hover:to-cyan-400/14"
                      >
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-fuchsia-200 transition-transform group-hover:scale-110" />
                        <span className="min-w-0">{question}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <p className="text-[10px] opacity-50 mt-2">
                  {(message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp)).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
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

      {/* One-Time Unlimited Chat Offer */}
      <AnimatePresence>
        {showUnlimitedOffer && !hasActiveUnlimitedPass && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setShowUnlimitedOffer(false);
              trackMarketingEvent({
                eventName: CHAT_UNLIMITED_OFFER_EVENT_NAMES.dismissed,
                productType: CHAT_UNLIMITED_PASS_TYPE,
                productId: CHAT_UNLIMITED_PASS_ID,
                productName: CHAT_UNLIMITED_PASS_NAME,
                amount: CHAT_UNLIMITED_PASS_PRICE_INR * 100,
              });
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 18 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm overflow-hidden rounded-3xl border border-fuchsia-300/20 bg-[#0A0E1A] shadow-2xl shadow-primary/20"
            >
              <div className="relative px-6 pt-7 pb-5 text-center">
                <button
                  onClick={() => {
                    setShowUnlimitedOffer(false);
                    trackMarketingEvent({
                      eventName: CHAT_UNLIMITED_OFFER_EVENT_NAMES.dismissed,
                      productType: CHAT_UNLIMITED_PASS_TYPE,
                      productId: CHAT_UNLIMITED_PASS_ID,
                      productName: CHAT_UNLIMITED_PASS_NAME,
                      amount: CHAT_UNLIMITED_PASS_PRICE_INR * 100,
                    });
                  }}
                  className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
                  aria-label="Close unlimited chat offer"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-fuchsia-500 to-cyan-400 shadow-lg shadow-primary/25">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">One-time offer</p>
                <h2 className="text-2xl font-bold text-white">Unlock 20 minutes of unlimited chat</h2>
                <p className="mt-3 text-sm leading-6 text-white/65">
                  Your questions are finished. Continue asking Elysia anything for the next 20 minutes.
                </p>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-end justify-center gap-2">
                    <span className="text-4xl font-bold text-white">₹{CHAT_UNLIMITED_PASS_PRICE_INR}</span>
                    <span className="pb-1 text-sm font-medium text-white/50">for 20 minutes</span>
                  </div>
                </div>

                <AnimatePresence>
                  {purchaseError && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3"
                    >
                      <p className="text-center text-sm text-red-300">{purchaseError}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  onClick={handlePurchaseUnlimitedPass}
                  disabled={purchasingUnlimitedPass}
                  className="mt-5 h-12 w-full rounded-2xl bg-gradient-to-r from-primary to-purple-600 text-base font-bold text-white hover:from-primary/90 hover:to-purple-600/90"
                >
                  {purchasingUnlimitedPass ? <Loader2 className="h-5 w-5 animate-spin" /> : "Get Unlimited Chat"}
                </Button>
                <button
                  onClick={() => {
                    setShowUnlimitedOffer(false);
                    setShowPricing(true);
                    trackMarketingEvent({
                      eventName: CHAT_UNLIMITED_OFFER_EVENT_NAMES.dismissed,
                      productType: CHAT_UNLIMITED_PASS_TYPE,
                      productId: CHAT_UNLIMITED_PASS_ID,
                      productName: CHAT_UNLIMITED_PASS_NAME,
                      amount: CHAT_UNLIMITED_PASS_PRICE_INR * 100,
                      metadata: { action: "view_question_packs" },
                    });
                  }}
                  className="mt-3 text-sm font-medium text-white/50 transition hover:text-white/75"
                >
                  See question packs instead
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  <h2 className="text-white text-lg sm:text-2xl font-bold mb-1 truncate">Ask More Questions</h2>
                  <p className="text-white/60 text-xs sm:text-sm">Choose a question pack to continue</p>
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

              {/* Question Packages Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                {questionPackages.map((pkg) => (
                  <motion.button
                    key={pkg.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePurchaseQuestions(pkg)}
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

                    {/* Question Amount */}
                    <div className="text-center mb-3 sm:mb-5 mt-2">
                      <p className="text-white text-xl sm:text-3xl font-bold">{pkg.questions}</p>
                      <p className="text-white/60 text-[10px] sm:text-sm">Questions</p>
                    </div>

                    {/* Price */}
                    <div className="text-center mb-2 sm:mb-4">
                      <p className="text-white text-lg sm:text-2xl font-bold">₹{pkg.price}</p>
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

              {/* Footer */}
              <div className="mt-2 sm:mt-3 text-center">
                <p className="text-white/40 text-[10px] sm:text-xs">
                  Secure payment powered by PayU
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      {/* Load PayU Bolt script only on this page */}
      <Script src="https://jssdk.payu.in/bolt/bolt.min.js" strategy="afterInteractive" />
    </div>
  );
}
