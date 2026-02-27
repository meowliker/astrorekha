"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Plus, Trash2, Loader2, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PricingConfig, BundlePlan, UpsellPlan, ReportPlan, CoinPackage } from "@/lib/pricing";

export default function AdminPricingPage() {
  const router = useRouter();
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"bundles" | "upsells" | "reports" | "coins">("bundles");

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const response = await fetch("/api/admin/pricing");
      const data = await response.json();
      if (data.success) {
        setPricing(data.pricing);
      }
    } catch (err) {
      setError("Failed to load pricing");
    } finally {
      setIsLoading(false);
    }
  };

  const savePricing = async () => {
    if (!pricing) return;
    
    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const response = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing }),
      });
      const data = await response.json();
      
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(data.error || "Failed to save");
      }
    } catch (err) {
      setError("Failed to save pricing");
    } finally {
      setIsSaving(false);
    }
  };

  const updateBundle = (index: number, field: keyof BundlePlan, value: any) => {
    if (!pricing) return;
    const newBundles = [...pricing.bundles];
    (newBundles[index] as any)[field] = value;
    setPricing({ ...pricing, bundles: newBundles });
  };

  const updateUpsell = (index: number, field: keyof UpsellPlan, value: any) => {
    if (!pricing) return;
    const newUpsells = [...pricing.upsells];
    (newUpsells[index] as any)[field] = value;
    setPricing({ ...pricing, upsells: newUpsells });
  };

  const updateReport = (index: number, field: keyof ReportPlan, value: any) => {
    if (!pricing) return;
    const newReports = [...pricing.reports];
    (newReports[index] as any)[field] = value;
    setPricing({ ...pricing, reports: newReports });
  };

  const updateCoinPackage = (index: number, field: keyof CoinPackage, value: any) => {
    if (!pricing) return;
    const newPackages = [...pricing.coinPackages];
    (newPackages[index] as any)[field] = value;
    setPricing({ ...pricing, coinPackages: newPackages });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pricing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-red-500">Failed to load pricing configuration</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold">Pricing Management</h1>
          </div>
          <Button 
            onClick={savePricing} 
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saveSuccess ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-4xl mx-auto px-4 py-2">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-500 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex gap-2 border-b border-border pb-4">
          {[
            { key: "bundles", label: "Bundle Plans" },
            { key: "upsells", label: "Upsells" },
            { key: "reports", label: "Reports" },
            { key: "coins", label: "Coin Packages" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        {/* Bundle Plans */}
        {activeTab === "bundles" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Bundle Plans</h2>
            {pricing.bundles.map((bundle, index) => (
              <motion.div
                key={bundle.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{bundle.name}</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={bundle.active}
                      onChange={(e) => updateBundle(index, "active", e.target.checked)}
                      className="rounded"
                    />
                    Active
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Plan Name</label>
                    <input
                      type="text"
                      value={bundle.name}
                      onChange={(e) => updateBundle(index, "name", e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Plan ID</label>
                    <input
                      type="text"
                      value={bundle.id}
                      disabled
                      className="w-full mt-1 px-3 py-2 bg-muted border border-border rounded-lg text-muted-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Price (₹)</label>
                    <input
                      type="number"
                      value={bundle.price}
                      onChange={(e) => updateBundle(index, "price", parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Original Price (₹)</label>
                    <input
                      type="number"
                      value={bundle.originalPrice}
                      onChange={(e) => updateBundle(index, "originalPrice", parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Discount Text</label>
                    <input
                      type="text"
                      value={bundle.discount}
                      onChange={(e) => updateBundle(index, "discount", e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">Description</label>
                  <input
                    type="text"
                    value={bundle.description}
                    onChange={(e) => updateBundle(index, "description", e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  />
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={bundle.popular || false}
                      onChange={(e) => updateBundle(index, "popular", e.target.checked)}
                      className="rounded"
                    />
                    Popular Badge
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={bundle.limitedOffer || false}
                      onChange={(e) => updateBundle(index, "limitedOffer", e.target.checked)}
                      className="rounded"
                    />
                    Limited Offer Badge
                  </label>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Upsells */}
        {activeTab === "upsells" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Upsell Offers</h2>
            {pricing.upsells.map((upsell, index) => (
              <motion.div
                key={upsell.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{upsell.name}</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={upsell.active}
                      onChange={(e) => updateUpsell(index, "active", e.target.checked)}
                      className="rounded"
                    />
                    Active
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Name</label>
                    <input
                      type="text"
                      value={upsell.name}
                      onChange={(e) => updateUpsell(index, "name", e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Feature Key</label>
                    <input
                      type="text"
                      value={upsell.feature}
                      onChange={(e) => updateUpsell(index, "feature", e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Price (₹)</label>
                    <input
                      type="number"
                      value={upsell.price}
                      onChange={(e) => updateUpsell(index, "price", parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Original Price (₹)</label>
                    <input
                      type="number"
                      value={upsell.originalPrice}
                      onChange={(e) => updateUpsell(index, "originalPrice", parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Discount Text</label>
                    <input
                      type="text"
                      value={upsell.discount}
                      onChange={(e) => updateUpsell(index, "discount", e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">Description</label>
                  <input
                    type="text"
                    value={upsell.description}
                    onChange={(e) => updateUpsell(index, "description", e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Reports */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Individual Reports</h2>
            {pricing.reports.map((report, index) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{report.name}</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={report.active}
                      onChange={(e) => updateReport(index, "active", e.target.checked)}
                      className="rounded"
                    />
                    Active
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Name</label>
                    <input
                      type="text"
                      value={report.name}
                      onChange={(e) => updateReport(index, "name", e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Feature Key</label>
                    <input
                      type="text"
                      value={report.feature}
                      onChange={(e) => updateReport(index, "feature", e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Price (₹)</label>
                    <input
                      type="number"
                      value={report.price}
                      onChange={(e) => updateReport(index, "price", parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Original Price (₹)</label>
                    <input
                      type="number"
                      value={report.originalPrice}
                      onChange={(e) => updateReport(index, "originalPrice", parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Coin Packages */}
        {activeTab === "coins" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Coin Packages</h2>
            {pricing.coinPackages.map((pkg, index) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{pkg.coins} Coins</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pkg.active}
                      onChange={(e) => updateCoinPackage(index, "active", e.target.checked)}
                      className="rounded"
                    />
                    Active
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Coins</label>
                    <input
                      type="number"
                      value={pkg.coins}
                      onChange={(e) => updateCoinPackage(index, "coins", parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Price (₹)</label>
                    <input
                      type="number"
                      value={pkg.price}
                      onChange={(e) => updateCoinPackage(index, "price", parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Original Price (₹)</label>
                    <input
                      type="number"
                      value={pkg.originalPrice}
                      onChange={(e) => updateCoinPackage(index, "originalPrice", parseInt(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
