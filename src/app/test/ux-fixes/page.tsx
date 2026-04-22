"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function getPasswordRuleState(password: string) {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
}

export default function UxFixesTestPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showSoulmateLoading, setShowSoulmateLoading] = useState(true);
  const rules = useMemo(() => getPasswordRuleState(password), [password]);
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">UX Fixes Test Screen</h1>
          <p className="mt-2 text-sm text-white/70">
            Use this page to preview loading, password validation, and paywall route behavior without full onboarding.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <h2 className="text-lg font-semibold text-white">1) Paywall Navigation Test</h2>
          <p className="mt-1 text-sm text-white/70">
            This now skips legacy spinner and opens paywall directly.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                localStorage.setItem("astrorekha_onboarding_flow", "flow-a");
                localStorage.setItem("astrorekha_layout_variant", "A");
                window.location.href = "/onboarding/step-15";
              }}
            >
              Test Flow A (step-15)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                localStorage.setItem("astrorekha_onboarding_flow", "flow-b");
                localStorage.setItem("astrorekha_layout_variant", "B");
                window.location.href = "/onboarding/step-15";
              }}
            >
              Test Flow B (step-15)
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <h2 className="text-lg font-semibold text-white">2) Password Validation Preview</h2>
          <div className="mt-4 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create password"
              className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-white placeholder:text-white/45"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-white placeholder:text-white/45"
            />
            <div className="space-y-1 text-xs text-white/70">
              <p className={rules.minLength ? "text-emerald-400" : ""}>{rules.minLength ? "✓" : "•"} Minimum 8 characters</p>
              <p className={rules.uppercase ? "text-emerald-400" : ""}>{rules.uppercase ? "✓" : "•"} One uppercase letter</p>
              <p className={rules.lowercase ? "text-emerald-400" : ""}>{rules.lowercase ? "✓" : "•"} One lowercase letter</p>
              <p className={rules.number ? "text-emerald-400" : ""}>{rules.number ? "✓" : "•"} One number</p>
              <p className={rules.special ? "text-emerald-400" : ""}>{rules.special ? "✓" : "•"} One special character</p>
              {mismatch ? <p className="text-red-400">✗ Passwords do not match</p> : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">3) Soulmate Loading Preview</h2>
            <Button variant="outline" onClick={() => setShowSoulmateLoading((v) => !v)}>
              Toggle
            </Button>
          </div>

          {showSoulmateLoading ? (
            <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-6 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-base font-medium text-white">Finding your soulmate...</p>
              <p className="mt-2 text-sm text-white/75">
                Your portrait is being prepared. Please check back in some time.
              </p>
              <p className="mt-2 text-xs text-white/60">
                You can leave this screen and return later. We keep checking automatically.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-center text-emerald-200">
              Ready state preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
