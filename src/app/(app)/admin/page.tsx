"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  DollarSign,
  BarChart3,
  Users,
  Settings,
  LogOut,
  ChevronRight,
  TrendingUp,
  FlaskConical,
  Shield,
} from "lucide-react";

interface AdminOption {
  id: string;
  title: string;
  description: string;
  icon: any;
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
    id: "ab-tests",
    title: "A/B Tests",
    description: "Manage pricing page experiments and view conversion metrics",
    icon: FlaskConical,
    href: "/admin/ab-tests",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
  },
];

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

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
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Stats Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 bg-[#1A2235] border border-white/10 rounded-2xl p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => router.push("/admin/revenue")}
              className="p-4 bg-white/5 hover:bg-white/10 rounded-xl text-center transition-colors"
            >
              <DollarSign className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <span className="text-white/70 text-sm">View Revenue</span>
            </button>
            <button
              onClick={() => router.push("/admin/ab-tests")}
              className="p-4 bg-white/5 hover:bg-white/10 rounded-xl text-center transition-colors"
            >
              <FlaskConical className="w-6 h-6 text-purple-400 mx-auto mb-2" />
              <span className="text-white/70 text-sm">Manage Tests</span>
            </button>
            <button
              onClick={() => router.push("/admin/revenue")}
              className="p-4 bg-white/5 hover:bg-white/10 rounded-xl text-center transition-colors"
            >
              <Users className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <span className="text-white/70 text-sm">Subscribers</span>
            </button>
            <button
              onClick={() => router.push("/admin/revenue")}
              className="p-4 bg-white/5 hover:bg-white/10 rounded-xl text-center transition-colors"
            >
              <BarChart3 className="w-6 h-6 text-orange-400 mx-auto mb-2" />
              <span className="text-white/70 text-sm">Analytics</span>
            </button>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-white/30 text-sm mt-8"
        >
          PalmCosmic Admin Panel • Secure Access
        </motion.p>
      </div>
    </div>
  );
}
