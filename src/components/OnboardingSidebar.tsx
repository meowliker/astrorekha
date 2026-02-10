"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface OnboardingSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OnboardingSidebar({ isOpen, onClose }: OnboardingSidebarProps) {
  const menuItems = [
    { label: "Contact us", href: "/contact-us" },
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms of Service", href: "/terms-of-service" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-50"
          />
          
          {/* Sidebar - slides in from right */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[70%] max-w-[300px] bg-[#1A1F2E] z-50 shadow-2xl"
          >
            <div className="p-6">
              {/* Close Button */}
              <button
                onClick={onClose}
                className="mb-8"
              >
                <X className="w-6 h-6 text-white" />
              </button>

              {/* Menu Items */}
              <nav className="space-y-6">
                {menuItems.map((item, index) => (
                  <motion.a
                    key={item.label}
                    href={item.href}
                    target={item.href.startsWith("mailto") ? undefined : "_blank"}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    className="block text-white text-lg hover:text-primary transition-colors"
                    onClick={(e) => {
                      if (item.href.startsWith("mailto")) {
                        // Let mailto work normally
                      } else {
                        e.preventDefault();
                        window.open(item.href, "_blank");
                      }
                    }}
                  >
                    {item.label}
                  </motion.a>
                ))}
              </nav>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
