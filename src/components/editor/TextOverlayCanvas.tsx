"use client";

// [v2.1 Part 7] Text overlay canvas — renders title and tagline live as the user
// types.  This is a SECOND HTML canvas layered on top of the Three.js canvas and
// BELOW the SafeZoneOverlay canvas.
//
// Stacking order (bottom → top):
//   1. Three.js canvas         (inside BookScene div)
//   2. TextOverlayCanvas       (this component, z-[5])
//   3. SafeZoneOverlay canvas  (z-[10])
//
// This canvas is pointer-events: none and is NEVER captured by captureFrame —
// the Three.js renderer uses its own offscreen buffer.  Existing QuickPost
// compositing in ExportPanel is completely unchanged.
//
// ResizeObserver pattern mirrors SafeZoneOverlay for consistency.

import { useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useEditorStore } from "@/store/editorStore";

export function TextOverlayCanvas() {
  const textOverlay = useEditorStore((s) => s.textOverlay);

  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Draw function ─────────────────────────────────────────────────────────
  // Reads container dimensions directly from the DOM every call (same approach
  // as SafeZoneOverlay) to avoid stale-closure issues with cached sizes.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const cw = Math.round(rect.width);
    const ch = Math.round(rect.height);
    if (cw === 0 || ch === 0) return;

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width  = cw;
      canvas.height = ch;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    const { title, tagline } = textOverlay;
    if (!title && !tagline) return;

    // Drop shadow shared by both text layers
    ctx.shadowColor   = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur    = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // Title — bold, ~4% canvas height, centered, ~85% down
    if (title) {
      const fontSize = Math.max(12, Math.round(ch * 0.04));
      ctx.font         = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle    = "rgba(255, 255, 255, 0.92)";
      ctx.textAlign    = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(title, cw / 2, ch * 0.85);
    }

    // Tagline — regular, ~2.5% canvas height, centered, ~91% down
    if (tagline) {
      const fontSize = Math.max(10, Math.round(ch * 0.025));
      ctx.font         = `${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle    = "rgba(255, 255, 255, 0.78)";
      ctx.textAlign    = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(tagline, cw / 2, ch * 0.91);
    }
  }, [textOverlay]);

  // ── Redraw triggers (three-layer, same as SafeZoneOverlay) ───────────────

  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; });

  // Layer 1: ResizeObserver + initial RAF on mount
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { drawRef.current(); });
    ro.observe(el);
    requestAnimationFrame(() => { drawRef.current(); });
    return () => ro.disconnect();
  }, []);

  // Layer 2: After every React render (synchronous, before paint)
  useLayoutEffect(() => { drawRef.current(); });

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 pointer-events-none z-[5]"
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
