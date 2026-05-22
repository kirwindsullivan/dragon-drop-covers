"use client";

import { useEditorStore, MOOD_PRESETS } from "@/store/editorStore";
import { cn } from "@/lib/utils";

export function PhotoAdjustments() {
  const photo = useEditorStore((s) => s.photo);
  const setPhoto = useEditorStore((s) => s.setPhoto);
  const applyMoodPreset = useEditorStore((s) => s.applyMoodPreset);

  return (
    <div className="space-y-5">
      {/* Mood presets */}
      <div>
        <label className="block mb-2 text-xs font-semibold uppercase tracking-widest text-brand-300/70">
          Mood Presets
        </label>
        <div className="grid grid-cols-2 gap-2">
          {MOOD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyMoodPreset(preset)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                "border-surface-3 text-brand-200 hover:border-brand-500 hover:bg-brand-900/40",
              )}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-surface-3" />

      {/* Manual sliders */}
      <AdjSlider
        label="Brightness"
        value={photo.brightness}
        min={-1}
        max={1}
        onChange={(v) => setPhoto({ brightness: v })}
      />
      <AdjSlider
        label="Contrast"
        value={photo.contrast}
        min={-1}
        max={1}
        onChange={(v) => setPhoto({ contrast: v })}
      />
      <AdjSlider
        label="Saturation"
        value={photo.saturation}
        min={-1}
        max={1}
        onChange={(v) => setPhoto({ saturation: v })}
      />
      <AdjSlider
        label="Vignette"
        value={photo.vignette}
        min={0}
        max={1}
        onChange={(v) => setPhoto({ vignette: v })}
      />

      <button
        onClick={() =>
          setPhoto({ brightness: 0, contrast: 0, saturation: 0, vignette: 0.3 })
        }
        className="text-xs text-brand-300/50 hover:text-brand-300 transition-colors"
      >
        Reset adjustments
      </button>
    </div>
  );
}

function AdjSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-brand-300/70">
          {label}
        </span>
        <span className="text-xs font-mono text-brand-300">
          {value >= 0 ? "+" : ""}
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-brand-500 cursor-pointer"
      />
    </div>
  );
}
