"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

const MESSAGES = [
  "Reading your planetary positions...",
  "Analysing your Lagna and Moon sign...",
  "Interpreting your current Dasha period...",
  "Writing your life predictions...",
  "Almost ready...",
];

export default function ReportLoadingState() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 4000);

    return () => window.clearInterval(interval);
  }, []);

  const currentMessage = useMemo(() => MESSAGES[messageIndex], [messageIndex]);

  return (
    <div className="bg-[#1A1F2E] rounded-2xl border border-white/10 p-8 text-center">
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="mx-auto mb-6 w-16 h-16 rounded-full bg-gradient-to-br from-primary/60 to-purple-500/60 flex items-center justify-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles className="w-8 h-8 text-white" />
        </motion.div>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.p
          key={currentMessage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="text-white font-medium"
        >
          {currentMessage}
        </motion.p>
      </AnimatePresence>

      <p className="text-white/60 text-sm mt-3">
        Your detailed report is being prepared. This takes about 20 seconds.
      </p>
    </div>
  );
}
