"use client";

import { useEffect, useRef, useState } from "react";
import { detectPalmFeatures } from "@/lib/palm-detection";

interface PalmDetectorProps {
  imageData: string;
  onDetectionComplete: (data: {
    fingertips: Array<{ x: number; y: number }>;
  }) => void;
}

export function PalmDetector({ imageData, onDetectionComplete }: PalmDetectorProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detectPalm = async () => {
      if (!imageRef.current || !imageData) return;

      setIsDetecting(true);
      setError(null);

      try {
        // Wait for image to load
        await new Promise((resolve) => {
          if (imageRef.current?.complete) {
            resolve(null);
          } else {
            imageRef.current!.onload = () => resolve(null);
          }
        });

        const detected = await detectPalmFeatures(imageRef.current);
        if (detected.fingertips.length > 0) {
          onDetectionComplete({
            fingertips: detected.fingertips.map((t) => ({ x: t.x * 100, y: t.y * 100 })),
          });
        } else {
          setError("No hand detected in the image. Please try again with a clearer photo.");
        }
      } catch (err) {
        console.error("Palm detection error:", err);
        setError("Failed to detect palm. Please try again.");
      } finally {
        setIsDetecting(false);
      }
    };

    detectPalm();
  }, [imageData, onDetectionComplete]);

  return (
    <div className="hidden">
      <img
        ref={imageRef}
        src={imageData}
        alt="Palm for detection"
        crossOrigin="anonymous"
      />
      {isDetecting && <p>Detecting palm features...</p>}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
