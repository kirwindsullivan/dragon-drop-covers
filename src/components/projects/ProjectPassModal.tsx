"use client";

import { useState } from "react";
import { X, Zap, Ticket } from "lucide-react";

interface ProjectPassModalProps {
  onClose: () => void;
}

const PASS_BENEFITS = [
  "Project Pass: $25 one-time, 1 project, all presets, no watermark, 90-day storage",
  "Pro: unlimited projects, 4K exports, indefinite storage",
];

type LoadingAction = "pass" | "pro" | null;

export function ProjectPassModal({ onClose }: ProjectPassModalProps) {
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

      {/* Card */}
      <div className="relative w-full max-w-sm rounded-2xl border border-brand-700/50 bg-surface-1 p-6 shadow-[0_0_60px_rgba(168,85,247,0.15)]">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-brand-300/40 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-900 border border-brand-700/50">
          <Ticket className="h-5 w-5 text-brand-400" />
        </div>

        {/* Heading */}
        <h2 className="text-lg font-bold text-white mb-1">Create a project</h2>
        <p className="text-sm text-brand-300/70 mb-5">
          You need a Pro subscription or a Project Pass to start a new project.
        </p>

        {/* Benefits */}
        <ul className="space-y-2 mb-6">
          {PASS_BENEFITS.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-brand-200">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
              {item}
            </li>
          ))}
        </ul>

        {/* CTA — Buy Project Pass */}
        <button
          onClick={handleBuyPass}
          disabled={loading !== null}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-amber-500 hover:bg-amber-400 py-3 text-center text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all disabled:opacity-70 disabled:cursor-not-allowed mb-3"
        >
          {loading === "pass" ? (
            <span className="inline-block h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
          ) : (
            <Ticket className="h-4 w-4" />
          )}
          {loading === "pass" ? "Redirecting…" : "Buy a Project Pass — $25"}
        </button>

        {/* CTA — Upgrade to Pro */}
        <button
          onClick={handleUpgradePro}
          disabled={loading !== null}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-brand-600 hover:bg-brand-500 py-3 text-center text-sm font-semibold text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading === "pro" ? (
            <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          {loading === "pro" ? "Redirecting…" : "Upgrade to Pro"}
        </button>

        <button
          onClick={onClose}
          className="mt-2 block w-full py-2 text-center text-xs text-brand-300/40 hover:text-brand-300 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
