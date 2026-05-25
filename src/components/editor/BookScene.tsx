"use client";

import { Suspense, useRef, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  useGLTF,
  PerspectiveCamera,
  Environment,
} from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { useEditorStore } from "@/store/editorStore";
import { padToLightPosition } from "@/lib/three/lightingMath";
import { buildProceduralBook, BOOK_DIMS } from "@/lib/three/bookGeometry";
import {
  generateSpineTexture,
  generateBackTexture,
} from "@/lib/three/spineGenerator";
import type { BookSize } from "@/types";

// ─── GLB model paths — drop a .glb here and it auto-maps ─────────────────────
const MODEL_PATHS: Partial<Record<BookSize, string>> = {
  // hardcover: "/models/hardcover.glb",
  // softcover: "/models/softcover.glb",
  // digest:    "/models/digest.glb",
  // zine:      "/models/zine.glb",
  // letter:    "/models/letter.glb",
};

// ─── Procedural book component ───────────────────────────────────────────────
function ProceduralBook({
  size,
  coverUrl,
  spineTitle,
}: {
  size: BookSize;
  coverUrl: string | null;
  spineTitle: string;
}) {
  const [group, setGroup] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let coverTex: THREE.Texture | null = null;
    let spineTex: THREE.Texture | null = null;
    let backTex: THREE.Texture | null = null;

    const loader = new THREE.TextureLoader();
    const build = () => {
      const g = buildProceduralBook(size, coverTex, spineTex, backTex);
      setGroup(g);
    };

    if (coverUrl) {
      loader.load(
        coverUrl,
        (tex) => {
          tex.flipY = false;
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
          // If the secondary image load fails (e.g. CORS or revoked URL), still
          // render the book with the cover texture — just without spine/back styling.
          img.onerror = () => build();
          img.src = coverUrl;
        },
        undefined,
        () => build(), // fallback on error
      );
    } else {
      build();
    }

    return () => {
      [coverTex, spineTex, backTex].forEach((t) => t?.dispose());
    };
  }, [coverUrl, size, spineTitle]);

  if (!group) return null;
  // Default 3/4 hero angle: spine toward camera-left, slight downward tilt from above
  group.rotation.set(-0.05, 0.55, 0.0);
  return <primitive object={group} />;
}

// ─── GLB-loaded book component ────────────────────────────────────────────────
function GlbBook({ path, coverUrl }: { path: string; coverUrl: string | null }) {
  const { scene } = useGLTF(path);
  const cloned = scene.clone(true);

  useEffect(() => {
    if (!coverUrl) return;
    const loader = new THREE.TextureLoader();
    loader.load(coverUrl, (tex) => {
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      cloned.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          const mesh = node as THREE.Mesh;
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (mat && (mat as THREE.MeshStandardMaterial).name?.toLowerCase().includes("cover")) {
            (mat as THREE.MeshStandardMaterial).map = tex;
            mat.needsUpdate = true;
          }
        }
      });
    });
  }, [coverUrl, cloned]);

  return <primitive object={cloned} />;
}

// ─── Book switcher ────────────────────────────────────────────────────────────
function BookModel({ size, coverUrl, spineTitle }: { size: BookSize; coverUrl: string | null; spineTitle: string }) {
  const glbPath = MODEL_PATHS[size];
  if (glbPath) return <GlbBook path={glbPath} coverUrl={coverUrl} />;
  return <ProceduralBook size={size} coverUrl={coverUrl} spineTitle={spineTitle} />;
}

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

// ─── Camera reset ─────────────────────────────────────────────────────────────
function CameraController({
  controlsRef,
  resetSignal,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  resetSignal: number;
}) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0.8, 1.4, 6.5);
    camera.lookAt(0, 0, 0);
    controlsRef.current?.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);
  return null;
}

// ─── Export crop helper ───────────────────────────────────────────────────────
/**
 * Center-crop a PNG blob from (srcW × srcH) to (dstW × dstH).
 * Uses a 2-D canvas drawImage call so there is no pixel resampling —
 * the source and destination coordinates are identical in size.
 */
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
      const sx = (srcW - dstW) / 2;
      const sy = (srcH - dstH) / 2;
      ctx.drawImage(img, sx, sy, dstW, dstH, 0, 0, dstW, dstH);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

// ─── Main scene export ────────────────────────────────────────────────────────
export interface BookSceneHandle {
  captureFrame: (width: number, height: number) => Promise<Blob | null>;
  resetCamera: () => void;
}

export function BookScene({ onReady }: { onReady?: (handle: BookSceneHandle) => void }) {
  const bookSize = useEditorStore((s) => s.bookSize);
  const coverUrl = useEditorStore((s) => s.coverImageUrl);
  const spineTitle = useEditorStore((s) => s.spineTitle);
  const autoRotate = useEditorStore((s) => s.autoRotate);
  const photo = useEditorStore((s) => s.photo);

  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const resetCamera = useCallback(() => setResetSignal((n) => n + 1), []);

  const captureFrame = useCallback(async (width: number, height: number): Promise<Blob | null> => {
    const renderer = glRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    if (!renderer || !scene || !cam) return null;

    // Save current state
    const prevSize = renderer.getSize(new THREE.Vector2());
    const prevPixelRatio = renderer.getPixelRatio();
    if (prevSize.x === 0 || prevSize.y === 0) return null;

    // Render at a resolution that PRESERVES the preview camera's aspect ratio so
    // the export matches exactly what the user sees in the viewport.  We then
    // center-crop the render down to the preset's target dimensions (1:1 pixels,
    // no resampling).  cam.aspect is intentionally left unchanged.
    const previewAspect = prevSize.x / prevSize.y;
    const targetAspect  = width / height;
    let renderW: number;
    let renderH: number;
    if (previewAspect >= targetAspect) {
      // Preview is wider than the target → height is the binding constraint
      renderH = height;
      renderW = Math.round(height * previewAspect);
    } else {
      // Preview is taller than the target → width is the binding constraint
      renderW = width;
      renderH = Math.round(width / previewAspect);
    }

    renderer.setPixelRatio(1);
    renderer.setSize(renderW, renderH, false);
    renderer.render(scene, cam);

    const rawBlob = await new Promise<Blob | null>((res) =>
      renderer.domElement.toBlob(res, "image/png"),
    );

    // Restore renderer (cam.aspect was never touched)
    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);

    if (!rawBlob) return null;
    // If dimensions already match (same aspect) skip the crop step
    if (renderW === width && renderH === height) return rawBlob;

    // Center-crop to exactly (width × height) — pixel-perfect, no scaling
    return cropCenter(rawBlob, renderW, renderH, width, height);
  }, []);

  useEffect(() => {
    onReady?.({ captureFrame, resetCamera });
  }, [onReady, captureFrame, resetCamera]);

  const filterStyle = [
    `brightness(${1 + photo.brightness})`,
    `contrast(${1 + photo.contrast})`,
    `saturate(${1 + photo.saturation})`,
  ].join(" ");

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

      <Canvas
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
        shadows
        dpr={[1, 2]}
        onCreated={({ gl, scene, camera }) => {
          glRef.current = gl;
          sceneRef.current = scene;
          cameraRef.current = camera as THREE.PerspectiveCamera;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.3;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <PerspectiveCamera makeDefault position={[0.8, 1.4, 6.5]} fov={32} near={0.01} far={100} />

        <CameraController controlsRef={controlsRef} resetSignal={resetSignal} />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          autoRotate={autoRotate}
          autoRotateSpeed={0.8}
          enableDamping
          dampingFactor={0.07}
          minDistance={1}
          maxDistance={12}
        />

        <DynamicLight />

        {/* HDRI for PBR reflections — in its own Suspense so it doesn't block the book */}
        <Suspense fallback={null}>
          <Environment preset="night" environmentIntensity={0.25} backgroundIntensity={0} />
        </Suspense>

        <ContactShadows
          position={[0, -1.15, 0]}
          opacity={0.5}
          scale={5}
          blur={1.8}
          far={2.5}
        />

        {/* Book — no Suspense so it mounts synchronously */}
        <BookModel size={bookSize} coverUrl={coverUrl} spineTitle={spineTitle} />
      </Canvas>
    </div>
  );
}
