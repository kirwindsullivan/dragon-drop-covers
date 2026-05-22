"use client";

import { useRef, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft, Flame } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { SidePanel } from "@/components/editor/SidePanel";
import { bgToCss } from "@/lib/utils";
import type { ExportMode } from "@/types";
import type { BookSceneHandle } from "@/components/editor/BookScene";

// Dynamically import BookScene — it uses WebGL and must be client-only
const BookScene = dynamic(
  () => import("@/components/editor/BookScene").then((m) => ({ default: m.BookScene })),
  { ssr: false, loading: () => <SceneFallback /> },
);

function SceneFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center space-y-3">
        <Flame className="mx-auto h-10 w-10 text-brand-500 animate-pulse" />
        <p className="text-sm text-brand-300/60">Loading 3D engine…</p>
      </div>
    </div>
  );
}

export default function EditorPage() {
  const background = useEditorStore((s) => s.background);
  const sceneHandleRef = useRef<BookSceneHandle | null>(null);

  const handleSceneReady = useCallback((handle: BookSceneHandle) => {
    sceneHandleRef.current = handle;
  }, []);

  const handleResetCamera = useCallback(() => {
    sceneHandleRef.current?.resetCamera();
  }, []);

  const handleExport = useCallback(
    async (width: number, height: number, mode: ExportMode): Promise<Blob | null> => {
      if (!sceneHandleRef.current) return null;
      return sceneHandleRef.current.captureFrame(width, height);
    },
    [],
  );

  const bgStyle = bgToCss(background);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* 3D viewport */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ background: bgStyle }}
      >
        {/* Top nav bar */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/40 to-transparent pointer-events-none">
          <Link
            href="/"
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white/70 hover:text-white backdrop-blur-sm transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Home
          </Link>

          <div className="pointer-events-auto flex items-center gap-1.5">
            <Flame className="h-5 w-5 text-brand-400" />
            <span className="font-semibold text-white text-sm tracking-wide">
              Dragon Drop Covers
            </span>
          </div>

          <div className="pointer-events-auto rounded-full border border-brand-700/50 bg-black/30 px-3 py-1 text-xs text-brand-300 backdrop-blur-sm">
            Free
          </div>
        </div>

        {/* Scene */}
        <Suspense fallback={<SceneFallback />}>
          <BookScene onReady={handleSceneReady} />
        </Suspense>
      </div>

      {/* Side panel */}
      <SidePanel onExport={handleExport} onResetCamera={handleResetCamera} />
    </div>
  );
}
