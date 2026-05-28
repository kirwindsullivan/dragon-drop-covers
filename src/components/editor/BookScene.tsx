"use client";

// [Sessions 1–5] 3D book scene: procedural geometry, OrbitControls, export.
// [v2.1 Phase 1] Additions — nothing removed:
//   Part 1: tex.flipY = true (was false) + ClampToEdgeWrapping
//   Part 2: polar angle limits; smooth 600ms camera animation for reset
//   Part 3: camera preset animation via _cameraAnimVersion / activeCameraPreset store
//   Part 4: Environment "studio" HDRI; dynamic toneMappingExposure via hdriIntensity
//   Part 5: MeshPhysicalMaterial traversal + applyFinish on finish change
//   Part 6: Atmospheric effects — Mist (FogExp2), Dust, Rain (Points systems)
// [v2.1 Phase 2] GLTF model integration:
//   • useBookModel hook replaces GlbBook + BookModel placeholder components
//   • ProceduralBook kept as fallback on GLB load error
//   • Loading overlay shown during model load / size switch
//   • WATERMARK_COVER_LOCAL moved to constants.ts for easy tuning
//   • All Phase 1 features (lighting, HDRI, atmospheric effects, camera) unchanged

import { Suspense, useRef, useEffect, useState, useCallback, useLayoutEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  PerspectiveCamera,
  Environment,
} from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { useEditorStore } from "@/store/editorStore";
import { padToLightPosition } from "@/lib/three/lightingMath";
import { buildProceduralBook } from "@/lib/three/bookGeometry";
import {
  generateSpineTexture,
  generateBackTexture,
} from "@/lib/three/spineGenerator";
import { SAFE_ZONE_PADDING, CAMERA_PRESETS, WATERMARK_COVER_LOCAL } from "@/lib/constants";
import { applyFinish } from "@/utils/applyFinish";
import { useBookModel } from "@/hooks/useBookModel";
import type { BookSize, FinishType } from "@/types";

// [v2.1 Phase 2] MODEL_PATHS stub removed — useBookModel + MODEL_MAP in constants.ts
// handles all routing.  ProceduralBook below remains as GLB-error fallback.

// ─── Procedural book component ───────────────────────────────────────────────
function ProceduralBook({
  size,
  coverUrl,
  spineTitle,
  finish,
  onGroupReady,
}: {
  size: BookSize;
  coverUrl: string | null;
  spineTitle: string;
  finish: FinishType;
  onGroupReady?: (g: THREE.Group) => void;
}) {
  const [group, setGroup] = useState<THREE.Group | null>(null);
  // Ref for live material updates (finish change) without rebuild
  const groupRef = useRef<THREE.Group | null>(null);

  // Keep a stable ref to the callback so the useEffect dep array stays clean
  const onGroupReadyRef = useRef(onGroupReady);
  useEffect(() => { onGroupReadyRef.current = onGroupReady; });

  useEffect(() => {
    let coverTex: THREE.Texture | null = null;
    let spineTex: THREE.Texture | null = null;
    let backTex: THREE.Texture | null = null;

    const loader = new THREE.TextureLoader();
    const build = () => {
      const g = buildProceduralBook(size, coverTex, spineTex, backTex);
      // [v2.1 Part 5] Apply current finish to all named cover materials on build
      g.traverse((node) => {
        if (!(node as THREE.Mesh).isMesh) return;
        const mesh = node as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if (
            m instanceof THREE.MeshPhysicalMaterial &&
            (m.name === "cover" || m.name === "spine" || m.name === "back")
          ) {
            applyFinish(m, finish);
          }
        });
      });
      groupRef.current = g;
      setGroup(g);
      onGroupReadyRef.current?.(g);
    };

    if (coverUrl) {
      loader.load(
        coverUrl,
        (tex) => {
          // [v2.1 Part 1] flipY true (was false) — corrects upside-down images.
          // Standard UV mapping expects origin at bottom-left; flipY=true matches that.
          tex.flipY   = true;
          tex.wrapS   = THREE.ClampToEdgeWrapping; // [v2.1 Part 1] prevent tiling artifacts
          tex.wrapT   = THREE.ClampToEdgeWrapping;
          tex.colorSpace = THREE.SRGBColorSpace;
          coverTex = tex;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const spineCanvas = generateSpineTexture(img, spineTitle, 128, 512);
            const backCanvas = generateBackTexture(img, 512, 720);
            spineTex = new THREE.CanvasTexture(spineCanvas);
            spineTex.colorSpace = THREE.SRGBColorSpace;
            backTex = new THREE.CanvasTexture(backCanvas);
            backTex.colorSpace = THREE.SRGBColorSpace;
            build();
          };
          img.onerror = () => build();
          img.src = coverUrl;
        },
        undefined,
        () => build(),
      );
    } else {
      build();
    }

    return () => {
      [coverTex, spineTex, backTex].forEach((t) => t?.dispose());
    };
  // Intentionally excludes `finish` — finish updates are handled in the effect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverUrl, size, spineTitle]);

  // [v2.1 Part 5] Live finish update — traverse without rebuild
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.traverse((node) => {
      if (!(node as THREE.Mesh).isMesh) return;
      const mesh = node as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        if (
          m instanceof THREE.MeshPhysicalMaterial &&
          (m.name === "cover" || m.name === "spine" || m.name === "back")
        ) {
          applyFinish(m, finish);
        }
      });
    });
  }, [finish]);

  if (!group) return null;
  group.rotation.set(-0.05, 0.55, 0.0);
  return <primitive object={group} />;
}

// GlbBook and BookModel removed — replaced by useBookModel hook + <primitive> in BookScene.
// ProceduralBook above is the fallback rendered when the GLB fails to load.

// ─── Dynamic lighting ─────────────────────────────────────────────────────────
function DynamicLight() {
  const lighting = useEditorStore((s) => s.lighting);
  const keyRef = useRef<THREE.PointLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);

  useFrame(() => {
    if (keyRef.current) {
      const pos = padToLightPosition(lighting.padX, lighting.padY);
      keyRef.current.position.copy(pos);
      keyRef.current.intensity = lighting.pointIntensity;
    }
    if (ambRef.current) {
      ambRef.current.intensity = lighting.ambientIntensity;
    }
  });

  return (
    <>
      {/* [v2.1] Default ambientIntensity reduced to 0.35 (60% of original 0.6)
          so HDRI + point light together feel balanced */}
      <ambientLight ref={ambRef} intensity={lighting.ambientIntensity} color="#d0c0ff" />
      <pointLight
        ref={keyRef}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
        color="#fff8f0"
        intensity={lighting.pointIntensity}
        decay={1.5}
        distance={15}
      />
      <pointLight position={[-2, 0.5, -1.5]} color="#6080ff" intensity={0.6} decay={2} distance={10} />
    </>
  );
}

// ─── Camera controller with smooth animation ──────────────────────────────────
// [v2.1] Replaces the teleport-on-reset with 600ms linear interpolation.
// Handles both reset-to-hero and preset animations via `animTarget` prop.

interface AnimTarget {
  toPosition: THREE.Vector3;
  toTarget:   THREE.Vector3;
  startTime:  number;  // performance.now() at animation start
  duration:   number;  // ms
}

function CameraController({
  controlsRef,
  animTarget,
  onAnimComplete,
}: {
  controlsRef:    React.RefObject<OrbitControlsImpl | null>;
  animTarget:     AnimTarget | null;
  onAnimComplete: () => void;
}) {
  const { camera } = useThree();

  // Refs to avoid stale closures in useFrame
  const animRef    = useRef<AnimTarget | null>(animTarget);
  const fromPos    = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const captured   = useRef(false);
  const done       = useRef(false);

  // Keep animRef and capture flags in sync with incoming prop changes
  useLayoutEffect(() => {
    animRef.current = animTarget;
    captured.current = false;
    done.current     = false;
  }, [animTarget]);

  useFrame(() => {
    const anim     = animRef.current;
    const controls = controlsRef.current;
    if (!anim || !controls || done.current) return;

    // Snapshot starting position on the very first frame of this animation
    if (!captured.current) {
      fromPos.current.copy(camera.position);
      fromTarget.current.copy(controls.target);
      captured.current = true;
    }

    const elapsed = performance.now() - anim.startTime;
    const t       = Math.min(elapsed / anim.duration, 1);

    camera.position.lerpVectors(fromPos.current, anim.toPosition, t);
    controls.target.lerpVectors(fromTarget.current, anim.toTarget, t);
    controls.update();

    if (t >= 1) {
      done.current = true;
      onAnimComplete();
    }
  });

  return null;
}

// ─── Atmospheric effects — Mist, Dust, Rain ───────────────────────────────────
// [v2.1 Part 6] All effects live inside the <Canvas> so they appear in exports.
// Each effect is fully self-contained and disposes resources on disable.

/** Mist: THREE.FogExp2 whose density tracks the intensity slider */
function SceneMist({
  enabled,
  intensity,
  bgColor,
}: {
  enabled:   boolean;
  intensity: number;
  bgColor:   string;
}) {
  const { scene } = useThree();

  useEffect(() => {
    if (!enabled) {
      scene.fog = null;
      return;
    }
    const density = (intensity / 100) * 0.08;
    scene.fog = new THREE.FogExp2(new THREE.Color(bgColor), density);
    return () => { scene.fog = null; };
  }, [enabled, intensity, bgColor, scene]);

  return null;
}

/** Shared helper: creates a random-fill Float32Array for particle positions */
function randomPositions(count: number, spread: number): Float32Array {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3]     = (Math.random() - 0.5) * spread;
    arr[i * 3 + 1] = (Math.random() - 0.5) * (spread * 0.75);
    arr[i * 3 + 2] = (Math.random() - 0.5) * spread;
  }
  return arr;
}

/** Dust: 800 slow-rising warm-gold particles */
function SceneDust({ enabled, intensity }: { enabled: boolean; intensity: number }) {
  const { scene } = useThree();
  const pointsRef = useRef<THREE.Points | null>(null);
  const velRef    = useRef<Float32Array | null>(null);
  const COUNT     = 800;

  useEffect(() => {
    if (!enabled) {
      if (pointsRef.current) {
        scene.remove(pointsRef.current);
        pointsRef.current.geometry.dispose();
        (pointsRef.current.material as THREE.Material).dispose();
        pointsRef.current = null;
      }
      return;
    }

    const positions  = randomPositions(COUNT, 10);
    const velocities = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      velocities[i * 3]     = (Math.random() - 0.5) * 0.008;
      velocities[i * 3 + 1] = 0.004 + Math.random() * 0.008; // upward drift
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.008;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));

    const mat = new THREE.PointsMaterial({
      color:           new THREE.Color("#ffd580"),
      size:            0.025 + (intensity / 100) * 0.025,
      transparent:     true,
      opacity:         0.25 + (intensity / 100) * 0.35,
      sizeAttenuation: true,
      depthWrite:      false,
    });

    const pts = new THREE.Points(geo, mat);
    velRef.current    = velocities;
    pointsRef.current = pts;
    scene.add(pts);

    return () => {
      scene.remove(pts);
      geo.dispose();
      mat.dispose();
      pointsRef.current = null;
    };
  // Re-create geometry when enabled state or intensity changes meaningfully
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intensity, scene]);

  useFrame(() => {
    const pts = pointsRef.current;
    const vel = velRef.current;
    if (!pts || !vel) return;

    const pos = pts.geometry.attributes.position;
    const arr = pos.array as Float32Array;

    for (let i = 0; i < COUNT; i++) {
      arr[i * 3]     += vel[i * 3];
      arr[i * 3 + 1] += vel[i * 3 + 1];
      arr[i * 3 + 2] += vel[i * 3 + 2];

      // Wrap: reset to bottom when particle drifts out of volume
      if (arr[i * 3 + 1] > 3.5) {
        arr[i * 3]     = (Math.random() - 0.5) * 10;
        arr[i * 3 + 1] = -3.5;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 10;
      }
    }
    pos.needsUpdate = true;
  });

  return null;
}

/** Rain: 1200 fast-falling cool-blue streaks */
function SceneRain({ enabled, intensity }: { enabled: boolean; intensity: number }) {
  const { scene } = useThree();
  const pointsRef = useRef<THREE.Points | null>(null);
  const velRef    = useRef<Float32Array | null>(null);
  const COUNT     = 1200;

  useEffect(() => {
    if (!enabled) {
      if (pointsRef.current) {
        scene.remove(pointsRef.current);
        pointsRef.current.geometry.dispose();
        (pointsRef.current.material as THREE.Material).dispose();
        pointsRef.current = null;
      }
      return;
    }

    const positions  = randomPositions(COUNT, 10);
    const velocities = new Float32Array(COUNT * 3);
    const speedScale = 0.5 + (intensity / 100) * 1.0;
    for (let i = 0; i < COUNT; i++) {
      velocities[i * 3]     = 0.005 * speedScale;            // slight angle
      velocities[i * 3 + 1] = -(0.04 + Math.random() * 0.04) * speedScale; // downward
      velocities[i * 3 + 2] = 0.002 * speedScale;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));

    const mat = new THREE.PointsMaterial({
      color:           new THREE.Color("#c8d8ff"),
      size:            0.015 + (intensity / 100) * 0.015,
      transparent:     true,
      opacity:         0.18 + (intensity / 100) * 0.32,
      sizeAttenuation: true,
      depthWrite:      false,
    });

    const pts = new THREE.Points(geo, mat);
    velRef.current    = velocities;
    pointsRef.current = pts;
    scene.add(pts);

    return () => {
      scene.remove(pts);
      geo.dispose();
      mat.dispose();
      pointsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intensity, scene]);

  useFrame(() => {
    const pts = pointsRef.current;
    const vel = velRef.current;
    if (!pts || !vel) return;

    const pos = pts.geometry.attributes.position;
    const arr = pos.array as Float32Array;

    for (let i = 0; i < COUNT; i++) {
      arr[i * 3]     += vel[i * 3];
      arr[i * 3 + 1] += vel[i * 3 + 1];
      arr[i * 3 + 2] += vel[i * 3 + 2];

      // Wrap: reset to top when raindrop exits volume
      if (arr[i * 3 + 1] < -3.5) {
        arr[i * 3]     = (Math.random() - 0.5) * 10;
        arr[i * 3 + 1] = 3.5;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 10;
      }
    }
    pos.needsUpdate = true;
  });

  return null;
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [header, base64] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
    const bstr = atob(base64);
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    return new Blob([u8], { type: mime });
  } catch {
    return null;
  }
}

function cropCenter(
  blob: Blob,
  srcW: number, srcH: number,
  dstW: number, dstH: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); resolve(blob); return; }
      const sx = Math.round((srcW - dstW) / 2);
      const sy = Math.round((srcH - dstH) / 2);
      ctx.drawImage(img, sx, sy, dstW, dstH, 0, 0, dstW, dstH);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

// [v2.1 Phase 2] WATERMARK_COVER_LOCAL moved to constants.ts for easy tuning.

// ─── Main scene export ────────────────────────────────────────────────────────
export interface BookSceneHandle {
  captureFrame: (width: number, height: number) => Promise<Blob | null>;
  resetCamera: () => void;
  getWatermarkPosition: (exportW: number, exportH: number) => { x: number; y: number } | null;
}

export function BookScene({ onReady }: { onReady?: (handle: BookSceneHandle) => void }) {
  const bookSize    = useEditorStore((s) => s.bookSize);
  const coverUrl    = useEditorStore((s) => s.coverImageUrl);
  const spineTitle  = useEditorStore((s) => s.spineTitle);
  const autoRotate  = useEditorStore((s) => s.autoRotate);
  const photo       = useEditorStore((s) => s.photo);
  const finish      = useEditorStore((s) => s.finish);
  const hdriIntensity      = useEditorStore((s) => s.hdriIntensity);
  const atmosphericEffect  = useEditorStore((s) => s.atmosphericEffect);
  const atmosphericIntensity = useEditorStore((s) => s.atmosphericIntensity);
  const background         = useEditorStore((s) => s.background);
  // [v2.1 Part 3] Camera preset animation via store
  const cameraAnimVersion  = useEditorStore((s) => s._cameraAnimVersion);
  const activeCameraPreset = useEditorStore((s) => s.activeCameraPreset);
  const setActiveCameraPreset = useEditorStore((s) => s.setActiveCameraPreset);
  const animateCamera      = useEditorStore((s) => s.animateCamera);

  // [v2.1 Phase 2] GLTF model loading via hook (called outside Canvas — no R3F context needed)
  const {
    group:         gltfGroup,
    isLoading:     gltfLoading,
    error:         gltfError,
  } = useBookModel(bookSize, coverUrl, spineTitle, finish);

  const controlsRef   = useRef<OrbitControlsImpl>(null);
  const glRef         = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef      = useRef<THREE.Scene | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const bookGroupRef  = useRef<THREE.Group | null>(null);
  const animatingRef  = useRef(false);

  // Keep bookGroupRef in sync with whichever model is active (GLTF or procedural fallback)
  useEffect(() => {
    if (gltfGroup) bookGroupRef.current = gltfGroup;
  }, [gltfGroup]);

  // [v2.1 Part 2/3] Camera animation target (drives CameraController)
  const [animTarget, setAnimTarget] = useState<AnimTarget | null>(null);

  // Keep a snapshot of activeCameraPreset in a ref so the animVersion effect
  // can read it without listing it as a dep (avoids spurious re-triggers)
  const activeCameraPresetRef = useRef(activeCameraPreset);
  useLayoutEffect(() => { activeCameraPresetRef.current = activeCameraPreset; });

  // [v2.1 Part 3] Trigger animation when store says so (cameraAnimVersion changed)
  const prevVersionRef = useRef(0);
  useEffect(() => {
    if (cameraAnimVersion <= 0 || cameraAnimVersion === prevVersionRef.current) return;
    prevVersionRef.current = cameraAnimVersion;

    const presetId = activeCameraPresetRef.current;
    if (!presetId) return;
    const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    animatingRef.current = true;
    setAnimTarget({
      toPosition: new THREE.Vector3(...preset.position),
      toTarget:   new THREE.Vector3(...preset.target),
      startTime:  performance.now(),
      duration:   600,
    });
  }, [cameraAnimVersion]);

  const handleAnimComplete = useCallback(() => {
    animatingRef.current = false;
    setAnimTarget(null);
  }, []);

  // [v2.1] resetCamera now uses the store-based animation (smooth 600ms)
  const resetCamera = useCallback(() => {
    animateCamera("hero");
  }, [animateCamera]);

  const handleBookGroupReady = useCallback((g: THREE.Group) => {
    bookGroupRef.current = g;
  }, []);

  // [v2.1 Part 4] Keep toneMappingExposure in sync with hdriIntensity slider
  useEffect(() => {
    if (glRef.current) {
      glRef.current.toneMappingExposure = hdriIntensity;
    }
  }, [hdriIntensity]);

  const getWatermarkPosition = useCallback((exportW: number, exportH: number): { x: number; y: number } | null => {
    const renderer = glRef.current;
    const cam      = cameraRef.current;
    const group    = bookGroupRef.current;
    if (!renderer || !cam || !group) return null;

    const prevSize = renderer.getSize(new THREE.Vector2());
    if (prevSize.x === 0 || prevSize.y === 0) return null;

    const previewAspect = prevSize.x / prevSize.y;
    const targetAspect  = exportW / exportH;
    let renderW: number, renderH: number;
    if (previewAspect >= targetAspect) {
      renderH = Math.round(exportH / SAFE_ZONE_PADDING);
      renderW = Math.round(renderH * previewAspect);
    } else {
      renderW = Math.round(exportW / SAFE_ZONE_PADDING);
      renderH = Math.round(renderW / previewAspect);
    }

    const worldPoint = new THREE.Vector3(...WATERMARK_COVER_LOCAL);
    group.updateWorldMatrix(true, false);
    worldPoint.applyMatrix4(group.matrixWorld);
    worldPoint.project(cam);

    if (worldPoint.z > 1) return null;

    const screenX = (worldPoint.x * 0.5 + 0.5) * renderW;
    const screenY = (-worldPoint.y * 0.5 + 0.5) * renderH;
    const sx = Math.round((renderW - exportW) / 2);
    const sy = Math.round((renderH - exportH) / 2);
    const x  = Math.round(screenX - sx);
    const y  = Math.round(screenY - sy);

    if (x < 0 || x > exportW || y < 0 || y > exportH) {
      console.warn("[watermark] cover point outside export canvas — using static fallback");
      return null;
    }

    return { x, y };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureFrame = useCallback(async (width: number, height: number): Promise<Blob | null> => {
    const renderer = glRef.current;
    const scene    = sceneRef.current;
    const cam      = cameraRef.current;
    if (!renderer || !scene || !cam) return null;

    const prevSize       = renderer.getSize(new THREE.Vector2());
    const prevPixelRatio = renderer.getPixelRatio();
    if (prevSize.x === 0 || prevSize.y === 0) return null;

    const previewAspect = prevSize.x / prevSize.y;
    const targetAspect  = width / height;
    let renderW: number;
    let renderH: number;
    if (previewAspect >= targetAspect) {
      renderH = Math.round(height / SAFE_ZONE_PADDING);
      renderW = Math.round(renderH * previewAspect);
    } else {
      renderW = Math.round(width / SAFE_ZONE_PADDING);
      renderH = Math.round(renderW / previewAspect);
    }

    renderer.setPixelRatio(1);
    renderer.setSize(renderW, renderH, false);
    renderer.render(scene, cam);

    const dataUrl = renderer.domElement.toDataURL("image/png");

    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);

    const rawBlob = dataUrlToBlob(dataUrl);
    if (!rawBlob) return null;

    if (renderW === width && renderH === height) return rawBlob;
    return cropCenter(rawBlob, renderW, renderH, width, height);
  }, []);

  useEffect(() => {
    onReady?.({ captureFrame, resetCamera, getWatermarkPosition });
  }, [onReady, captureFrame, resetCamera, getWatermarkPosition]);

  const filterStyle = [
    `brightness(${1 + photo.brightness})`,
    `contrast(${1 + photo.contrast})`,
    `saturate(${1 + photo.saturation})`,
  ].join(" ");

  // Extract dominant background color for mist fog
  const bgMainColor = background.value ?? "#000000";

  return (
    <div className="relative w-full h-full" style={{ filter: filterStyle }}>
      {photo.vignette > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,${photo.vignette}) 100%)`,
          }}
        />
      )}

      {/* [v2.1 Phase 2] GLB loading overlay — semi-transparent, non-blocking */}
      {gltfLoading && (
        <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-8 w-8 animate-spin text-brand-400"
              viewBox="0 0 24 24" fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 100 10z" />
            </svg>
            <p className="text-sm font-medium text-brand-200">Loading model…</p>
          </div>
        </div>
      )}

      {/* [v2.1 Phase 2] GLB error toast — shown when fallback is active */}
      {gltfError && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-[15] -translate-x-1/2 rounded-lg border border-amber-700/40 bg-amber-950/80 px-4 py-2 text-xs text-amber-300">
          Using preview mode — model unavailable
        </div>
      )}

      <Canvas
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
        shadows
        dpr={[1, 2]}
        onCreated={({ gl, scene, camera }) => {
          glRef.current    = gl;
          sceneRef.current = scene;
          cameraRef.current = camera as THREE.PerspectiveCamera;
          gl.toneMapping         = THREE.ACESFilmicToneMapping;
          // [v2.1 Part 4] Default exposure; will be overridden by hdriIntensity effect
          gl.toneMappingExposure = hdriIntensity;
          gl.outputColorSpace    = THREE.SRGBColorSpace;
        }}
      >
        <PerspectiveCamera makeDefault position={[0.8, 1.4, 6.5]} fov={32} near={0.01} far={100} />

        {/* [v2.1 Part 2/3] Smooth camera animation controller */}
        <CameraController
          controlsRef={controlsRef}
          animTarget={animTarget}
          onAnimComplete={handleAnimComplete}
        />

        {/* [v2.1 Part 2] Added polar angle limits; dampingFactor tuned */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          autoRotate={autoRotate}
          autoRotateSpeed={0.8}
          enableDamping
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={12}
          minPolarAngle={Math.PI * 0.1}
          maxPolarAngle={Math.PI * 0.9}
          onChange={() => {
            // Clear active preset highlight when user manually orbits
            if (!animatingRef.current) {
              setActiveCameraPreset(null);
            }
          }}
        />

        <DynamicLight />

        {/* [v2.1 Part 4] Studio HDRI — provides PBR reflections and ambient fill.
            Replaces the earlier "night" preset.  environmentIntensity is a
            moderate fixed value; overall brightness is controlled via
            renderer.toneMappingExposure (hdriIntensity slider in LightingControls).
            Phase 2 note: swap files="/hdri/studio_small_08_1k.hdr" for local HDRI. */}
        <Suspense fallback={null}>
          <Environment
            preset="studio"
            environmentIntensity={0.5}
            backgroundIntensity={0}
          />
        </Suspense>

        <ContactShadows
          position={[0, -1.15, 0]}
          opacity={0.5}
          scale={5}
          blur={1.8}
          far={2.5}
        />

        {/* [v2.1 Phase 2] GLTF model (primary) or ProceduralBook (GLB error fallback).
            gltfGroup is created outside the Canvas by useBookModel and added to the
            R3F scene graph via <primitive>.  bookGroupRef tracks whichever is active
            for watermark projection; see useEffect above. */}
        {gltfGroup && !gltfError && (
          <primitive object={gltfGroup} />
        )}
        {(!gltfGroup || gltfError) && !gltfLoading && (
          <ProceduralBook
            size={bookSize}
            coverUrl={coverUrl}
            spineTitle={spineTitle}
            finish={finish}
            onGroupReady={handleBookGroupReady}
          />
        )}

        {/* [v2.1 Part 6] Atmospheric effects — only the active one renders */}
        <SceneMist
          enabled={atmosphericEffect === "mist"}
          intensity={atmosphericIntensity}
          bgColor={bgMainColor}
        />
        <SceneDust
          enabled={atmosphericEffect === "dust"}
          intensity={atmosphericIntensity}
        />
        <SceneRain
          enabled={atmosphericEffect === "rain"}
          intensity={atmosphericIntensity}
        />
      </Canvas>
    </div>
  );
}
