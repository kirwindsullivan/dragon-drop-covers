"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { BACKGROUND_PRESETS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { BackgroundPreset } from "@/types";

export function BackgroundSelector() {
  const background = useEditorStore((s) => s.background);
  const setBackground = useEditorStore((s) => s.setBackground);
  const [customColor, setCustomColor] = useState("#1a0030");
  const [customColor2, setCustomColor2] = useState("#0d001a");
  const [customMode, setCustomMode] = useState<"solid" | "gradient">("gradient");

  const applyCustom = () => {
    const preset: BackgroundPreset = {
      id: "custom",
      name: "Custom",
      mode: customMode,
      value: customColor,
      value2: customMode === "gradient" ? customColor2 : undefined,
      angle: 135,
    };
    setBackground(preset);
  };

  return (
    <div className="space-y-4">
      <label className="block text-xs font-semibold uppercase tracking-widest text-brand-300/70">
        Atmosphere
      </label>

      {/* Preset grid */}
      <div className="grid grid-cols-3 gap-2">
        {BACKGROUND_PRESETS.map((preset) => {
          const isActive = background.id === preset.id;
          const bg =
            preset.mode === "gradient"
              ? `linear-gradient(${preset.angle ?? 135}deg, ${preset.value}, ${preset.value2})`
              : preset.value;

          return (
            <button
              key={preset.id}
              onClick={() => setBackground(preset)}
              className={cn(
                "relative group rounded-lg overflow-hidden aspect-video border-2 transition-all",
                isActive
                  ? "border-brand-400 shadow-[0_0_12px_rgba(168,85,247,0.5)]"
                  : "border-transparent hover:border-brand-600",
              )}
              title={preset.name}
            >
              <div
                className="absolute inset-0"
                style={{ background: bg }}
              />
              {isActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Check className="h-4 w-4 text-white drop-shadow" />
                </div>
              )}
              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-[9px] text-white/80 text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {preset.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom picker */}
      <div className="rounded-xl border border-surface-3 bg-surface-1 p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-300/70">
          Custom
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => setCustomMode("solid")}
            className={cn(
              "flex-1 rounded-lg border py-1.5 text-xs transition-all",
              customMode === "solid"
                ? "border-brand-500 bg-brand-900/60 text-brand-200"
                : "border-surface-3 text-brand-300/60 hover:border-brand-600",
            )}
          >
            Solid
          </button>
          <button
            onClick={() => setCustomMode("gradient")}
            className={cn(
              "flex-1 rounded-lg border py-1.5 text-xs transition-all",
              customMode === "gradient"
                ? "border-brand-500 bg-brand-900/60 text-brand-200"
                : "border-surface-3 text-brand-300/60 hover:border-brand-600",
            )}
          >
            Gradient
          </button>
        </div>

        <div className="flex gap-3 items-center">
          <label className="text-xs text-brand-300/70">Color 1</label>
          <input
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="h-8 w-14 cursor-pointer rounded border border-surface-3 bg-transparent p-0.5"
          />
          {customMode === "gradient" && (
            <>
              <label className="text-xs text-brand-300/70">Color 2</label>
              <input
                type="color"
                value={customColor2}
                onChange={(e) => setCustomColor2(e.target.value)}
                className="h-8 w-14 cursor-pointer rounded border border-surface-3 bg-transparent p-0.5"
              />
            </>
          )}
        </div>

        <button
          onClick={applyCustom}
          className="w-full rounded-lg bg-brand-700 hover:bg-brand-600 py-2 text-xs font-semibold text-white transition-colors"
        >
          Apply Custom
        </button>
      </div>

      <p className="text-xs text-brand-300/40 text-center">
        Image backgrounds — coming soon
      </p>
    </div>
  );
}
