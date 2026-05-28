"use client";

// [v2.1 Phase 2] useBookModel — GLTF loader, cache, and material manager
//
// Responsibilities:
//  • Load GLB via GLTFLoader; cache at module level so re-visiting a size is instant
//  • Clone the cached scene so each usage is independent
//  • Apply SCALE_MAP + default rotation; set up per-model materials per spec
//  • Generate composite canvas texture (cover art on front UV island + algorithmically
//    sampled colors on spine/back UV islands) — uses existing generateSpineTexture /
//    generateBackTexture; falls back to direct cover texture if composite fails
//  • Apply applyFinish to cover material (from Phase 1 utility)
//  • On coverUrl/finish changes: update without reloading the GLB
//  • Return { group, coverMaterial, isLoading, error } to the caller (BookScene)
//
// Disposal: only cloned materials tagged userData.ours=true and textures tagged the
// same are disposed.  Cached GLTF assets are NEVER disposed here.
//
// AO maps: cleared on all cover materials per Phase 2 spec (no AO data is usable).
// Zine Page normalMap: handled defensively; logged if missing, no throw.

import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
// three-stdlib is a transitive dependency of @react-three/drei; it re-exports
// all Three.js example loaders with proper TypeScript declarations.
import { GLTFLoader } from "three-stdlib";
import type { GLTF } from "three-stdlib";
import { MODEL_MAP, SCALE_MAP } from "@/lib/constants";
import { applyFinish } from "@/utils/applyFinish";
import { generateSpineTexture, generateBackTexture } from "@/lib/three/spineGenerator";
import type { BookSize, FinishType } from "@/types";

// ─── Per-model metadata ───────────────────────────────────────────────────────

/** Material name as it appears in the GLB for the cover body. */
const COVER_MAT_NAME: Record<BookSize, string> = {
  hardcover: "Hardcover",
  softcover: "Softcover",
  digest:    "Softcover",   // reuses Softcover.glb
  zine:      "Zine",
  letter:    "Hardcover",   // reuses Hardcover.glb
};

// ─── Public interface ─────────────────────────────────────────────────────────

export interface BookModelResult {
  group:         THREE.Group | null;
  coverMaterial: THREE.MeshPhysicalMaterial | null;
  isLoading:     boolean;
  error:         string | null;
}

// ─── Module-level cache & loader ──────────────────────────────────────────────
// A single GLTFLoader instance is reused (avoids repeated DRACOLoader setup).
// The cache is keyed by path — the GLTF.scene is the original; callers must
// clone() before mutating to avoid corrupting the cache.

const gltfCache = new Map<string, GLTF>();
const gltfLoader = new GLTFLoader();

async function loadGltf(path: string): Promise<GLTF> {
  const cached = gltfCache.get(path);
  if (cached) return cached;
  const gltf = await new Promise<GLTF>((resolve, reject) => {
    gltfLoader.load(path, resolve, undefined, reject);
  });
  gltfCache.set(path, gltf);
  return gltf;
}

// ─── Disposal ─────────────────────────────────────────────────────────────────
// Only dispose materials + textures tagged userData.ours=true.
// Geometries are shared with the cache — never disposed here.
//
// IMPORTANT: never call disposeClone while the group is still in the R3F scene
// graph (<primitive> is mounted).  Always defer via requestAnimationFrame so
// React's commit phase removes the primitive before disposal — otherwise the
// WebGL renderer tries to render with freed resources and loses context.

function disposeClone(group: THREE.Group): void {
  console.log("[useBookModel] disposing model clone");
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || !m.userData.ours) continue;
      const pm = m as THREE.MeshPhysicalMaterial;
      // Dispose textures we created
      for (const key of ["map", "normalMap", "roughnessMap"] as const) {
        const t = pm[key] as (THREE.Texture | null) | undefined;
        if (t?.userData?.ours) t.dispose();
      }
      m.dispose();
    }
  });
}

// ─── UV region detection ──────────────────────────────────────────────────────
// Groups vertices by their 3D position role (front=high-Z, back=low-Z, spine=low-X),
// then returns UV bounding boxes for each region.  Works on both indexed and
// non-indexed BufferGeometry.

interface UVRegion { u0: number; u1: number; v0: number; v1: number }

function getUVRegions(geo: THREE.BufferGeometry): {
  front: UVRegion | null;
  back:  UVRegion | null;
  spine: UVRegion | null;
} {
  const NONE = { front: null, back: null, spine: null };
  const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
  const uvAttr  = geo.attributes.uv       as THREE.BufferAttribute | undefined;
  if (!posAttr || !uvAttr) return NONE;

  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return NONE;

  const zSpan = bb.max.z - bb.min.z;
  const xSpan = bb.max.x - bb.min.x;
  if (zSpan < 0.001 || xSpan < 0.001) return NONE;

  // Front = top 20% of Z range, back = bottom 20%, spine = leftmost 20% of X range
  const zFront = bb.max.z - zSpan * 0.20;
  const zBack  = bb.min.z + zSpan * 0.20;
  const xSpine = bb.min.x + xSpan * 0.20;

  const fUVs: [number, number][] = [];
  const bUVs: [number, number][] = [];
  const sUVs: [number, number][] = [];

  const idx   = geo.index;
  const count = idx ? idx.count : posAttr.count;

  for (let i = 0; i < count; i++) {
    const vi = idx ? idx.getX(i) : i;
    const z  = posAttr.getZ(vi);
    const x  = posAttr.getX(vi);
    const u  = uvAttr.getX(vi);
    const v  = uvAttr.getY(vi);

    if (z >= zFront)       fUVs.push([u, v]);
    else if (z <= zBack)   bUVs.push([u, v]);
    else if (x <= xSpine)  sUVs.push([u, v]);
  }

  function bounds(pts: [number, number][]): UVRegion | null {
    if (pts.length < 3) return null;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [u, v] of pts) {
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    // Discard degenerate regions (too narrow in either axis)
    return (u1 - u0 > 0.02 && v1 - v0 > 0.02) ? { u0, u1, v0, v1 } : null;
  }

  return { front: bounds(fUVs), back: bounds(bUVs), spine: bounds(sUVs) };
}

// ─── Composite canvas texture ─────────────────────────────────────────────────
// Generates a single 1024×1024 CanvasTexture:
//   • Back gradient fills the whole canvas (algorithmically sampled from cover image)
//   • Cover art drawn in the front UV island (detected via getUVRegions)
//   • Spine gradient drawn in the spine UV island
//
// UV convention: GLTF V=0 is at the TOP of the image (same as canvas Y=0).
// With flipY=false we do NOT flip on GPU upload, so canvas_y = v * SIZE directly.
// (The Phase 1 procedural book used flipY=true + an inverted formula; GLTF is different.)

async function buildCompositeTexture(
  imgUrl: string,
  coverMesh: THREE.Mesh,
  spineTitle: string,
): Promise<THREE.CanvasTexture | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const { front, spine } = getUVRegions(coverMesh.geometry);

      const S = 1024;
      const canvas = document.createElement("canvas");
      canvas.width  = S;
      canvas.height = S;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }

      // Step 1 — back-cover gradient as base (dominant colors, whole canvas)
      const backCv = generateBackTexture(img, S, S);
      ctx.drawImage(backCv, 0, 0, S, S);

      // Step 2 — cover art in the detected front UV island
      if (front) {
        // GLTF UV: V=0 at top → canvas_y = v * S (no inversion needed)
        const cx = Math.round(front.u0 * S);
        const cy = Math.round(front.v0 * S);
        const cw = Math.max(1, Math.round((front.u1 - front.u0) * S));
        const ch = Math.max(1, Math.round((front.v1 - front.v0) * S));
        ctx.drawImage(img, cx, cy, cw, ch);
      } else {
        // No distinct front UV island — cover art fills the whole canvas
        // (front face and back/spine will all show cover art; visual tuning needed)
        ctx.drawImage(img, 0, 0, S, S);
      }

      // Step 3 — spine gradient in the detected spine UV island
      if (spine) {
        const spineCv = generateSpineTexture(img, spineTitle, S, S);
        const cx = Math.round(spine.u0 * S);
        const cy = Math.round(spine.v0 * S);
        const cw = Math.max(1, Math.round((spine.u1 - spine.u0) * S));
        const ch = Math.max(1, Math.round((spine.v1 - spine.v0) * S));
        ctx.drawImage(spineCv, cx, cy, cw, ch);
      }

      const tex = new THREE.CanvasTexture(canvas);
      // flipY=false: GLTF UV V=0 is at image top, same as canvas origin — no flip needed.
      tex.flipY       = false;
      tex.wrapS       = THREE.ClampToEdgeWrapping;
      tex.wrapT       = THREE.ClampToEdgeWrapping;
      tex.colorSpace  = THREE.SRGBColorSpace;
      tex.userData.ours = true;                     // safe to dispose on model swap
      resolve(tex);
    };

    img.onerror = () => resolve(null);
    img.src = imgUrl;
  });
}

// ─── Find cover mesh in a cloned group ────────────────────────────────────────
// NOTE: GLTFLoader creates MeshStandardMaterial for standard PBR materials.
// MeshPhysicalMaterial (clearcoat etc.) is only used when the GLB uses extensions
// like KHR_materials_clearcoat.  We must accept MeshStandardMaterial here and
// upgrade to MeshPhysicalMaterial inside buildCoverMaterial.

function findCoverEntry(
  group: THREE.Group,
  bookSize: BookSize,
): { mat: THREE.MeshStandardMaterial; mesh: THREE.Mesh } | null {
  const target = COVER_MAT_NAME[bookSize];
  let result: { mat: THREE.MeshStandardMaterial; mesh: THREE.Mesh } | null = null;
  group.traverse((node) => {
    if (result) return;
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      // MeshPhysicalMaterial extends MeshStandardMaterial — this check matches both
      if (m?.name === target && m instanceof THREE.MeshStandardMaterial) {
        result = { mat: m as THREE.MeshStandardMaterial, mesh };
        break;
      }
    }
  });
  if (!result) {
    // Log what material names are actually present to aid tuning
    const names: string[] = [];
    group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => { if (m?.name) names.push(m.name); });
    });
    console.warn(
      `[useBookModel] Cover material "${target}" not found in GLB for ${bookSize}.`,
      `Present material names: [${[...new Set(names)].join(", ")}]`,
    );
  }
  return result;
}

// ─── Per-model material setup ─────────────────────────────────────────────────
// Called once on each fresh clone before textures are applied.

function setupModelMaterials(group: THREE.Group, bookSize: BookSize): void {
  // 1. Clear AO maps from ALL materials (spec: skip AO entirely for all models)
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      if (!m) return;
      const pm = m as THREE.MeshPhysicalMaterial;
      if (pm.aoMap) {
        pm.aoMap = null;
        pm.aoMapIntensity = 0;
        pm.needsUpdate = true;
      }
    });
  });

  // 2. Hardcover / Letter: Page node has no useful material in the GLB — assign one
  if (bookSize === "hardcover" || bookSize === "letter") {
    group.traverse((node) => {
      if (node.name !== "Page") return;
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pageMat = new THREE.MeshPhysicalMaterial({
        name:               "pages",
        color:              new THREE.Color("#f0ece0"),
        roughness:          0.9,
        metalness:          0.0,
        clearcoat:          0.0,
        clearcoatRoughness: 0.0,
      });
      pageMat.userData.ours = true;
      mesh.material = pageMat;
    });
  }

  // 3. Zine: Page normalMap at texture index 3 may not exist — warn if missing
  if (bookSize === "zine") {
    group.traverse((node) => {
      if (node.name !== "Page") return;
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!mat) return;
      const pm = mat as THREE.MeshPhysicalMaterial;
      if (!pm.normalMap) {
        console.warn(
          "[useBookModel] Zine Page normalMap missing " +
          "(GLB only has 3 textures at indices 0–2; index 3 referenced but absent). " +
          "Continuing without normal map.",
        );
      }
    });
  }
}

// ─── Apply cover texture to a fresh clone ────────────────────────────────────
// Upgrades MeshStandardMaterial → MeshPhysicalMaterial (needed for applyFinish /
// clearcoat), applies composite or simple cover texture, and returns the new material.

async function buildCoverMaterial(
  group: THREE.Group,
  bookSize: BookSize,
  coverUrl: string | null,
  spineTitle: string,
): Promise<THREE.MeshPhysicalMaterial | null> {
  const entry = findCoverEntry(group, bookSize);
  if (!entry) return null;

  // Upgrade to MeshPhysicalMaterial so applyFinish (clearcoat) works.
  // GLTFLoader creates MeshStandardMaterial for standard PBR — Physical is a superset.
  let cloned: THREE.MeshPhysicalMaterial;
  if (entry.mat instanceof THREE.MeshPhysicalMaterial) {
    cloned = entry.mat.clone() as THREE.MeshPhysicalMaterial;
    cloned.name = entry.mat.name;
  } else {
    cloned = new THREE.MeshPhysicalMaterial({
      name:            entry.mat.name,
      // color and map are set to neutral below — do not copy GLB baked values
      roughness:       entry.mat.roughness,
      metalness:       entry.mat.metalness,
      normalMap:       entry.mat.normalMap,
      normalScale:     entry.mat.normalScale?.clone(),
      envMapIntensity: entry.mat.envMapIntensity,
    });
    console.log(
      `[useBookModel] Upgraded "${entry.mat.name}" MeshStandardMaterial → MeshPhysicalMaterial`,
    );
  }

  // ── Neutral placeholder ──────────────────────────────────────────────────────
  // The GLB has the artist's test/cover art baked into its base color texture.
  // Always clear it so the model shows a clean mid-gray when no cover is uploaded.
  // color is reset to white (#ffffff) once a user texture is applied so it
  // renders at full brightness (color acts as a tint multiplier on the texture).
  cloned.map = null;
  cloned.color.set("#888888");
  cloned.userData.ours = true;

  // Replace on mesh (entry.mesh is in our clone — safe to mutate)
  if (Array.isArray(entry.mesh.material)) {
    const idx = (entry.mesh.material as THREE.Material[]).indexOf(entry.mat);
    if (idx >= 0) {
      const arr = [...(entry.mesh.material as THREE.Material[])];
      arr[idx] = cloned;
      entry.mesh.material = arr;
    }
  } else {
    entry.mesh.material = cloned;
  }

  // No cover — return the neutral gray placeholder
  if (!coverUrl) return cloned;

  // Try composite (cover art in front UV island + spine/back sampled colors)
  let tex: THREE.Texture | null = null;
  try {
    tex = await buildCompositeTexture(coverUrl, entry.mesh, spineTitle);
  } catch (err) {
    console.warn("[useBookModel] Composite texture failed:", err);
  }

  // Fallback: plain cover texture (front face will be correct; spine/back show UV edges)
  // flipY=false: GLTF UV convention has V=0 at top-of-image, same as canvas/image origin.
  if (!tex) {
    tex = await new Promise<THREE.Texture | null>((resolve) => {
      new THREE.TextureLoader().load(
        coverUrl,
        (t) => {
          t.flipY         = false;
          t.wrapS         = THREE.ClampToEdgeWrapping;
          t.wrapT         = THREE.ClampToEdgeWrapping;
          t.colorSpace    = THREE.SRGBColorSpace;
          t.userData.ours = true;
          resolve(t);
        },
        undefined,
        () => resolve(null),
      );
    });
  }

  if (tex) {
    // Reset color to white so the texture renders at full brightness (no gray tint)
    cloned.color.set("#ffffff");
    cloned.map = tex;
    cloned.needsUpdate = true;
  }

  return cloned;
}

// ─── The hook ─────────────────────────────────────────────────────────────────

export function useBookModel(
  bookSize:  BookSize,
  coverUrl:  string | null,
  spineTitle: string,
  finish:    FinishType,
): BookModelResult {
  const [result, setResult] = useState<BookModelResult>({
    group: null, coverMaterial: null, isLoading: true, error: null,
  });

  // Stable refs for values that should NOT trigger GLB reload
  const coverUrlRef    = useRef(coverUrl);
  const spineTitleRef  = useRef(spineTitle);
  const finishRef      = useRef(finish);
  const bookSizeRef    = useRef(bookSize);
  useEffect(() => { coverUrlRef.current   = coverUrl;   }, [coverUrl]);
  useEffect(() => { spineTitleRef.current = spineTitle; }, [spineTitle]);
  useEffect(() => { finishRef.current     = finish;     }, [finish]);
  useEffect(() => { bookSizeRef.current   = bookSize;   }, [bookSize]);

  // Live refs to the active group and cover material for reactive updates
  const groupRef    = useRef<THREE.Group | null>(null);
  const coverMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  // ── Effect 1: Load / reload GLB on bookSize change ─────────────────────────
  useEffect(() => {
    const path = MODEL_MAP[bookSize];
    setResult((s) => ({ ...s, isLoading: true, error: null }));
    let cancelled = false;

    const run = async () => {
      console.log("[useBookModel] loading model:", path);
      try {
        const gltf  = await loadGltf(path);
        if (cancelled) return;

        // Clone so we have an independent copy to mutate
        const group = gltf.scene.clone(true) as THREE.Group;
        const scale = SCALE_MAP[bookSize];
        group.scale.set(...scale);
        // Default orientation — matches ProceduralBook rotation; tune if needed
        group.rotation.set(-0.05, 0.55, 0.0);

        // Per-model material setup (clear AO, assign Page material where needed, etc.)
        setupModelMaterials(group, bookSize);

        // Build (or re-apply) cover material with neutral placeholder
        const coverMat = await buildCoverMaterial(
          group,
          bookSize,
          coverUrlRef.current,
          spineTitleRef.current,
        );

        if (cancelled) {
          disposeClone(group);
          return;
        }

        // Apply current finish to cover material
        if (coverMat) applyFinish(coverMat, finishRef.current);

        // Swap refs first, then commit state.
        // Defer disposing the old clone with requestAnimationFrame so React's
        // commit phase can unmount the old <primitive> before we free its
        // materials — disposing while R3F is still rendering causes context loss.
        const prev = groupRef.current;
        groupRef.current    = group;
        coverMatRef.current = coverMat;

        setResult({ group, coverMaterial: coverMat, isLoading: false, error: null });

        if (prev) {
          requestAnimationFrame(() => { disposeClone(prev); });
        }

      } catch (err) {
        if (!cancelled) {
          console.error("[useBookModel] GLB load failed for", bookSize, err);
          setResult({ group: null, coverMaterial: null, isLoading: false, error: String(err) });
        }
      }
    };

    void run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookSize]); // coverUrl/finish/spineTitle handled by Effects 2 & 3

  // ── Effect 2: Update cover texture reactively (no GLB reload) ─────────────
  useEffect(() => {
    const mat = coverMatRef.current;
    if (!mat) return; // still loading, Effect 1 will apply it

    if (!coverUrl) {
      if (mat.map?.userData.ours) mat.map.dispose();
      mat.map = null;
      mat.color.set("#888888"); // restore neutral gray placeholder
      mat.needsUpdate = true;
      return;
    }

    let cancelled = false;
    const run = async () => {
      // Re-find cover mesh in current group for UV inspection
      const group = groupRef.current;
      let newTex: THREE.Texture | null = null;

      if (group) {
        try {
          const entry = findCoverEntry(group, bookSizeRef.current);
          if (entry) {
            newTex = await buildCompositeTexture(coverUrl, entry.mesh, spineTitleRef.current);
          }
        } catch { /* fall through to simple texture */ }
      }

      if (!newTex) {
        newTex = await new Promise<THREE.Texture | null>((resolve) => {
          new THREE.TextureLoader().load(
            coverUrl,
            (t) => {
              // flipY=false: GLTF UV convention V=0 at top matches image origin
              t.flipY         = false;
              t.wrapS         = THREE.ClampToEdgeWrapping;
              t.wrapT         = THREE.ClampToEdgeWrapping;
              t.colorSpace    = THREE.SRGBColorSpace;
              t.userData.ours = true;
              resolve(t);
            },
            undefined,
            () => resolve(null),
          );
        });
      }

      if (cancelled || !newTex) return;

      const currentMat = coverMatRef.current;
      if (!currentMat) return; // model may have swapped mid-flight

      // Dispose previous texture if it was ours
      if (currentMat.map?.userData.ours) currentMat.map.dispose();
      // Reset color to white so the texture renders at full brightness (no gray tint)
      currentMat.color.set("#ffffff");
      currentMat.map = newTex;
      currentMat.needsUpdate = true;
    };

    void run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverUrl, spineTitle]); // bookSize excluded — Effect 1 handles cross-size transitions

  // ── Effect 3: Live finish update (no GLB reload) ───────────────────────────
  useEffect(() => {
    const mat = coverMatRef.current;
    if (mat) applyFinish(mat, finish);
  }, [finish]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const g = groupRef.current;
      if (g) disposeClone(g);
    };
  }, []);

  return result;
}
