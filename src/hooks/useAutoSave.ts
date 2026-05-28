"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editorStore";

/**
 * Debounced auto-save: waits 5 seconds after the last editor state change
 * before PATCHing the project API. Fire-and-forget — silent on failure.
 *
 * Pass `null` as projectId to disable (e.g. on the standalone /editor page).
 */
export function useAutoSave(projectId: string | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const background          = useEditorStore((s) => s.background);
  const lighting            = useEditorStore((s) => s.lighting);
  const photo               = useEditorStore((s) => s.photo);
  const textOverlay         = useEditorStore((s) => s.textOverlay);
  const bookSize            = useEditorStore((s) => s.bookSize);
  const spineTitle          = useEditorStore((s) => s.spineTitle);
  // [v2.1] New scene settings
  const finish              = useEditorStore((s) => s.finish);
  const hdriIntensity       = useEditorStore((s) => s.hdriIntensity);
  const atmosphericEffect   = useEditorStore((s) => s.atmosphericEffect);
  const atmosphericIntensity = useEditorStore((s) => s.atmosphericIntensity);
  const activeCameraPreset  = useEditorStore((s) => s.activeCameraPreset);

  useEffect(() => {
    if (!projectId) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookSize,
            settings: {
              background,
              lighting,
              adjustments: photo,
              overlayTitle: textOverlay.title,
              overlayTagline: textOverlay.tagline,
              // [v2.1] New scene settings
              finish,
              hdriIntensity,
              atmosphericEffect,
              atmosphericIntensity,
              activeCameraPreset,
            },
          }),
        });
      } catch {
        // fire and forget — silent failure is ok for auto-save
      }
    }, 5000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId, background, lighting, photo, textOverlay, bookSize, spineTitle, finish, hdriIntensity, atmosphericEffect, atmosphericIntensity, activeCameraPreset]);
}
