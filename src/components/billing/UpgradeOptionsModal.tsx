"use client";

// Shared upgrade modal — shows Project Pass and Pro as side-by-side cards.
// Used by UpgradeModal (locked export presets), ProjectPassModal (new project
// gate), and UpgradeButton (dashboard plan card).

import { useState } from "react";
import { X, Zap, Ticket, Check } from "lucide-react";

type LoadingAction = "pass" | "pro" | null;

interface UpgradeOptionsModalProps {
  onClose: () => void;
  heading?: string;
  subheading?: string;
}

const PASS_FEATURES = [
  "1 project slot",
  "No watermark on any export",
  "All export presets unlocked",
  "90-day file retention",
];

const PRO_FEATURES = [
  "Unlimited projects",
  "No watermark on any export",
  "4K exports",
  "All export presets unlocked",
  "Indefinite file retention",
];

export function UpgradeOptionsModal({
  onClose,
  heading = "Choose your plan",
  subheading = "Pick the option that works best for you.",
}: UpgradeOptionsModalProps) {
  const [loading, setLoading] = useState<LoadingAction>(null);

  const handleBuyPass = async () => {
    setLoading("pass");
    try {
      const res = await fetch("/api/stripe/project-pass", { method: "POST" });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
      else setLoading(null);
    } catch {
      setLoading(null);
    }
  };

  const handleUpgradePro = async () => {
    setLoading("pro");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
      else setLoading(null);
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-brand-700/50 bg-surface-1 p-6 shadow-[0_0_60px_rgba(168,85,247,0.15)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-brand-300/40 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-xl font-bold text-white mb-1">{heading}</h2>
        <p className="text-sm text-brand-300/70 mb-6">{subheading}</p>

        {/* ── Two-card grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Project Pass */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/30">
                <Ticket className="h-4 w-4 text-amber-400" />
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20 leading-snug text-right">
                Best for single campaigns
              </span>
            </div>

            <p className="text-white font-bold text-lg leading-none mb-0.5">Project Pass</p>
            <p className="text-amber-300/70 text-sm mb-4">One-time · $30</p>

            <ul className="space-y-2 mb-5 flex-1">
              {PASS_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-brand-200">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={handleBuyPass}
              disabled={loading !== null}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-amber-500 hover:bg-amber-400 py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading === "pass" ? (
                <span className="inline-block h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
              ) : (
                <Ticket className="h-4 w-4" />
              )}
              {loading === "pass" ? "Redirecting…" : "Buy a Project Pass — $30"}
            </button>
          </div>

          {/* Pro */}
          <div className="rounded-xl border border-brand-500/40 bg-brand-950/30 p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 border border-brand-500/30">
                <Zap className="h-4 w-4 text-brand-400" />
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/20 leading-snug text-right">
                Most popular for designers
              </span>
            </div>

            <p className="text-white font-bold text-lg leading-none mb-0.5">Pro</p>
            <p className="text-brand-300/70 text-sm mb-4">Monthly subscription</p>

            <ul className="space-y-2 mb-5 flex-1">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-brand-200">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={handleUpgradePro}
              disabled={loading !== null}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-brand-600 hover:bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading === "pro" ? (
                <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {loading === "pro" ? "Redirecting…" : "Upgrade to Pro"}
            </button>
          </div>

        </div>

        <button
          onClick={onClose}
          className="mt-4 block w-full py-2 text-center text-xs text-brand-300/40 hover:text-brand-300 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
