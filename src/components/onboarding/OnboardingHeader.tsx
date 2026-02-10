"use client";

import { useState } from "react";
import { ArrowLeft, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { OnboardingSidebar } from "@/components/OnboardingSidebar";

interface OnboardingHeaderProps {
  showBack?: boolean;
  showMenu?: boolean;
  currentStep?: number;
  totalSteps?: number;
  onBack?: () => void;
}

export function OnboardingHeader({
  showBack = false,
  showMenu = false,
  currentStep,
  totalSteps,
  onBack,
}: OnboardingHeaderProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-4 relative">
        <div className="w-10">
          {showBack && (
            <button
              onClick={handleBack}
              className="p-2 -ml-2 text-foreground/70 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="PalmCosmic"
            width={28}
            height={28}
            className="rounded-lg"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <span className="font-semibold text-lg">PalmCosmic</span>
        </div>

        <div className="w-10 text-right">
          {showMenu && (
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 -mr-2 text-foreground/70 hover:text-foreground transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          {currentStep && totalSteps && (
            <span className="text-sm text-muted-foreground">
              {currentStep}/{totalSteps}
            </span>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <OnboardingSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
