"use client";

// [Session 5] Safe zone overlay — drawn as an HTML canvas layered on top of the
// Three.js canvas so it is completely separate from the WebGL renderer and can
// never appear in exported images.
//
// Shows:
//  • A dark vignette (25% opacity) outside the export frame
//  • A 1.5px white border (60% opacity) marking the export boundary
//  • A label pill at the top-left corner: "Preset name — WxH"
//  • An optional rule-of-thirds grid (white 20% opacity, toggled by a corner button)
//
// The component is placed as a direct child of the "relative flex-1 overflow-hidden"
// viewport div in the builder page — it uses "absolute inset-0" to match that div.

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { Grid3X3 } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { EXPORT_PRESETS, SAFE_ZONE_PADDING } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Draw a rounded rectangle path on a 2D canvas context. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SafeZoneOverlay() {
  const exportPresetId = useEditorStore((s) => s.exportPresetId);
  const showGrid       = useEditorStore((s) => s.showRuleOfThirds);
  const setShowGrid    = useEditorStore((s) => s.setShowRuleOfThirds);

  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Track the container's pixel dimensions so we can redraw on resize
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const preset = EXPORT_PRESETS.find((p) => p.id === exportPresetId) ?? EXPORT_PRESETS[0];

  // ResizeObserver keeps containerSize in sync with the viewport div
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    // Measure immediately so the first render isn't blank
    const { width, height } = el.getBoundingClientRect();
    setContainerSize({ w: width, h: height });
    return () => ro.disconnect();
  }, []);

  // ── Draw function ────────────────────────────────────────────────────────────
  // Extracted into a stable useCallback so it can be stored in a ref and called
  // from multiple places (resize, render cycle, explicit post-export redraw).
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w: cw, h: ch } = containerSize;
    if (cw === 0 || ch === 0) return;

    // Only update canvas dimensions when they actually change — setting
    // canvas.width always clears the bitmap, even when the value is identical.
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width  = cw;
      canvas.height = ch;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    // ── Calculate the export frame rectangle ──────────────────────────────
    // Largest rectangle with the preset's aspect ratio that fits in the
    // container with a little breathing room around the edges.
    // PADDING — shared with BookScene.captureFrame via SAFE_ZONE_PADDING in
    // constants.ts.  captureFrame renders at 1/PADDING scale then center-crops
    // to the preset dimensions, so the exported pixels exactly match this frame.
    const PADDING = SAFE_ZONE_PADDING;
    const presetRatio = preset.width / preset.height;
    const containerRatio = cw / ch;

    let fw: number, fh: number;
    if (containerRatio > presetRatio) {
      // Container is wider than preset → height is the constraint
      fh = ch * PADDING;
      fw = fh * presetRatio;
    } else {
      // Container is taller → width is the constraint
      fw = cw * PADDING;
      fh = fw / presetRatio;
    }
    const fx = (cw - fw) / 2;
    const fy = (ch - fh) / 2;

    // ── Dark vignette outside the frame ──────────────────────────────────
    // Fill the whole canvas, then "punch out" the frame interior using
    // destination-out composite so the frame is fully transparent.
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillRect(fx, fy, fw, fh);
    ctx.restore();

    // ── Frame border ──────────────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255, 255, 255, 0.60)";
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(fx, fy, fw, fh);

    // ── Rule-of-thirds grid ───────────────────────────────────────────────
    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.20)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      // Two vertical lines
      ctx.moveTo(fx + fw / 3,       fy);      ctx.lineTo(fx + fw / 3,       fy + fh);
      ctx.moveTo(fx + (fw * 2) / 3, fy);      ctx.lineTo(fx + (fw * 2) / 3, fy + fh);
      // Two horizontal lines
      ctx.moveTo(fx,      fy + fh / 3);       ctx.lineTo(fx + fw, fy + fh / 3);
      ctx.moveTo(fx,      fy + (fh * 2) / 3); ctx.lineTo(fx + fw, fy + (fh * 2) / 3);
      ctx.stroke();
      ctx.restore();
    }

    // ── Label pill ────────────────────────────────────────────────────────
    const label = `${preset.name} — ${preset.width}×${preset.height}`;
    const FONT  = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.font    = FONT;
    const textW = ctx.measureText(label).width;
    const PAD   = 7;
    const PILL_H = 22;
    const pillX  = fx;
    const pillY  = fy - PILL_H - 6;
    const pillW  = textW + PAD * 2;

    if (pillY > 2) { // only draw if there's room above the frame
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      roundRectPath(ctx, pillX, pillY, pillW, PILL_H, 4);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle    = "rgba(255, 255, 255, 0.90)";
      ctx.font         = FONT;
      ctx.textBaseline = "middle";
      ctx.fillText(label, pillX + PAD, pillY + PILL_H / 2);
    }
  }, [containerSize, preset, showGrid]);

  // ── Redraw triggers ──────────────────────────────────────────────────────────

  // Always keep a ref to the latest draw function so event listeners and the
  // no-dep effect can call it without capturing a stale closure.
  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; });

  // Redraw after every render cycle.  Covers the case where a Zustand store
  // update (e.g. addExportHistory) triggers a parent re-render that causes the
  // canvas bitmap to be lost, even though none of our subscribed selectors
  // (exportPresetId, showRuleOfThirds) actually changed.
  // Using useLayoutEffect (not useEffect) runs synchronously after DOM mutations
  // so the canvas is never visibly blank between paint frames.
  useLayoutEffect(() => {
    drawRef.current();
  });

  // Explicit redraw request from ExportPanel — dispatched in its finally block
  // so the overlay is guaranteed to be redrawn after every export attempt,
  // even if SafeZoneOverlay didn't re-render at all.
  useEffect(() => {
    const handler = () => drawRef.current();
    window.addEventListener("dragon-drop:redraw-overlay", handler);
    return () => window.removeEventListener("dragon-drop:redraw-overlay", handler);
  }, []); // empty — handler via ref is always current

  return (
    // pointer-events: none so OrbitControls on the Three.js canvas still works
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Grid toggle button — needs pointer events, sits in the corner */}
      <button
        onClick={() => setShowGrid(!showGrid)}
        className={cn(
          "pointer-events-auto absolute bottom-16 right-4",
          "flex items-center gap-2 rounded-lg border px-3 h-9 transition-all",
          showGrid
            ? "border-brand-500 bg-brand-900/80 text-brand-300"
            : "border-white/20 bg-black/40 text-white/50 hover:border-white/40 hover:text-white/80",
        )}
        title="Toggle rule-of-thirds grid"
        aria-label="Toggle rule-of-thirds grid"
      >
        <Grid3X3 className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium">Grid</span>
      </button>
    </div>
  );
}
