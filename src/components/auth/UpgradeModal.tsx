"use client";

import { X, Zap, Lock } from "lucide-react";
import Link from "next/link";

interface UpgradeModalProps {
  presetName: string;
  onClose: () => void;
}

const PRO_BENEFITS = [
  "All export presets — 4K, press kit, all platforms",
  "No watermark on any export",
  "Indefinite file storage (free: 30-day retention)",
];

export function UpgradeModal({ presetName, onClose }: UpgradeModalProps) {
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
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-900 border border-brand-700/50">
          <Lock className="h-5 w-5 text-brand-400" />
        </div>

        {/* Heading */}
        <h2 className="text-lg font-bold text-white mb-1">Pro export</h2>
        <p className="text-sm text-brand-300/70 mb-5">
          <span className="text-brand-200 font-medium">{presetName}</span> is
          only available on the Pro plan. Upgrade to unlock:
        </p>

        {/* Benefits */}
        <ul className="space-y-2 mb-6">
          {PRO_BENEFITS.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-brand-200">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
              {item}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Link
          href="/dashboard"
          onClick={onClose}
          className="block w-full rounded-xl bg-brand-600 hover:bg-brand-500 py-3 text-center text-sm font-semibold text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all"
        >
          Upgrade to Pro
        </Link>
        <button
          onClick={onClose}
          className="mt-2 block w-full py-2 text-center text-xs text-brand-300/40 hover:text-brand-300 transition-colors"
        >
          Continue with Free
        </button>
      </div>
    </div>
  );
}
