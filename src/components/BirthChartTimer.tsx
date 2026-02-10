"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface BirthChartTimerProps {
  startedAt: string | null;
  isActive: boolean;
  className?: string;
  onExpire?: () => void;
}

export function BirthChartTimer({ startedAt, isActive, className = "", onExpire }: BirthChartTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!startedAt || !isActive) {
      setTimeLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const startTime = new Date(startedAt).getTime();
      const endTime = startTime + 24 * 60 * 60 * 1000; // 24 hours
      const now = Date.now();
      const diff = endTime - now;

      if (diff <= 0) {
        if (!isExpired) {
          setIsExpired(true);
          setTimeLeft(null);
          onExpire?.();
        }
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds });
      setIsExpired(false);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [startedAt, isActive, isExpired, onExpire]);

  if (!isActive || !startedAt) {
    return null;
  }

  if (isExpired) {
    return (
      <div className={`flex items-center gap-1.5 text-green-400 text-xs ${className}`}>
        <Clock className="w-3 h-3" />
        <span>Your Report is Ready!</span>
      </div>
    );
  }

  if (!timeLeft) {
    return null;
  }

  const formatTime = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Clock className="w-3 h-3 text-amber-400" />
      <span className="text-amber-400 text-xs font-medium">
        {formatTime(timeLeft.hours)}:{formatTime(timeLeft.minutes)}:{formatTime(timeLeft.seconds)}
      </span>
    </div>
  );
}
