"use client";

import { useRef, useCallback, Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
import { useAutoSave } from "@/hooks/useAutoSave";
import type { ExportMode, BackgroundPreset, LightingState, PhotoAdjustments, FinishType, AtmosphericEffectType } from "@/types";
import type { BookSceneHandle } from "@/components/editor/BookScene";
import type { ProjectMeta } from "@/lib/projects/types";

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
// Thin wrapper whose only job is to pass `key={userId}` to BuilderContent.
// When the authenticated user changes (e.g. logout → login without a full
// page reload) this forces a complete unmount + remount of the entire builder
// tree, guaranteeing every component — including SafeZoneOverlay — starts clean.
export default function BuilderPage() {
  const { userId, isLoaded } = useAuth();
  const params    = useParams();
  const projectId = params.projectId as string;

  // Wait for Clerk to resolve the session before mounting the builder.
  // This prevents a brief flash where userId is null (which would cause an
  // immediate remount once Clerk resolves, resetting in-progress state).
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Flame className="h-10 w-10 text-brand-500 animate-pulse" />
      </div>
    );
  }

  return <BuilderContent key={userId ?? "unauthenticated"} projectId={projectId} />;
}

// ── Builder content ────────────────────────────────────────────────────────────
// Contains all editor state and layout.  Receives a stable key from BuilderPage
// so it remounts cleanly whenever the authenticated user changes.

function BuilderContent({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Editor store setters — used to hydrate state from saved project
  const setCoverImage          = useEditorStore((s) => s.setCoverImage);
  const setBackground          = useEditorStore((s) => s.setBackground);
  const setLighting            = useEditorStore((s) => s.setLighting);
  const setPhoto               = useEditorStore((s) => s.setPhoto);
  const setBookSize            = useEditorStore((s) => s.setBookSize);
  const setTextOverlay         = useEditorStore((s) => s.setTextOverlay);
  const setProjectId           = useEditorStore((s) => s.setProjectId);
  const setProjectTier         = useEditorStore((s) => s.setProjectTier);
  const resetEditorState       = useEditorStore((s) => s.resetEditorState);
  // [v2.1] New scene settings
  const setFinish              = useEditorStore((s) => s.setFinish);
  const setHdriIntensity       = useEditorStore((s) => s.setHdriIntensity);
  const setAtmosphericEffect   = useEditorStore((s) => s.setAtmosphericEffect);
  const setAtmosphericIntensity = useEditorStore((s) => s.setAtmosphericIntensity);
  const animateCamera          = useEditorStore((s) => s.animateCamera);

  const background = useEditorStore((s) => s.background);

  // Load project metadata and hydrate editor store
  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/projects/${projectId}`);
        if (!r.ok) throw new Error(`${r.status}`);
        const meta: ProjectMeta = await r.json();

        setProject(meta);

        // Reset ALL editor state to defaults before hydrating — this ensures cover,
        // lighting, active panel, etc. never bleed through from a previous project.
        resetEditorState();

        // Tell the store which project we're in so CoverDropzone, ExportPanel, etc.
        // use the right tier and API route.
        setProjectId(projectId);
        setProjectTier(meta.tier);

        // Hydrate editor store from saved settings
        setBookSize(meta.bookSize);

        if (meta.settings?.background && Object.keys(meta.settings.background).length > 0) {
          // Cast is unavoidable — settings are stored as Record<string, unknown>
          setBackground(meta.settings.background as unknown as BackgroundPreset);
        }

        if (meta.settings?.lighting && Object.keys(meta.settings.lighting).length > 0) {
          setLighting(meta.settings.lighting as unknown as Partial<LightingState>);
        }

        if (meta.settings?.adjustments && Object.keys(meta.settings.adjustments).length > 0) {
          setPhoto(meta.settings.adjustments as unknown as Partial<PhotoAdjustments>);
        }

        if (meta.settings?.overlayTitle || meta.settings?.overlayTagline) {
          setTextOverlay({
            title: meta.settings.overlayTitle ?? "",
            tagline: meta.settings.overlayTagline ?? "",
          });
        }

        // [v2.1] Hydrate new scene settings
        if (meta.settings?.finish) {
          setFinish(meta.settings.finish as FinishType);
        }
        if (meta.settings?.hdriIntensity != null) {
          setHdriIntensity(meta.settings.hdriIntensity);
        }
        if (meta.settings?.atmosphericEffect) {
          setAtmosphericEffect(meta.settings.atmosphericEffect as AtmosphericEffectType);
        }
        if (meta.settings?.atmosphericIntensity != null) {
          setAtmosphericIntensity(meta.settings.atmosphericIntensity);
        }
        if (meta.settings?.activeCameraPreset) {
          animateCamera(meta.settings.activeCameraPreset);
        }

        if (meta.coverKey) {
          // Fetch the cover through our own API route — this proxies it server-side
          // so the browser receives it from the same origin as a blob, bypassing R2
          // CORS restrictions that prevent Three.js loading it as a WebGL texture.
          try {
            const resp = await fetch(`/api/projects/${projectId}/cover`);
            if (resp.ok) {
              const blob = await resp.blob();
              setCoverImage(URL.createObjectURL(blob), null, meta.coverKey);
            }
            // If the request fails, leave cover null — model renders without texture
          } catch {
            // Network error — model renders without texture
          }
        }

        setLoading(false);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    }
    void load();
  }, [projectId, resetEditorState, setCoverImage, setBackground, setLighting, setPhoto, setBookSize, setTextOverlay, setProjectId, setProjectTier, setFinish, setHdriIntensity, setAtmosphericEffect, setAtmosphericIntensity, animateCamera]);

  // Reset everything when leaving the builder so the standalone editor (and the
  // next project) start clean.
  useEffect(() => {
    return () => {
      resetEditorState();
      setProjectId(null);
      setProjectTier(null);
    };
  }, [resetEditorState, setProjectId, setProjectTier]);

  // 5-second debounced auto-save
  useAutoSave(projectId);

  // 3D scene handle
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

  const handleGetWatermarkPosition = useCallback(
    (w: number, h: number) => sceneHandleRef.current?.getWatermarkPosition(w, h) ?? null,
    [],
  );

  // ── Loading / error states ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Flame className="h-10 w-10 text-brand-500 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center gap-3 bg-black text-white">
        <span>Error: {error}</span>
        <Link href="/dashboard" className="underline text-brand-400">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* 3D viewport */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ background: bgToCss(background) }}
      >
        {/* Top nav */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/40 to-transparent pointer-events-none">
          <Link
            href="/dashboard"
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white/70 hover:text-white backdrop-blur-sm transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Projects
          </Link>

          <div className="pointer-events-auto flex items-center gap-1.5">
            <Flame className="h-5 w-5 text-brand-400" />
            <span className="font-semibold text-white text-sm tracking-wide">
              {project?.name ?? "Builder"}
            </span>
          </div>

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
      <SidePanel onExport={handleExport} getWatermarkPosition={handleGetWatermarkPosition} />
    </div>
  );
}
