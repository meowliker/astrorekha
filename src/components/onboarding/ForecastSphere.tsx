"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface ForecastSphereProps {
  targetPercentage?: number;
  startPercentage?: number;
  duration?: number;
  size?: number;
}

export function ForecastSphere({ 
  targetPercentage = 34,
  startPercentage = 0,
  duration = 3,
  size = 180 
}: ForecastSphereProps) {
  const [percentage, setPercentage] = useState(startPercentage);

  useEffect(() => {
    const startTime = Date.now();
    const range = targetPercentage - startPercentage;
    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setPercentage(Math.round(startPercentage + eased * range));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [targetPercentage, startPercentage, duration]);

  const waterHeight = (percentage / 100) * size;

  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 rounded-full bg-gradient-to-b from-cyan-400/10 via-teal-500/5 to-transparent blur-2xl" />
      
      <div 
        className="relative rounded-full overflow-hidden border-2 border-foreground/20"
        style={{ width: size, height: size }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-slate-800/50 via-slate-900/80 to-slate-950" />
        
        <motion.div
          className="absolute bottom-0 left-0 right-0"
          initial={{ height: (startPercentage / 100) * size }}
          animate={{ height: waterHeight }}
          transition={{ duration: duration, ease: "easeOut" }}
        >
          <div 
            className="absolute inset-0 bg-gradient-to-t from-cyan-500/60 via-teal-400/40 to-cyan-300/20"
          />
          
          <motion.div
            className="absolute top-0 left-0 right-0 h-4"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 100%)",
              borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
            }}
            animate={{
              scaleX: [1, 1.02, 1],
              y: [-2, 0, -2],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>

        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className="text-4xl font-bold text-white drop-shadow-lg"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            {percentage}%
          </motion.span>
        </div>

        <div 
          className="absolute top-2 right-4 w-2 h-2 rounded-full bg-white/30 blur-sm"
        />
      </div>
    </div>
  );
}
