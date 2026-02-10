"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { detectHandLandmarks } from "@/lib/palm-detection";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { pixelEvents } from "@/lib/pixel-events";

const predictionLabels = [
  { text: "Children", emoji: "👶", top: "15%", left: "20%", rotation: -15 },
  { text: "Marriage", emoji: "💕", top: "35%", left: "55%", rotation: 5 },
  { text: "Big change at", emoji: "✨", top: "55%", left: "15%", rotation: -10 },
];

export default function Step16Page() {
  const router = useRouter();
  const [palmImage, setPalmImage] = useState<string | null>(null);
  const [croppedPalmImage, setCroppedPalmImage] = useState<string | null>(null);

  useEffect(() => {
    const savedImage = localStorage.getItem("palmcosmic_palm_image");
    if (savedImage) {
      setPalmImage(savedImage);
    }
  }, []);

  useEffect(() => {
    if (!palmImage) return;

    (async () => {
      try {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.src = palmImage;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load palm image"));
        });

        const results = await detectHandLandmarks(img);
        const landmarks = results?.landmarks?.[0];
        if (!landmarks || landmarks.length === 0) {
          setCroppedPalmImage(palmImage);
          return;
        }

        let minX = 1;
        let minY = 1;
        let maxX = 0;
        let maxY = 0;
        for (const p of landmarks) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }

        const pad = 0.12;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(1, maxX + pad);
        maxY = Math.min(1, maxY + pad);

        const sx = Math.floor(minX * img.width);
        const sy = Math.floor(minY * img.height);
        const sw = Math.max(1, Math.ceil((maxX - minX) * img.width));
        const sh = Math.max(1, Math.ceil((maxY - minY) * img.height));

        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setCroppedPalmImage(palmImage);
          return;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const cropped = canvas.toDataURL("image/jpeg", 0.92);
        setCroppedPalmImage(cropped);
      } catch {
        setCroppedPalmImage(palmImage);
      }
    })();
  }, [palmImage]);

  const handleGetPrediction = () => {
    // Track AddToWishlist when user clicks "Get My Prediction"
    pixelEvents.addToWishlist("Full Prediction Access");
    
    // Check if user is in Flow B (bundle flow)
    const flow = localStorage.getItem("palmcosmic_onboarding_flow");
    if (flow === "flow-b") {
      router.push("/onboarding/bundle-pricing");
    } else {
      router.push("/onboarding/step-17");
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen bg-background"
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Header with Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-1 mb-2"
        >
          <img src="/logo.png" alt="PalmCosmic" className="w-20 h-20 object-contain" />
          <span className="text-sm text-muted-foreground">PalmCosmic</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl md:text-3xl font-bold text-center mb-1"
        >
          Your Palm Reading
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-xl md:text-2xl font-bold text-primary mb-8"
        >
          Is Ready!
        </motion.p>

        {/* Palm with prediction labels */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="relative w-72 h-80 mb-8"
        >
          {/* Circular glow background */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-primary/20 via-primary/10 to-transparent blur-2xl" />
          
          {/* Dark circle container */}
          <div className="absolute inset-4 rounded-full bg-card/80 border border-border/50 overflow-hidden flex items-center justify-center">
            {croppedPalmImage ? (
              <img
                src={croppedPalmImage}
                alt="Your palm"
                className="w-full h-full object-cover opacity-80"
              />
            ) : (
              <img
                src="/palm.png"
                alt="Your palm reading"
                className="w-[200px] h-[240px] object-contain opacity-80"
              />
            )}
          </div>

          {/* Prediction labels */}
          {predictionLabels.map((label, index) => (
            <motion.div
              key={label.text}
              initial={{ opacity: 0, scale: 0, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.6 + index * 0.2, type: "spring", stiffness: 200 }}
              className="absolute bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 shadow-lg"
              style={{
                top: label.top,
                left: label.left,
                transform: `rotate(${label.rotation}deg)`,
              }}
            >
              <span className="text-sm font-medium flex items-center gap-1">
                {label.text} <span>{label.emoji}</span>
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="p-6">
        <Button
          onClick={handleGetPrediction}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          Get My Prediction
        </Button>
      </div>
    </motion.div>
  );
}
