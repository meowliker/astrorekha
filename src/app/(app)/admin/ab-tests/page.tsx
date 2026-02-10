"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  BarChart3, 
  Users, 
  TrendingUp, 
  DollarSign,
  Percent,
  RefreshCw,
  Play,
  Pause,
  Settings,
  ChevronRight,
  Eye,
  ShoppingCart,
  UserCheck,
  XCircle,
  RotateCcw,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ABTest {
  id: string;
  name: string;
  status: "active" | "paused" | "completed";
  variants: {
    A: { weight: number; page: string };
    B: { weight: number; page: string };
  };
  createdAt: string;
  updatedAt: string;
  quickStats?: {
    totalImpressions: number;
    totalConversions: number;
    variantAConversionRate: string;
    variantBConversionRate: string;
  };
}

interface TestStats {
  impressions: number;
  conversions: number;
  bounces: number;
  checkoutsStarted: number;
  totalRevenue: number;
  conversionRate: string;
  bounceRate: string;
  checkoutRate: string;
  checkoutToConversionRate: string;
  avgRevenuePerUser: string;
  avgRevenuePerImpression: string;
}

interface TestDetails {
  test: ABTest;
  stats: {
    A: TestStats;
    B: TestStats;
  };
  dailyBreakdown: Array<{
    date: string;
    A: { impressions: number; conversions: number; bounces: number; revenue: number };
    B: { impressions: number; conversions: number; bounces: number; revenue: number };
  }>;
  recentEvents: Array<any>;
}

export default function ABTestsPage() {
  const router = useRouter();
  const [tests, setTests] = useState<ABTest[]>([]);
  const [selectedTest, setSelectedTest] = useState<TestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingWeights, setEditingWeights] = useState(false);
  const [weightA, setWeightA] = useState(50);
  const [weightB, setWeightB] = useState(50);
  const [saving, setSaving] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Check admin session and fetch data (same pattern as revenue dashboard)
  useEffect(() => {
    const checkAdminAndFetch = async () => {
      // Check for admin session token
      const token = localStorage.getItem("admin_session_token");
      const expiry = localStorage.getItem("admin_session_expiry");
      
      if (!token || !expiry || new Date(expiry) < new Date()) {
        // No valid session, redirect to login
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }
      
      // Valid session, fetch tests
      fetchTests();
    };
    
    checkAdminAndFetch();
  }, [router]);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/ab-tests");
      const data = await response.json();
      setTests(data.tests || []);
    } catch (error) {
      console.error("Failed to fetch tests:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTestDetails = async (testId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/ab-tests?testId=${testId}`);
      const data = await response.json();
      setSelectedTest(data);
      setWeightA(data.test?.variants?.A?.weight || 50);
      setWeightB(data.test?.variants?.B?.weight || 50);
    } catch (error) {
      console.error("Failed to fetch test details:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateTestStatus = async (testId: string, status: string) => {
    try {
      await fetch("/api/admin/ab-tests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId, status }),
      });
      fetchTests();
      if (selectedTest?.test?.id === testId) {
        fetchTestDetails(testId);
      }
    } catch (error) {
      console.error("Failed to update test status:", error);
    }
  };

  const updateWeights = async () => {
    if (!selectedTest) return;
    
    if (weightA + weightB !== 100) {
      alert("Weights must sum to 100%");
      return;
    }

    try {
      setSaving(true);
      const testId = selectedTest.test?.id || "pricing-test-1";
      await fetch("/api/admin/ab-tests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId,
          variants: {
            A: { weight: weightA, page: "step-17" },
            B: { weight: weightB, page: "a-step-17" },
          },
        }),
      });
      setEditingWeights(false);
      fetchTestDetails(testId);
    } catch (error) {
      console.error("Failed to update weights:", error);
    } finally {
      setSaving(false);
    }
  };

  const createDefaultTest = async () => {
    try {
      await fetch("/api/admin/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: "pricing-test-1",
          name: "Pricing Page A/B Test",
          variants: {
            A: { weight: 50, page: "step-17" },
            B: { weight: 50, page: "a-step-17" },
          },
        }),
      });
      fetchTests();
    } catch (error) {
      console.error("Failed to create test:", error);
    }
  };

  const resetAnalytics = async () => {
    if (!selectedTest?.test?.id) return;
    
    try {
      setResetting(true);
      const response = await fetch("/api/admin/ab-tests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: selectedTest.test.id,
          resetAnalytics: true,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowResetModal(false);
        // Refresh the test details
        fetchTestDetails(selectedTest.test.id);
      } else {
        alert(data.error || "Failed to reset analytics");
      }
    } catch (error) {
      console.error("Failed to reset analytics:", error);
      alert("Failed to reset analytics");
    } finally {
      setResetting(false);
    }
  };

  const StatCard = ({ 
    title, 
    value, 
    subtitle, 
    icon: Icon, 
    color = "primary",
    comparison
  }: { 
    title: string; 
    value: string | number; 
    subtitle?: string; 
    icon: any;
    color?: string;
    comparison?: { value: string; better: boolean };
  }) => (
    <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon className={`w-4 h-4 text-${color}`} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      {comparison && (
        <p className={`text-xs mt-1 ${comparison.better ? "text-green-400" : "text-red-400"}`}>
          {comparison.better ? "↑" : "↓"} {comparison.value} vs other variant
        </p>
      )}
    </div>
  );

  if (selectedTest) {
    const { test, stats, dailyBreakdown } = selectedTest;
    
    // Default stats if not available
    const defaultStats: TestStats = {
      impressions: 0,
      conversions: 0,
      bounces: 0,
      checkoutsStarted: 0,
      totalRevenue: 0,
      conversionRate: "0.00",
      bounceRate: "0.00",
      checkoutRate: "0.00",
      checkoutToConversionRate: "0.00",
      avgRevenuePerUser: "0.00",
      avgRevenuePerImpression: "0.00",
    };
    
    const aStats = stats?.A || defaultStats;
    const bStats = stats?.B || defaultStats;

    // If test is undefined, show loading or error state
    if (!test) {
      return (
        <div className="min-h-screen bg-background p-6 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading test data...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedTest(null)}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{test.name || "A/B Test"}</h1>
                <p className="text-sm text-muted-foreground">
                  Created {test.createdAt ? new Date(test.createdAt).toLocaleDateString() : "N/A"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                test.status === "active" 
                  ? "bg-green-500/20 text-green-400" 
                  : test.status === "paused"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-gray-500/20 text-gray-400"
              }`}>
                {(test.status || "unknown").charAt(0).toUpperCase() + (test.status || "unknown").slice(1)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateTestStatus(test.id || "pricing-test-1", test.status === "active" ? "paused" : "active")}
              >
                {test.status === "active" ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {test.status === "active" ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchTestDetails(test.id || "pricing-test-1")}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResetModal(true)}
                className="text-red-400 border-red-400/50 hover:bg-red-500/10"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Analytics
              </Button>
            </div>
          </div>

          {/* Reset Analytics Modal */}
          {showResetModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Reset Analytics</h3>
                    <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                  </div>
                </div>
                
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                  <p className="text-sm text-red-300">
                    This will permanently delete:
                  </p>
                  <ul className="text-sm text-red-300/80 mt-2 space-y-1">
                    <li>• All impressions and conversion data</li>
                    <li>• All user variant assignments</li>
                    <li>• Daily performance history</li>
                    <li>• Revenue tracking for this test</li>
                  </ul>
                  <p className="text-sm text-red-300 mt-3">
                    New analytics will start fresh from this moment.
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowResetModal(false)}
                    disabled={resetting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    onClick={resetAnalytics}
                    disabled={resetting}
                  >
                    {resetting ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset All Data
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Traffic Split */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Traffic Split</h2>
              {!editingWeights ? (
                <Button variant="outline" size="sm" onClick={() => setEditingWeights(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Edit Weights
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingWeights(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={updateWeights} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </div>

            {editingWeights ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-sm text-muted-foreground mb-1 block">Variant A (Current)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={weightA}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setWeightA(val);
                        setWeightB(100 - val);
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm text-muted-foreground mb-1 block">Variant B (New Plans)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={weightB}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setWeightB(val);
                        setWeightA(100 - val);
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: {weightA + weightB}% (must equal 100%)
                </p>
              </div>
            ) : (
              <div className="flex gap-4">
                <div className="flex-1 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Variant A</span>
                    <span className="text-2xl font-bold text-blue-400">{test.variants?.A?.weight || 50}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Current pricing page (step-17)</p>
                  <p className="text-xs text-muted-foreground mt-1">1-Week ($1), 2-Week ($5.49), Yearly ($49.99)</p>
                </div>
                <div className="flex-1 bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Variant B</span>
                    <span className="text-2xl font-bold text-purple-400">{test.variants?.B?.weight || 50}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">New pricing page (a-step-17)</p>
                  <p className="text-xs text-muted-foreground mt-1">1-Week ($2.99), 4-Week ($7.99), 12-Week ($14.99)</p>
                </div>
              </div>
            )}
          </div>

          {/* Variant A Stats */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              Variant A - Current Plans
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Impressions"
                value={aStats.impressions.toLocaleString()}
                icon={Eye}
                color="blue-400"
              />
              <StatCard
                title="Conversions"
                value={aStats.conversions.toLocaleString()}
                subtitle={`${aStats.conversionRate}% rate`}
                icon={UserCheck}
                color="green-400"
                comparison={parseFloat(aStats.conversionRate) > parseFloat(bStats.conversionRate) 
                  ? { value: `${(parseFloat(aStats.conversionRate) - parseFloat(bStats.conversionRate)).toFixed(2)}%`, better: true }
                  : { value: `${(parseFloat(bStats.conversionRate) - parseFloat(aStats.conversionRate)).toFixed(2)}%`, better: false }
                }
              />
              <StatCard
                title="Bounce Rate"
                value={`${aStats.bounceRate}%`}
                icon={XCircle}
                color="red-400"
              />
              <StatCard
                title="Revenue"
                value={`$${aStats.totalRevenue.toFixed(2)}`}
                subtitle={`$${aStats.avgRevenuePerUser} per user`}
                icon={DollarSign}
                color="emerald-400"
              />
            </div>
          </div>

          {/* Variant B Stats */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              Variant B - New Plans
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Impressions"
                value={bStats.impressions.toLocaleString()}
                icon={Eye}
                color="purple-400"
              />
              <StatCard
                title="Conversions"
                value={bStats.conversions.toLocaleString()}
                subtitle={`${bStats.conversionRate}% rate`}
                icon={UserCheck}
                color="green-400"
                comparison={parseFloat(bStats.conversionRate) > parseFloat(aStats.conversionRate) 
                  ? { value: `${(parseFloat(bStats.conversionRate) - parseFloat(aStats.conversionRate)).toFixed(2)}%`, better: true }
                  : { value: `${(parseFloat(aStats.conversionRate) - parseFloat(bStats.conversionRate)).toFixed(2)}%`, better: false }
                }
              />
              <StatCard
                title="Bounce Rate"
                value={`${bStats.bounceRate}%`}
                icon={XCircle}
                color="red-400"
              />
              <StatCard
                title="Revenue"
                value={`$${bStats.totalRevenue.toFixed(2)}`}
                subtitle={`$${bStats.avgRevenuePerUser} per user`}
                icon={DollarSign}
                color="emerald-400"
              />
            </div>
          </div>

          {/* Comparison Table */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Side-by-Side Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Metric</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-blue-400">Variant A</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-purple-400">Variant B</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { metric: "Impressions", a: aStats.impressions, b: bStats.impressions, higherBetter: true },
                    { metric: "Conversions", a: aStats.conversions, b: bStats.conversions, higherBetter: true },
                    { metric: "Conversion Rate", a: `${aStats.conversionRate}%`, b: `${bStats.conversionRate}%`, higherBetter: true, compare: [parseFloat(aStats.conversionRate), parseFloat(bStats.conversionRate)] },
                    { metric: "Bounce Rate", a: `${aStats.bounceRate}%`, b: `${bStats.bounceRate}%`, higherBetter: false, compare: [parseFloat(aStats.bounceRate), parseFloat(bStats.bounceRate)] },
                    { metric: "Checkout Rate", a: `${aStats.checkoutRate}%`, b: `${bStats.checkoutRate}%`, higherBetter: true, compare: [parseFloat(aStats.checkoutRate), parseFloat(bStats.checkoutRate)] },
                    { metric: "Total Revenue", a: `$${aStats.totalRevenue.toFixed(2)}`, b: `$${bStats.totalRevenue.toFixed(2)}`, higherBetter: true, compare: [aStats.totalRevenue, bStats.totalRevenue] },
                    { metric: "Avg Revenue/User", a: `$${aStats.avgRevenuePerUser}`, b: `$${bStats.avgRevenuePerUser}`, higherBetter: true, compare: [parseFloat(aStats.avgRevenuePerUser), parseFloat(bStats.avgRevenuePerUser)] },
                  ].map((row) => {
                    let winner = "-";
                    if (row.compare) {
                      if (row.higherBetter) {
                        winner = row.compare[0] > row.compare[1] ? "A" : row.compare[1] > row.compare[0] ? "B" : "-";
                      } else {
                        winner = row.compare[0] < row.compare[1] ? "A" : row.compare[1] < row.compare[0] ? "B" : "-";
                      }
                    }
                    return (
                      <tr key={row.metric} className="border-b border-border/50">
                        <td className="py-3 px-4 text-sm">{row.metric}</td>
                        <td className={`py-3 px-4 text-sm text-center ${winner === "A" ? "text-green-400 font-semibold" : ""}`}>
                          {row.a}
                        </td>
                        <td className={`py-3 px-4 text-sm text-center ${winner === "B" ? "text-green-400 font-semibold" : ""}`}>
                          {row.b}
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          {winner !== "-" && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              winner === "A" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                            }`}>
                              {winner}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily Breakdown Chart (simplified) */}
          {dailyBreakdown.length > 0 && (
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Daily Performance (Last 30 Days)</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dailyBreakdown.slice(-14).map((day) => (
                  <div key={day.date} className="flex items-center gap-4 text-sm">
                    <span className="w-24 text-muted-foreground">{day.date}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-blue-400 w-16">A: {day.A.conversions}/{day.A.impressions}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500" 
                          style={{ width: `${day.A.impressions > 0 ? (day.A.conversions / day.A.impressions) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-purple-400 w-16">B: {day.B.conversions}/{day.B.impressions}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500" 
                          style={{ width: `${day.B.impressions > 0 ? (day.B.conversions / day.B.impressions) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/admin")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">A/B Tests</h1>
              <p className="text-sm text-muted-foreground">
                Manage and monitor your pricing experiments
              </p>
            </div>
          </div>
          <Button onClick={fetchTests} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tests.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">No A/B Tests Found</h2>
            <p className="text-muted-foreground mb-4">Create your first A/B test to start experimenting</p>
            <Button onClick={createDefaultTest}>
              Create Pricing Test
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {tests.map((test) => (
              <motion.div
                key={test.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fetchTestDetails(test.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${
                      test.status === "active" ? "bg-green-500" : 
                      test.status === "paused" ? "bg-yellow-500" : "bg-gray-500"
                    }`} />
                    <div>
                      <h3 className="font-semibold">{test.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {test.variants?.A?.weight || 50}% / {test.variants?.B?.weight || 50}% split
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {test.quickStats && (
                      <>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Impressions</p>
                          <p className="font-semibold">{test.quickStats.totalImpressions.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Conversions</p>
                          <p className="font-semibold">{test.quickStats.totalConversions.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">A vs B</p>
                          <p className="font-semibold">
                            <span className="text-blue-400">{test.quickStats.variantAConversionRate}%</span>
                            {" / "}
                            <span className="text-purple-400">{test.quickStats.variantBConversionRate}%</span>
                          </p>
                        </div>
                      </>
                    )}
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
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
