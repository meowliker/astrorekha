"use client";

import { motion } from "framer-motion";

interface ZodiacWheelProps {
  isAnimating?: boolean;
  size?: number;
}

export function ZodiacWheel({ isAnimating = true, size = 200 }: ZodiacWheelProps) {
  const zodiacSymbols = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
  
  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 rounded-full bg-gradient-to-b from-cyan-500/20 via-transparent to-transparent blur-3xl" />
      
      <motion.div
        className="relative rounded-full border-2 border-foreground/20 flex items-center justify-center"
        style={{ width: size, height: size }}
        animate={isAnimating ? { rotate: 360 } : {}}
        transition={isAnimating ? { duration: 30, repeat: Infinity, ease: "linear" } : {}}
      >
        <div 
          className="absolute rounded-full border border-foreground/10"
          style={{ width: size * 0.85, height: size * 0.85 }}
        />
        <div 
          className="absolute rounded-full border border-foreground/10"
          style={{ width: size * 0.6, height: size * 0.6 }}
        />
        
        <div 
          className="absolute rounded-full bg-gradient-to-br from-background via-background to-card"
          style={{ width: size * 0.35, height: size * 0.35 }}
        />

        {zodiacSymbols.map((symbol, index) => {
          const angle = (index * 30 - 90) * (Math.PI / 180);
          const radius = size * 0.38;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          
          return (
            <motion.div
              key={symbol}
              className="absolute text-xs text-foreground/60"
              style={{
                transform: `translate(${x}px, ${y}px)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.1 }}
            >
              {symbol}
            </motion.div>
          );
        })}

        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i * 60 - 90) * (Math.PI / 180);
          const innerRadius = size * 0.18;
          const outerRadius = size * 0.28;
          
          return (
            <motion.div
              key={`planet-${i}`}
              className="absolute w-2 h-2 rounded-full bg-foreground/40"
              style={{
                left: "50%",
                top: "50%",
                marginLeft: -4,
                marginTop: -4,
                transform: `translate(${Math.cos(angle) * (innerRadius + (outerRadius - innerRadius) * (i % 2))}px, ${Math.sin(angle) * (innerRadius + (outerRadius - innerRadius) * (i % 2))}px)`,
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + i * 0.15 }}
            />
          );
        })}

        <svg
          className="absolute inset-0"
          viewBox={`0 0 ${size} ${size}`}
          style={{ width: size, height: size }}
        >
          {[0, 1, 2].map((i) => {
            const startAngle = (i * 120 + 30) * (Math.PI / 180);
            const endAngle = ((i + 1) * 120 + 30) * (Math.PI / 180);
            const midAngle = ((i * 120 + 60 + 30)) * (Math.PI / 180);
            const radius = size * 0.22;
            const center = size / 2;
            
            return (
              <motion.path
                key={`line-${i}`}
                d={`M ${center + Math.cos(startAngle) * radius} ${center + Math.sin(startAngle) * radius} 
                    L ${center + Math.cos(endAngle) * radius} ${center + Math.sin(endAngle) * radius}`}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1 + i * 0.2, duration: 0.5 }}
              />
            );
          })}
        </svg>
      </motion.div>
    </div>
  );
}
