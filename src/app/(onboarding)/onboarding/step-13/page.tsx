"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { fadeUp } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { Button } from "@/components/ui/button";
import { PalmAnalysis } from "@/components/onboarding/PalmAnalysis";
import { detectPalmFeatures as detectPalmFeaturesFromImage } from "@/lib/palm-detection";
import { useRouter } from "next/navigation";
import Image from "next/image";

type PageState = "intro" | "camera" | "preview" | "analysis";

const fakeEmails = [
  { name: "Brian", email: "Brian***@aol.com" },
  { name: "Kevin", email: "Kevin***@protonmail.com" },
  { name: "Alice", email: "Alice***@zoho.com" },
  { name: "Sarah", email: "Sarah***@gmail.com" },
  { name: "Emily", email: "Emily***@yahoo.com" },
  { name: "Emma", email: "Emma***@yahoo.com" },
];

export default function Step13Page() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("intro");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isPalmValid, setIsPalmValid] = useState<boolean | null>(null);
  const [isValidatingPalm, setIsValidatingPalm] = useState(false);
  const [currentEmailIndex, setCurrentEmailIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const validatePalmImage = async (imageData: string): Promise<boolean> => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imageData;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
    });

    const detected = await detectPalmFeaturesFromImage(img);
    const fingertipCount = detected?.fingertips?.length || 0;
    return fingertipCount >= 3;
  };

  // Rotate emails
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentEmailIndex((prev) => (prev + 1) % fakeEmails.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Start camera when entering camera state
  useEffect(() => {
    if (pageState === "camera") {
      const startCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: 640, height: 480 },
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setHasCamera(true);
          }
        } catch (err) {
          console.error("Camera error:", err);
          setCameraError("Camera access denied. Please use upload instead.");
        }
      };
      startCamera();
    }

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [pageState]);

  const handleTakePhoto = () => {
    setScanError(null);
    setIsPalmValid(null);
    setPageState("camera");
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      setCapturedImage(imageData);
      // Save to localStorage for step-15
      localStorage.setItem("palmcosmic_palm_image", imageData);
      setScanError(null);
      setIsPalmValid(null);
      setPageState("preview");
    };
    reader.readAsDataURL(file);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg", 0.9);
    
    // Stop camera immediately after capture
    if (video.srcObject) {
      const tracks = (video.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      video.srcObject = null;
    }
    
    setCapturedImage(imageData);
    // Save to localStorage for step-15
    localStorage.setItem("palmcosmic_palm_image", imageData);
    setScanError(null);
    setIsPalmValid(null);
    setPageState("preview");
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setScanError(null);
    setIsPalmValid(null);
    setPageState("camera");
  };

  const handleProceed = () => {
    if (isPalmValid === false) {
      return;
    }
    setPageState("analysis");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pageState !== "preview" || !capturedImage) return;

    let cancelled = false;

    (async () => {
      try {
        setIsValidatingPalm(true);
        const ok = await validatePalmImage(capturedImage);
        if (cancelled) return;

        setIsPalmValid(ok);
        if (!ok) {
          setScanError("No palm detected. Please upload a clear photo of your left palm.");
        } else {
          setScanError(null);
        }
      } catch {
        if (cancelled) return;
        setIsPalmValid(false);
        setScanError("Could not analyze the photo. Please try again with better lighting.");
      } finally {
        if (!cancelled) setIsValidatingPalm(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageState, capturedImage]);

  const handleCameraBack = () => {
    // Stop camera and go back to intro
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
    setPageState("intro");
  };

  const handleAnalysisComplete = () => {
    router.push("/onboarding/step-14");
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen bg-background"
    >
      {/* Intro State */}
      {pageState === "intro" && (
        <>
          <OnboardingHeader showBack currentStep={13} totalSteps={14} />
          <ProgressBar currentStep={13} totalSteps={14} />

          <div className="flex-1 flex flex-col items-center justify-between px-6 py-8">
            <div className="flex flex-col items-center">
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl md:text-2xl font-bold text-center mb-8"
              >
                Take a photo of your left palm
              </motion.h1>

              {/* Palm image with animated lines */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="w-[240px] h-[240px] rounded-2xl overflow-hidden bg-black/20">
                  <video
                    src="/palmscanner.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full"
                  />
                </div>
              </motion.div>
            </div>

            <div className="flex flex-col items-center gap-4 w-full max-w-sm">
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-muted-foreground text-center text-xs"
              >
                These readings are for entertainment purposes only and should not be taken as 100% accurate
              </motion.p>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-muted-foreground text-center text-xs"
              >
                Privacy is a priority for us. We only process non-identifiable data to ensure anonymity
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex flex-col items-center gap-1"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                    {fakeEmails[currentEmailIndex].name.charAt(0)}
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentEmailIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className="text-primary text-sm"
                    >
                      {fakeEmails[currentEmailIndex].email}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <span className="text-muted-foreground text-xs">just got predictions</span>
              </motion.div>
            </div>
          </div>

          <div className="p-6 space-y-3">
            <Button
              onClick={handleTakePhoto}
              className="w-full h-14 text-lg font-semibold"
              size="lg"
            >
              Take a photo
            </Button>
            <button
              onClick={handleUploadClick}
              className="w-full text-primary text-sm font-medium hover:underline"
            >
              Upload palm photo
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </>
      )}

      {/* Camera State */}
      {pageState === "camera" && (
        <div className="flex-1 flex flex-col">
          <div className="relative flex-1 bg-black">
            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <p className="text-white text-center text-sm">{cameraError}</p>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            )}

            {/* Hand outline overlay using palmoutline.png */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Image
                src="/palmoutline.png"
                alt="Palm outline"
                width={380}
                height={470}
                className="object-contain opacity-70"
                style={{ transform: "scaleX(-1) scale(1.15)" }}
              />
            </div>

            {/* Back button */}
            <button
              onClick={handleCameraBack}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/30 flex items-center justify-center"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>

            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="bg-background p-6 flex flex-col items-center gap-4">
            <p className="text-muted-foreground text-center text-sm">
              Place left palm inside outline and take a photo
            </p>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={capturePhoto}
              disabled={!hasCamera}
              className="w-16 h-16 rounded-full bg-primary border-4 border-primary/30 flex items-center justify-center disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-full bg-primary" />
            </motion.button>
          </div>
        </div>
      )}

      {/* Preview State - Show captured image with options */}
      {pageState === "preview" && capturedImage && (
        <div className="flex-1 flex flex-col">
          <OnboardingHeader showBack currentStep={13} totalSteps={14} onBack={handleRetake} />
          <ProgressBar currentStep={13} totalSteps={14} />

          <div className="flex-1 flex flex-col items-center px-6 pt-6 pb-2">
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-bold text-center mb-6"
            >
              Review your palm photo
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-sm h-[52vh] rounded-2xl overflow-hidden border border-border mb-4"
            >
              <img
                src={capturedImage}
                alt="Captured palm"
                className="w-full h-full object-cover"
              />
            </motion.div>

            {scanError && (
              <p className="text-red-400 text-sm text-center mb-2">{scanError}</p>
            )}

            {isValidatingPalm && (
              <p className="text-muted-foreground text-center text-sm mb-2">Checking photo...</p>
            )}

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-muted-foreground text-center text-sm mb-6"
            >
              Make sure your palm is clearly visible with good lighting
            </motion.p>
          </div>

          <div className="p-6 space-y-3">
            <Button
              onClick={handleProceed}
              disabled={isValidatingPalm || isPalmValid === false}
              className="w-full h-14 text-lg font-semibold"
              size="lg"
            >
              Proceed
            </Button>
            <button
              onClick={handleRetake}
              className="w-full text-primary text-sm font-medium hover:underline"
            >
              Capture again
            </button>
          </div>
        </div>
      )}

      {/* Analysis State */}
      {pageState === "analysis" && capturedImage && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
          <PalmAnalysis 
            imageData={capturedImage} 
            onComplete={handleAnalysisComplete} 
          />
        </div>
      )}
    </motion.div>
  );
}
