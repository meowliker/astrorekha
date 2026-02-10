"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface PalmCaptureProps {
  onCapture: (imageData: string) => void;
  onUpload: (imageData: string) => void;
}

export function PalmCapture({ onCapture, onUpload }: PalmCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
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

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg", 0.9);
    onCapture(imageData);
  }, [onCapture]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      onUpload(imageData);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-full max-w-sm aspect-[3/4] bg-black/50 rounded-lg overflow-hidden">
        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <p className="text-muted-foreground text-center text-sm">{cameraError}</p>
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

        {/* Hand outline overlay */}
        <svg
          viewBox="0 0 200 280"
          className="absolute inset-0 w-full h-full pointer-events-none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Palm outline */}
          <path
            d="M100 260 
               C60 260 40 220 40 180
               L40 160
               C40 150 35 130 35 120
               L35 80
               C35 70 40 65 45 65
               C50 65 55 70 55 80
               L55 110
               L55 60
               C55 50 60 45 65 45
               C70 45 75 50 75 60
               L75 100
               L75 45
               C75 35 80 30 85 30
               C90 30 95 35 95 45
               L95 95
               L95 40
               C95 30 100 25 105 25
               C110 25 115 30 115 40
               L115 100
               L115 55
               C115 45 120 40 125 40
               C130 40 135 45 135 55
               L135 120
               C135 130 140 150 140 160
               L140 180
               C140 220 120 260 100 260
               Z"
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>

        {/* Back button overlay */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/30 flex items-center justify-center"
          onClick={() => window.history.back()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </motion.button>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      <p className="text-muted-foreground text-center text-sm mt-4 mb-6">
        Place left palm inside outline and take a photo
      </p>

      {/* Capture button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={capturePhoto}
        disabled={!hasCamera}
        className="w-16 h-16 rounded-full bg-primary border-4 border-primary/30 flex items-center justify-center disabled:opacity-50"
      >
        <div className="w-12 h-12 rounded-full bg-primary" />
      </motion.button>

      {/* Upload option */}
      <button
        onClick={handleUploadClick}
        className="mt-4 text-primary text-sm font-medium hover:underline"
      >
        Upload palm photo
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
