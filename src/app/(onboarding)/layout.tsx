"use client";

import { motion, AnimatePresence } from "framer-motion";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-background overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.main
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-y-auto"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
