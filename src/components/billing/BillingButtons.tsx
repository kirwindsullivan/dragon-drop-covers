"use client";

import { useState } from "react";
import { Zap, Settings } from "lucide-react";

// ── Upgrade button — starts Stripe Checkout ───────────────────────────────────
export function UpgradeButton() {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const { url } = await res.json() as { url?: string };
      if (url) window.location.href = url;
      else setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleUpgrade}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {loading ? (
        <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      ) : (
        <Zap className="h-4 w-4" />
      )}
      {loading ? "Redirecting…" : "Upgrade to Pro"}
    </button>
  );
}

// ── Manage button — opens Stripe Customer Portal ──────────────────────────────
export function ManageButton() {
  const [loading, setLoading] = useState(false);

  const handleManage = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url } = await res.json() as { url?: string };
      if (url) window.location.href = url;
      else setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleManage}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 py-3 text-sm font-semibold text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {loading ? (
        <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      ) : (
        <Settings className="h-4 w-4" />
      )}
      {loading ? "Redirecting…" : "Manage subscription"}
    </button>
  );
}
