"use client";

import { useRef, useCallback, Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft, Flame } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { SidePanel } from "@/components/editor/SidePanel";
import { UserMenu } from "@/components/auth/UserMenu";
import { bgToCss } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import type { ExportMode, BackgroundPreset, LightingState, PhotoAdjustments } from "@/types";
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

export default function BuilderPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor store setters — used to hydrate state from saved project
  const setCoverImage   = useEditorStore((s) => s.setCoverImage);
  const setBackground   = useEditorStore((s) => s.setBackground);
  const setLighting     = useEditorStore((s) => s.setLighting);
  const setPhoto        = useEditorStore((s) => s.setPhoto);
  const setBookSize     = useEditorStore((s) => s.setBookSize);
  const setTextOverlay  = useEditorStore((s) => s.setTextOverlay);
  const setProjectId    = useEditorStore((s) => s.setProjectId);
  const setProjectTier  = useEditorStore((s) => s.setProjectTier);

  const background = useEditorStore((s) => s.background);

  // Load project metadata and hydrate editor store
  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/projects/${projectId}`);
        if (!r.ok) throw new Error(`${r.status}`);
        const meta: ProjectMeta = await r.json();

        setProject(meta);

        // Tell the store which project we're in so CoverDropzone, ExportPanel, etc.
        // use the right tier and API route.
        setProjectId(projectId);
        setProjectTier(meta.tier);

        // Clear stale cover from any previous session before hydrating — without this,
        // navigating to a new (coverless) project would show the last project's cover.
        setCoverImage(null, null, null);

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

        if (meta.coverSignedUrl) {
          // Pre-fetch as blob so Three.js gets a same-origin blob URL.
          // Signed R2 URLs are cross-origin and fail silently as WebGL textures,
          // which is why the dropzone thumbnail showed but the 3D model stayed blank.
          try {
            const resp = await fetch(meta.coverSignedUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              const blobUrl = URL.createObjectURL(blob);
              setCoverImage(blobUrl, null, meta.coverKey);
            } else {
              // Fall back — at least the dropzone thumbnail will show
              setCoverImage(meta.coverSignedUrl, null, meta.coverKey);
            }
          } catch {
            setCoverImage(meta.coverSignedUrl, null, meta.coverKey);
          }
        }

        setLoading(false);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    }
    void load();
  }, [projectId, setCoverImage, setBackground, setLighting, setPhoto, setBookSize, setTextOverlay, setProjectId, setProjectTier]);

  // Clear project context when leaving the builder so the standalone editor
  // doesn't inherit project tier / ID from a previous visit.
  useEffect(() => {
    return () => {
      setProjectId(null);
      setProjectTier(null);
      setCoverImage(null, null, null);
    };
  }, [setCoverImage, setProjectId, setProjectTier]);

  // 5-second debounced auto-save
  useAutoSave(projectId);

  // 3D scene handle
  const sceneHandleRef = useRef<BookSceneHandle | null>(null);

  const handleSceneReady = useCallback((handle: BookSceneHandle) => {
    sceneHandleRef.current = handle;
  }, []);

  const handleResetCamera = useCallback(() => {
    sceneHandleRef.current?.resetCamera();
  }, []);

  const handleExport = useCallback(
    async (width: number, height: number, _mode: ExportMode): Promise<Blob | null> => {
      if (!sceneHandleRef.current) return null;
      return sceneHandleRef.current.captureFrame(width, height);
    },
    [],
  );

  // ── Loading / error states ─────────────────────────────────────────────────

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
      </div>

      {/* Side panel */}
      <SidePanel onExport={handleExport} onResetCamera={handleResetCamera} />
    </div>
  );
}
