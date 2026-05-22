"use client";

import { useRef, useCallback } from "react";
import { useEditorStore } from "@/store/editorStore";

export function LightingControls() {
  const lighting = useEditorStore((s) => s.lighting);
  const setLighting = useEditorStore((s) => s.setLighting);
  const padRef = useRef<HTMLDivElement>(null);

  const handlePadInteraction = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const pad = padRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();

      const getXY = (ev: React.MouseEvent | React.TouchEvent) => {
        if ("touches" in ev) {
          return { cx: ev.touches[0].clientX, cy: ev.touches[0].clientY };
        }
        return { cx: ev.clientX, cy: ev.clientY };
      };

      const move = (ev: MouseEvent | TouchEvent) => {
        ev.preventDefault();
        const { cx, cy } = getXY(ev as unknown as React.MouseEvent | React.TouchEvent);
        const x = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (cy - rect.top) / rect.height));
        setLighting({ padX: x, padY: y });
      };

      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
      };

      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", up);

      // Also fire on the initial click
      const { cx, cy } = getXY(e);
      const x = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (cy - rect.top) / rect.height));
      setLighting({ padX: x, padY: y });
    },
    [setLighting],
  );

  return (
    <div className="space-y-5">
      <div>
        <label className="block mb-2 text-xs font-semibold uppercase tracking-widest text-brand-300/70">
          Light Direction
        </label>
        {/* Circular drag pad */}
        <div className="flex justify-center">
          <div
            ref={padRef}
            onMouseDown={handlePadInteraction}
            onTouchStart={handlePadInteraction}
            className="relative w-40 h-40 rounded-full bg-surface-2 border border-surface-3 cursor-crosshair select-none overflow-hidden"
            style={{
              background:
                "radial-gradient(circle at center, #2a1f45 0%, #0f0a1a 100%)",
            }}
          >
            {/* Grid lines */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-px bg-surface-3/50" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-full w-px bg-surface-3/50" />
            </div>

            {/* Handle */}
            <div
              className="absolute w-5 h-5 rounded-full bg-brand-400 shadow-[0_0_12px_rgba(168,85,247,0.8)] border-2 border-white/80 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${lighting.padX * 100}%`,
                top: `${lighting.padY * 100}%`,
              }}
            />

            {/* Corner labels */}
            <span className="absolute top-1.5 left-2 text-[9px] text-brand-300/40 pointer-events-none">UL</span>
            <span className="absolute top-1.5 right-2 text-[9px] text-brand-300/40 pointer-events-none">UR</span>
            <span className="absolute bottom-1.5 left-2 text-[9px] text-brand-300/40 pointer-events-none">LL</span>
            <span className="absolute bottom-1.5 right-2 text-[9px] text-brand-300/40 pointer-events-none">LR</span>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-brand-300/40">
          Drag to reposition key light
        </p>
      </div>

      {/* Ambient intensity */}
      <SliderRow
        label="Ambient Light"
        value={lighting.ambientIntensity}
        min={0}
        max={1.5}
        step={0.01}
        onChange={(v) => setLighting({ ambientIntensity: v })}
        displayValue={lighting.ambientIntensity.toFixed(2)}
      />

      {/* Point intensity */}
      <SliderRow
        label="Key Light"
        value={lighting.pointIntensity}
        min={0}
        max={4}
        step={0.05}
        onChange={(v) => setLighting({ pointIntensity: v })}
        displayValue={lighting.pointIntensity.toFixed(2)}
      />
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  displayValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  displayValue: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-widest text-brand-300/70">
          {label}
        </label>
        <span className="text-xs font-mono text-brand-300">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-brand-500 cursor-pointer"
      />
    </div>
  );
}
