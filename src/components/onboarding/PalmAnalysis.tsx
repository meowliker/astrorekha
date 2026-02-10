"use client";

import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { detectPalmFeatures as detectPalmFeaturesFromImage } from "@/lib/palm-detection";

interface PalmAnalysisProps {
  imageData: string;
  onComplete: () => void;
}

export function PalmAnalysis({ imageData, onComplete }: PalmAnalysisProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Initializing analysis...");
  const [fingertips, setFingertips] = useState<{ x: number; y: number }[]>([]);
  const fingertipsSetRef = useRef(false);
  const detectionStartedRef = useRef(false);

  // Run detection once on mount
  useEffect(() => {
    if (!imageData || detectionStartedRef.current) return;
    detectionStartedRef.current = true;

    const mapPointToCover = (
      point: { x: number; y: number },
      imageSize: { width: number; height: number },
      containerSize: { width: number; height: number }
    ) => {
      const scale = Math.max(
        containerSize.width / imageSize.width,
        containerSize.height / imageSize.height
      );
      const scaledWidth = imageSize.width * scale;
      const scaledHeight = imageSize.height * scale;
      const offsetX = (scaledWidth - containerSize.width) / 2;
      const offsetY = (scaledHeight - containerSize.height) / 2;

      const xPx = point.x * scaledWidth - offsetX;
      const yPx = point.y * scaledHeight - offsetY;

      const xNorm = (xPx / containerSize.width) * 100;
      const yNorm = (yPx / containerSize.height) * 133;

      return {
        x: Math.max(0, Math.min(100, xNorm)),
        y: Math.max(0, Math.min(133, yNorm)),
      };
    };

    // Start detection immediately
    (async () => {
      try {
        console.log("[PalmAnalysis] Starting detection...");
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.src = imageData;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            console.log("[PalmAnalysis] Image loaded:", img.width, "x", img.height);
            resolve();
          };
          img.onerror = () => reject(new Error("Failed to load palm image"));
        });

        console.log("[PalmAnalysis] Calling detectPalmFeatures...");
        const detected = await detectPalmFeaturesFromImage(img);
        console.log("[PalmAnalysis] Detection result:", detected);

        const container = containerRef.current;
        const containerSize = container
          ? { width: container.clientWidth, height: container.clientHeight }
          : null;

        if (detected.fingertips.length > 0 && containerSize) {
          const mappedTips = detected.fingertips.map((t) =>
            mapPointToCover(
              { x: t.x, y: t.y },
              { width: img.width, height: img.height },
              containerSize
            )
          );

          console.log("[PalmAnalysis] Mapped fingertips:", mappedTips);

          const showFingertips = () => {
            if (!fingertipsSetRef.current) {
              fingertipsSetRef.current = true;
              setFingertips(mappedTips);
            }
          };

          setTimeout(showFingertips, 3500);
        }
      } catch (err) {
        console.error("[PalmAnalysis] Detection error:", err);
      }
    })();

    // Progress animation - completely independent from detection
    const totalDuration = 8000;
    const startTime = Date.now();
    
    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progressPercent = Math.min(Math.floor((elapsed / totalDuration) * 100), 100);
      setProgress(progressPercent);

      // Update status text based on progress
      if (progressPercent < 25) {
        setStatusText("Detecting hand position...");
      } else if (progressPercent < 50) {
        setStatusText("Scanning palm features...");
      } else if (progressPercent < 70) {
        setStatusText("Locating fingertips...");
      } else if (progressPercent < 85) {
        setStatusText("Analyzing palm lines...");
      } else {
        setStatusText("Generating your palm reading result...");
      }

      if (elapsed < totalDuration) {
        requestAnimationFrame(updateProgress);
      } else {
        // Complete after a short delay
        setTimeout(() => {
          onComplete();
        }, 1500);
      }
    };

    // Start progress animation
    setTimeout(updateProgress, 500);
  }, [imageData, onComplete]);

  return (
    <div className="flex flex-col items-center w-full">
      <div
        ref={containerRef}
        className="relative w-full max-w-sm aspect-[3/4] bg-black/50 rounded-lg overflow-hidden"
      >
        {/* Captured palm image */}
        <img
          src={imageData}
          alt="Captured palm"
          className="w-full h-full object-cover"
        />

        {/* Scanning line - pure CSS animation, completely independent */}
        {progress < 100 && (
          <div 
            className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-400 to-transparent animate-scan-line"
            style={{
              boxShadow: "0 0 10px 2px rgba(239, 107, 107, 0.6)",
            }}
          />
        )}

        {/* SVG overlay for fingertips */}
        <svg
          viewBox="0 0 100 133"
          className="absolute inset-0 w-full h-full pointer-events-none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          {/* Fingertip dots */}
          {fingertips.map((tip, index) => (
            <motion.circle
              key={index}
              cx={tip.x}
              cy={tip.y}
              r="1.5"
              fill="white"
              initial={{ scale: 0.9, opacity: 0.55 }}
              animate={{ scale: [0.9, 1.35, 0.9], opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: index * 0.08 }}
            />
          ))}
        </svg>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Progress section */}
      <div className="w-full max-w-sm mt-6 px-4">
        <motion.p
          className="text-2xl font-bold text-center mb-3"
          key={progress}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
        >
          {progress}%
        </motion.p>

        {/* Progress bar */}
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-primary/70"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <p className="text-muted-foreground text-center text-sm mt-3">
          {statusText}
        </p>
      </div>
    </div>
  );
}
