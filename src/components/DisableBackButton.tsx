"use client";

import { useEffect } from "react";

export default function DisableBackButton() {
  useEffect(() => {
    // Push a new state to history
    window.history.pushState(null, "", window.location.href);
    
    // Handle popstate (back button)
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
    };
    
    window.addEventListener("popstate", handlePopState);
    
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return null;
}
