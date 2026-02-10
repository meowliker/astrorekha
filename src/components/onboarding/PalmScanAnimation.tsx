"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";

interface PalmScanAnimationProps {
  size?: number;
}

export function PalmScanAnimation({ size = 200 }: PalmScanAnimationProps) {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const startAnimation = () => {
      setVisibleLines(0);
      
      const drawLine = (lineNumber: number) => {
        setTimeout(() => {
          setVisibleLines(lineNumber);
          if (lineNumber < 4) {
            drawLine(lineNumber + 1);
          } else {
            // After all lines are drawn, wait 2.5 seconds then restart
            setTimeout(() => {
              startAnimation();
            }, 2500);
          }
        }, lineNumber === 0 ? 500 : 1500);
      };
      
      drawLine(1);
    };
    
    startAnimation();
  }, []);

  return (
    <div className="relative" style={{ width: size, height: size * 1.15 }}>
      {/* Corner brackets */}
      <div className="absolute inset-2">
        <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-foreground/30 rounded-tl-sm" />
        <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-foreground/30 rounded-tr-sm" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 border-foreground/30 rounded-bl-sm" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 border-foreground/30 rounded-br-sm" />
      </div>

      {/* Palm image */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Image
          src="/palm.png"
          alt="Palm"
          width={size - 32}
          height={size * 1.15 - 32}
          className="object-contain"
        />
      </div>

      {/* Animated palm lines and scanning line overlay */}
      <svg
        viewBox="0 0 100 115"
        className="absolute inset-0 w-full h-full p-4"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Scanning line */}
        <motion.line
          x1="5"
          y1="50"
          x2="95"
          y2="50"
          stroke="rgba(79, 209, 197, 0.7)"
          strokeWidth="2"
          initial={{ y1: 10, y2: 10 }}
          animate={{ y1: [10, 105, 10], y2: [10, 105, 10] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Red line - Heart line (1st) */}
        {visibleLines >= 1 && (
          <motion.path
            d="M78 48 C55 38 30 42 22 52"
            stroke="#F27067"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="miter"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        )}

        {/* Green/Teal line - Life line (2nd) */}
        {visibleLines >= 2 && (
          <motion.path
            d="M38 38 C32 55 30 75 35 95"
            stroke="#4ECDC4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="miter"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        )}

        {/* Yellow line - Head line (3rd) */}
        {visibleLines >= 3 && (
          <motion.path
            d="M25 60 C40 55 60 55 75 62"
            stroke="#F5C542"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="miter"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        )}

        {/* Pink line - Fate line (4th) */}
        {visibleLines >= 4 && (
          <motion.path
            d="M52 95 C51 78 50 62 48 48"
            stroke="#E88BE8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="miter"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        )}
      </svg>
    </div>
  );
}
