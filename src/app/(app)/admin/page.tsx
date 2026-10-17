"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  DollarSign,
  LogOut,
  ChevronRight,
  FlaskConical,
  Shield,
  Tag,
  ShoppingBag,
  MessageCircle,
  Radar,
  Activity,
  Sparkles,
  ChartNoAxesCombined,
  TableProperties,
  type LucideIcon,
} from "lucide-react";

interface AdminOption {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  color: string;
  bgColor: string;
}

const adminOptions: AdminOption[] = [
  {
    id: "revenue",
    title: "Revenue Dashboard",
    description: "View MRR, ARR, subscriptions, transactions, and financial metrics",
    icon: DollarSign,
    href: "/admin/revenue",
    color: "text-green-400",
    bgColor: "bg-green-500/20",
  },
  {
    id: "orders",
    title: "Orders",
    description: "Search payments, customers, purchased items, and order status",
    icon: ShoppingBag,
    href: "/admin/orders",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
  },
  {
    id: "tracking",
    title: "Tracking",
    description: "Meta campaigns, UTM sales, hourly orders, and live purchases",
    icon: Radar,
    href: "/admin/tracking",
    color: "text-rose-400",
    bgColor: "bg-rose-500/20",
  },
  {
    id: "system-status",
    title: "System Status",
    description: "Service health, monitoring history, and alert destinations",
    icon: Activity,
    href: "/admin/monitoring",
    color: "text-teal-400",
    bgColor: "bg-teal-500/20",
  },
  {
    id: "whatsapp",
    title: "WhatsApp Sends",
    description: "Track AiSensy invoice messages and resend failed deliveries",
    icon: MessageCircle,
    href: "/admin/whatsapp",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20",
  },
  {
    id: "pricing",
    title: "Pricing Management",
    description: "Manage bundle prices, display prices, upsells, and coin packages",
    icon: Tag,
    href: "/admin/pricing",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
  },
  {
    id: "ab-tests",
    title: "A/B Tests",
    description: "Manage pricing page experiments and view conversion metrics",
    icon: FlaskConical,
    href: "/admin/ab-tests",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
  },
];

const soulmateOptions: AdminOption[] = [
  {
    id: "soulmate-tracking",
    title: "Soulmate Tracking",
    description: "Track Soulmate campaigns, UTMs, Meta sales, hourly performance and saved views",
    icon: ChartNoAxesCombined,
    href: "/admin/soulmate/tracking",
    color: "text-cyan-300",
    bgColor: "bg-cyan-500/15",
  },
  {
    id: "soulmate-orders",
    title: "Soulmate Orders",
    description: "Review purchases, customer answers, generation and delivery status",
    icon: Sparkles,
    href: "/admin/soulmate/orders",
    color: "text-rose-300",
    bgColor: "bg-rose-500/15",
  },
  {
    id: "soulmate-analytics",
    title: "Soulmate Analytics",
    description: "Track landings, checkout rate, conversion and campaign traffic",
    icon: ChartNoAxesCombined,
    href: "/admin/soulmate/analytics",
    color: "text-violet-300",
    bgColor: "bg-violet-500/15",
  },
  {
    id: "soulmate-profit",
    title: "Soulmate Profit Sheet",
    description: "Review isolated sales, costs, net profit and return on ad spend",
    icon: TableProperties,
    href: "/admin/soulmate/profit",
    color: "text-emerald-300",
    bgColor: "bg-emerald-500/15",
  },
];

const usSoulmateOptions: AdminOption[] = soulmateOptions.map((option) => ({
  ...option, id: `us-${option.id}`, title: `US ${option.title}`,
  description: option.description.replaceAll("Soulmate", "US Soulmate"),
  href: option.href.replace("/admin/soulmate", "/admin/us-soulmate"),
}));

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [systemSummary, setSystemSummary] = useState<{ issues: number; checkedAt: string | null } | null>(null);

  useEffect(() => {
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

    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (loading) return;
    let active = true;
    const update = async () => {
      const token = localStorage.getItem("admin_session_token");
      if (!token) return;
      try {
        const response = await fetch("/api/admin/monitoring", { headers: { "x-admin-session": token }, cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setSystemSummary({ issues: data.incidents?.length || 0, checkedAt: data.runs?.[0]?.started_at || null });
      } catch { /* The status page displays the detailed error. */ }
    };
    void update();
    const timer = window.setInterval(update, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [loading]);

  const handleLogout = () => {
    localStorage.removeItem("admin_session_token");
    localStorage.removeItem("admin_session_expiry");
    router.push("/admin/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/50">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E1A] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-white/50 text-sm">Manage your application</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </motion.div>

        {/* Admin Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {adminOptions.map((option, index) => (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => router.push(option.href)}
              className="bg-[#1A2235] border border-white/10 rounded-2xl p-6 cursor-pointer hover:border-primary/50 hover:bg-[#1A2235]/80 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 ${option.bgColor} rounded-xl flex items-center justify-center`}>
                    <option.icon className={`w-6 h-6 ${option.color}`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white mb-1">{option.title}</h2>
                    <p className="text-white/50 text-sm">{option.description}</p>
                    {option.id === "system-status" && systemSummary && <p className={`mt-3 text-xs font-medium ${!systemSummary.checkedAt || systemSummary.issues ? "text-amber-300" : "text-emerald-300"}`}>
                      {!systemSummary.checkedAt ? "No checks yet" : systemSummary.issues ? `${systemSummary.issues} open ${systemSummary.issues === 1 ? "issue" : "issues"}` : "No open issues"}
                      {systemSummary.checkedAt && <span className="ml-2 text-white/40">· Last check {new Date(systemSummary.checkedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })} IST</span>}
                    </p>}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </motion.div>
          ))}
        </div>

        <section aria-labelledby="soulmate-workspace-title" className="mt-8">
          <h2 id="soulmate-workspace-title" className="mb-3 text-sm font-medium text-white/50">Soulmate workspace</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {soulmateOptions.map((option, index) => <motion.button
              key={option.id}
              type="button"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * index }}
              onClick={() => router.push(option.href)}
              className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-[#1A2235] p-6 text-left transition-colors hover:border-primary/45 hover:bg-[#1A2235]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${option.bgColor}`}><option.icon className={`h-6 w-6 ${option.color}`} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-lg font-semibold text-white">{option.title}</span><span className="mt-1 block text-sm leading-relaxed text-white/50">{option.description}</span></span>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-white/30 transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
            </motion.button>)}
          </div>
        </section>

        <section aria-labelledby="us-soulmate-workspace-title" className="mt-8">
          <h2 id="us-soulmate-workspace-title" className="mb-3 text-sm font-medium text-white/50">US Soulmate workspace</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {usSoulmateOptions.map((option, index) => <motion.button
              key={option.id}
              type="button"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * index }}
              onClick={() => router.push(option.href)}
              className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-[#1A2235] p-6 text-left transition-colors hover:border-primary/45 hover:bg-[#1A2235]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${option.bgColor}`}><option.icon className={`h-6 w-6 ${option.color}`} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-lg font-semibold text-white">{option.title}</span><span className="mt-1 block text-sm leading-relaxed text-white/50">{option.description}</span></span>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-white/30 transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
            </motion.button>)}
          </div>
        </section>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-white/30 text-sm mt-8"
        >
          AstroRekha Admin Panel • Secure Access
        </motion.p>
      </div>
    </div>
  );
}
