"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function WelcomeBPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Route protection: Check user status and redirect accordingly
  useEffect(() => {
    // Mark user as Flow B (bundle flow)
    localStorage.setItem("palmcosmic_onboarding_flow", "flow-b");
    
    const hasCompletedPayment = localStorage.getItem("palmcosmic_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("palmcosmic_registration_completed") === "true";
    
    if (hasCompletedRegistration) {
      // User has completed registration - redirect to app
      router.replace("/home");
      return;
    } else if (hasCompletedPayment) {
      // User has paid but not registered - redirect to bundle upsell page
      router.replace("/onboarding/bundle-upsell");
      return;
    }
    // New user - allow access to welcome page
  }, [router]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Star properties
    interface Star {
      x: number;
      y: number;
      size: number;
      opacity: number;
      twinkleSpeed: number;
      twinkleOffset: number;
    }

    interface Constellation {
      stars: { x: number; y: number }[];
      connections: [number, number][];
      rotation: number;
      rotationSpeed: number;
      centerX: number;
      centerY: number;
    }

    // Create stars
    const stars: Star[] = [];
    const starCount = 150;

    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.01,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }

    // Create constellations
    const constellations: Constellation[] = [
      // Constellation 1 - Top right area
      {
        stars: [
          { x: 0.7, y: 0.15 },
          { x: 0.75, y: 0.2 },
          { x: 0.8, y: 0.18 },
          { x: 0.85, y: 0.25 },
          { x: 0.78, y: 0.28 },
        ],
        connections: [[0, 1], [1, 2], [2, 3], [1, 4]],
        rotation: 0,
        rotationSpeed: 0.0002,
        centerX: 0.77,
        centerY: 0.21,
      },
      // Constellation 2 - Bottom left area
      {
        stars: [
          { x: 0.15, y: 0.7 },
          { x: 0.2, y: 0.75 },
          { x: 0.25, y: 0.72 },
          { x: 0.18, y: 0.8 },
          { x: 0.28, y: 0.78 },
          { x: 0.22, y: 0.85 },
        ],
        connections: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 5]],
        rotation: 0,
        rotationSpeed: 0.00015,
        centerX: 0.21,
        centerY: 0.77,
      },
      // Constellation 3 - Top left
      {
        stars: [
          { x: 0.1, y: 0.2 },
          { x: 0.15, y: 0.15 },
          { x: 0.2, y: 0.22 },
          { x: 0.12, y: 0.28 },
        ],
        connections: [[0, 1], [1, 2], [0, 3]],
        rotation: 0,
        rotationSpeed: -0.00018,
        centerX: 0.14,
        centerY: 0.21,
      },
    ];

    let animationId: number;
    let time = 0;

    const animate = () => {
      ctx.fillStyle = "#0A0E1A";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      time += 1;

      // Draw stars with twinkling
      stars.forEach((star) => {
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle})`;
        ctx.fill();
      });

      // Draw and rotate constellations
      constellations.forEach((constellation) => {
        constellation.rotation += constellation.rotationSpeed;

        const centerX = constellation.centerX * canvas.width;
        const centerY = constellation.centerY * canvas.height;

        // Calculate rotated star positions
        const rotatedStars = constellation.stars.map((star) => {
          const x = star.x * canvas.width - centerX;
          const y = star.y * canvas.height - centerY;
          const cos = Math.cos(constellation.rotation);
          const sin = Math.sin(constellation.rotation);
          return {
            x: x * cos - y * sin + centerX,
            y: x * sin + y * cos + centerY,
          };
        });

        // Draw connections
        ctx.strokeStyle = "rgba(239, 68, 68, 0.3)"; // primary red with low opacity
        ctx.lineWidth = 1;
        constellation.connections.forEach(([from, to]) => {
          ctx.beginPath();
          ctx.moveTo(rotatedStars[from].x, rotatedStars[from].y);
          ctx.lineTo(rotatedStars[to].x, rotatedStars[to].y);
          ctx.stroke();
        });

        // Draw constellation stars (brighter)
        rotatedStars.forEach((star) => {
          // Glow effect
          const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, 8);
          gradient.addColorStop(0, "rgba(239, 68, 68, 0.8)");
          gradient.addColorStop(0.5, "rgba(239, 68, 68, 0.2)");
          gradient.addColorStop(1, "rgba(239, 68, 68, 0)");
          ctx.beginPath();
          ctx.arc(star.x, star.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();

          // Star center
          ctx.beginPath();
          ctx.arc(star.x, star.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fill();
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center relative overflow-hidden">
      {/* Animated starry background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0A0E1A]/80 pointer-events-none" />

      {/* Content Container - matching other pages */}
      <div className="relative z-10 w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Logo and App Name */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col items-center mb-16"
        >
          {/* Logo with glow effect */}
          <div className="relative mb-6">
            <div className="absolute inset-0 blur-2xl bg-primary/30 rounded-full scale-150" />
            <div className="relative w-28 h-28 rounded-3xl overflow-hidden border-2 border-primary/30 shadow-2xl shadow-primary/20">
              <Image
                src="/logo.png"
                alt="PalmCosmic"
                width={112}
                height={112}
                className="object-cover w-full h-full"
              />
            </div>
          </div>

          {/* App Name */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-4xl font-bold text-white tracking-wide"
          >
            PalmCosmic
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-white/60 text-sm mt-2 text-center"
          >
            Discover your cosmic destiny
          </motion.p>
        </motion.div>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="w-full space-y-4"
        >
          {/* Begin Journey Button */}
          <button
            onClick={() => router.push("/onboarding")}
            className="w-full py-4 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 text-white font-semibold text-lg rounded-2xl transition-all duration-300 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            Begin Your Journey
          </button>

          {/* Login Link */}
          <div className="text-center pt-4">
            <p className="text-white/50 text-sm">
              Already have an account?{" "}
              <button
                onClick={() => router.push("/login")}
                className="text-primary hover:text-primary/80 font-medium transition-colors underline underline-offset-2"
              >
                Login
              </button>
            </p>
          </div>
        </motion.div>

        {/* Bottom decorative element */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="pb-8 flex items-center justify-center gap-2 text-white/30 text-xs"
        >
          <span>✦</span>
          <span>Your stars await</span>
          <span>✦</span>
        </motion.div>
        </div>
      </div>
    </div>
  );
}
