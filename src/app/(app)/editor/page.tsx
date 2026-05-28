"use client";

import { useRef, useCallback, Suspense, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft, Flame } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { SidePanel } from "@/components/editor/SidePanel";
import { SafeZoneOverlay } from "@/components/editor/SafeZoneOverlay";
import { TextOverlayCanvas } from "@/components/editor/TextOverlayCanvas";
import { UserMenu } from "@/components/auth/UserMenu";
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

// ── Outer page shell ──────────────────────────────────────────────────────────
// Thin wrapper whose only job is to pass `key={userId}` to EditorContent.
// When the authenticated user changes (e.g. logout → login without a full
// page reload) this forces a complete unmount + remount of the editor tree,
// guaranteeing the Zustand store is reset before the new user's session begins.
export default function EditorPage() {
  const { userId, isLoaded } = useAuth();

  // Wait for Clerk to resolve before mounting — prevents a brief flash where
  // userId is null (which would cause an immediate remount once Clerk resolves).
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Flame className="h-10 w-10 text-brand-500 animate-pulse" />
      </div>
    );
  }

  return <EditorContent key={userId ?? "unauthenticated"} />;
}

// ── Editor content ────────────────────────────────────────────────────────────
// Contains all editor state and layout.  Receives a stable key from EditorPage
// so it remounts cleanly whenever the authenticated user changes.

function EditorContent() {
  const background      = useEditorStore((s) => s.background);
  const resetEditorState = useEditorStore((s) => s.resetEditorState);

  // On first load, ensure new users get their default "free" tier persisted
  // in Clerk's publicMetadata (fire-and-forget; the UI defaults to "free" anyway)
  useEffect(() => {
    fetch("/api/set-default-tier", { method: "POST" }).catch(() => {});
  }, []);

  // Reset everything when leaving the standalone editor so the next user (or
  // the same user after a re-login) starts clean.  CoverDropzone's restore
  // effect re-loads the correct cover from localStorage on remount.
  useEffect(() => {
    return () => {
      resetEditorState();
    };
  }, [resetEditorState]);

  const sceneHandleRef = useRef<BookSceneHandle | null>(null);

  const handleSceneReady = useCallback((handle: BookSceneHandle) => {
    sceneHandleRef.current = handle;
  }, []);

  const handleExport = useCallback(
    async (width: number, height: number, _mode: ExportMode): Promise<Blob | null> => {
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

          {/* User menu — replaces the static "Free" badge */}
          <div className="pointer-events-auto">
            <UserMenu />
          </div>
        </div>

        {/* Scene */}
        <Suspense fallback={<SceneFallback />}>
          <BookScene onReady={handleSceneReady} />
        </Suspense>

        {/* [v2.1 Part 7] Text overlay canvas — z-[5], pointer-events none, excluded from exports */}
        <TextOverlayCanvas />

        {/* Safe zone overlay — HTML canvas, never captured by Three.js export — z-[10] */}
        <SafeZoneOverlay />
      </div>

      {/* Side panel */}
      <SidePanel onExport={handleExport} />
    </div>
  );
}
