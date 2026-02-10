"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ScanPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center gap-4 px-4 py-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold flex-1 text-center pr-10">Scan Palm</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-4 py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            <div className="aspect-[3/4] bg-[#1A1F2E] rounded-3xl border border-white/10 flex items-center justify-center mb-6">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Camera className="w-10 h-10 text-white/40" />
                </div>
                <p className="text-white/50">Camera preview will appear here</p>
              </div>
            </div>

            <Button className="w-full h-14 text-lg bg-rose-600 hover:bg-rose-700 rounded-full">
              Capture Palm
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
