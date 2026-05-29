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
// Geometries tagged userData.ours=true are also disposed (created by splitCoverGeometry).
// Geometries shared with the GLTF cache are NEVER tagged ours and are never disposed here.
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
    // Dispose owned geometries (e.g. from splitCoverGeometry)
    if (mesh.geometry?.userData?.ours) {
      mesh.geometry.dispose();
    }
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

// ─── Sample average cover color ───────────────────────────────────────────────
// Draws the cover image into a tiny 8×8 canvas and returns the average RGB color.
// Used to set the spine/back material to a color that complements the cover art.

function sampleAverageColor(img: HTMLImageElement): THREE.Color {
  const SIZE = 8;
  const canvas = document.createElement("canvas");
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Color("#888888");

  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

  let r = 0, g = 0, b = 0;
  const pixelCount = SIZE * SIZE;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }

  return new THREE.Color(
    (r / pixelCount) / 255,
    (g / pixelCount) / 255,
    (b / pixelCount) / 255,
  );
}

// ─── Split cover geometry by face normal ─────────────────────────────────────
// Takes an indexed BufferGeometry and bins each triangle into one of two groups
// based on the average Z component of its vertex normals:
//
//   frontGeo — triangles whose avg vertex normal Z >= threshold  (front face, +Z)
//   restGeo  — all other triangles                               (spine, back, edges)
//
// Returns null if geometry is non-indexed, lacks required attributes (position /
// normal / uv), or if either resulting group would be empty (miscalibrated threshold).
//
// Both output geometries are non-indexed and tagged userData.ours=true so
// disposeClone can safely free them on model swap.

function splitCoverGeometry(
  geo: THREE.BufferGeometry,
  threshold = 0.7,
): { frontGeo: THREE.BufferGeometry; restGeo: THREE.BufferGeometry } | null {
  const posAttr    = geo.attributes.position as THREE.BufferAttribute | undefined;
  const normalAttr = geo.attributes.normal   as THREE.BufferAttribute | undefined;
  const uvAttr     = geo.attributes.uv       as THREE.BufferAttribute | undefined;

  if (!posAttr || !normalAttr || !uvAttr) {
    console.warn(
      "[useBookModel] splitCoverGeometry: missing position/normal/uv attributes — falling back",
    );
    return null;
  }

  const idx = geo.index;
  if (!idx) {
    console.warn(
      "[useBookModel] splitCoverGeometry: non-indexed geometry not supported — falling back",
    );
    return null;
  }

  const frontPositions: number[] = [];
  const frontNormals:   number[] = [];
  const frontUVs:       number[] = [];
  const restPositions:  number[] = [];
  const restNormals:    number[] = [];
  const restUVs:        number[] = [];

  const triCount = Math.floor(idx.count / 3);
  for (let t = 0; t < triCount; t++) {
    const i0 = idx.getX(t * 3 + 0);
    const i1 = idx.getX(t * 3 + 1);
    const i2 = idx.getX(t * 3 + 2);

    // Average normal Z across three vertices — front-face polygons point toward +Z
    const avgNz = (normalAttr.getZ(i0) + normalAttr.getZ(i1) + normalAttr.getZ(i2)) / 3;

    const isFront = avgNz >= threshold;
    const tPos = isFront ? frontPositions : restPositions;
    const tNrm = isFront ? frontNormals   : restNormals;
    const tUV  = isFront ? frontUVs       : restUVs;

    for (const vi of [i0, i1, i2]) {
      tPos.push(posAttr.getX(vi),    posAttr.getY(vi),    posAttr.getZ(vi));
      tNrm.push(normalAttr.getX(vi), normalAttr.getY(vi), normalAttr.getZ(vi));
      tUV.push( uvAttr.getX(vi),     uvAttr.getY(vi));
    }
  }

  if (frontPositions.length === 0 || restPositions.length === 0) {
    console.warn(
      `[useBookModel] splitCoverGeometry: split produced an empty group ` +
      `(front=${frontPositions.length / 9} tris, rest=${restPositions.length / 9} tris, ` +
      `threshold=${threshold}) — falling back`,
    );
    return null;
  }

  function makeGeo(pos: number[], nrm: number[], uv: number[]): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("normal",   new THREE.BufferAttribute(new Float32Array(nrm), 3));
    g.setAttribute("uv",       new THREE.BufferAttribute(new Float32Array(uv),  2));
    g.userData.ours = true;
    return g;
  }

  const frontGeo = makeGeo(frontPositions, frontNormals, frontUVs);
  const restGeo  = makeGeo(restPositions,  restNormals,  restUVs);

  // UV diagnostic — log front-face UV bounds to verify correct face selection.
  // If u/v ranges look wrong (e.g. very narrow or outside [0,1]) the threshold
  // may need tuning or the model's normals may not align with world +Z.
  {
    const uvBuf = frontGeo.attributes.uv as THREE.BufferAttribute;
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (let i = 0; i < uvBuf.count; i++) {
      const u = uvBuf.getX(i), v = uvBuf.getY(i);
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
    console.log(
      `[useBookModel] splitCoverGeometry: ` +
      `front=${frontPositions.length / 9} tris (avgNz >= ${threshold}), ` +
      `rest=${restPositions.length / 9} tris | ` +
      `front UV u=[${uMin.toFixed(3)}, ${uMax.toFixed(3)}] ` +
      `v=[${vMin.toFixed(3)}, ${vMax.toFixed(3)}]`,
    );
  }

  return { frontGeo, restGeo };
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
// DISABLED — vertex-position UV bucketing was calibrated for BoxGeometry and
// produces incorrect face mapping on the GLTF models (cover art lands on the
// spine/top-edge faces instead of the front face).
// Retained for future reimplementation once the artist provides confirmed UV
// island bounds or a UV atlas map per model.
// Active code path: splitCoverGeometry + direct TextureLoader in buildCoverMaterial / Effect 2.

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
// clearcoat), splits the cover mesh into a front-face mesh (cover texture) and a
// rest mesh (spine/back with sampled average color), and returns the front material.
//
// The restMatRef.current is updated to the spine/back material so Effect 2 can
// keep the sampled color in sync when the cover image changes.
//
// Falls back to single-material path if the geometry split fails (non-indexed,
// missing normals, or degenerate threshold result).

async function buildCoverMaterial(
  group: THREE.Group,
  bookSize: BookSize,
  coverUrl: string | null,
  spineTitle: string,
  restMatRef: { current: THREE.MeshPhysicalMaterial | null },
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
      // color and map set to neutral below — do not copy GLB baked values
      roughness:       entry.mat.roughness,
      metalness:       entry.mat.metalness,
      envMapIntensity: entry.mat.envMapIntensity,
    });
    console.log(
      `[useBookModel] Upgraded "${entry.mat.name}" MeshStandardMaterial → MeshPhysicalMaterial`,
    );
  }

  // ── Neutral placeholder ──────────────────────────────────────────────────────
  // Clear baked GLB art; null both normal maps (baked incorrectly, artist fix pending).
  // color resets to #ffffff once a user texture is applied (acts as tint multiplier).
  cloned.map       = null;
  cloned.normalMap = null;
  cloned.bumpMap   = null;
  cloned.color.set("#888888");
  cloned.needsUpdate   = true;
  cloned.userData.ours = true;
  console.log("[useBookModel] normalMap after null:", cloned.normalMap);

  // ── Split cover mesh into front face + rest (spine/back/edges) ───────────────
  const split = splitCoverGeometry(entry.mesh.geometry);
  let restMat: THREE.MeshPhysicalMaterial | null = null;

  if (split) {
    // Spine/back material — flat color sampled from cover art (no texture)
    restMat = new THREE.MeshPhysicalMaterial({
      name:            entry.mat.name + "_rest",
      roughness:       entry.mat.roughness,
      metalness:       entry.mat.metalness,
      color:           new THREE.Color("#888888"),
      envMapIntensity: entry.mat.envMapIntensity,
    });
    restMat.userData.ours = true;

    // Front mesh: sibling of entry.mesh, inherits its local transform so it
    // renders in the same world space; carries cover texture via cloned material.
    const frontMesh = new THREE.Mesh(split.frontGeo, cloned);
    frontMesh.name = entry.mesh.name + "_front";
    frontMesh.position.copy(entry.mesh.position);
    frontMesh.rotation.copy(entry.mesh.rotation);
    frontMesh.scale.copy(entry.mesh.scale);
    const parent = entry.mesh.parent ?? group;
    parent.add(frontMesh);

    // Replace original mesh with rest geometry (spine/back/edges) + rest material
    entry.mesh.geometry = split.restGeo;
    entry.mesh.material = restMat;

    restMatRef.current = restMat;
    console.log("[useBookModel] Cover mesh split: front face separated from spine/back");
  } else {
    // Fallback: apply cloned material to full original mesh
    if (Array.isArray(entry.mesh.material)) {
      const idx2 = (entry.mesh.material as THREE.Material[]).indexOf(entry.mat);
      if (idx2 >= 0) {
        const arr = [...(entry.mesh.material as THREE.Material[])];
        arr[idx2] = cloned;
        entry.mesh.material = arr;
      }
    } else {
      entry.mesh.material = cloned;
    }
    restMatRef.current = null;
    console.warn("[useBookModel] Cover mesh split failed — single-material fallback active");
  }

  // No cover URL — return the neutral gray placeholder
  if (!coverUrl) return cloned;

  // Load via new Image() so we can both create the GPU texture and sample the
  // average color for spine/back in a single network round-trip.
  const imgResult = await new Promise<{ tex: THREE.Texture; img: HTMLImageElement } | null>(
    (resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const tex = new THREE.Texture(img);
        // flipY=false: GLTF UV V=0 is at image top, matching canvas Y=0
        tex.flipY         = false;
        tex.wrapS         = THREE.ClampToEdgeWrapping;
        tex.wrapT         = THREE.ClampToEdgeWrapping;
        tex.colorSpace    = THREE.SRGBColorSpace;
        tex.userData.ours = true;
        tex.needsUpdate   = true;
        resolve({ tex, img });
      };
      img.onerror = () => resolve(null);
      img.src = coverUrl;
    },
  );

  if (imgResult) {
    const { tex, img } = imgResult;
    // Reset color to white so texture renders at full brightness (no gray tint)
    cloned.color.set("#ffffff");
    cloned.map       = tex;
    cloned.normalMap = null;
    cloned.bumpMap   = null;
    cloned.needsUpdate = true;
    console.log("[useBookModel] normalMap after null:", cloned.normalMap);

    // Set spine/back to sampled average color from cover art
    if (restMat) {
      restMat.color.copy(sampleAverageColor(img));
      restMat.needsUpdate = true;
    }
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

  // Live refs to the active group and cover materials for reactive updates
  const groupRef    = useRef<THREE.Group | null>(null);
  const coverMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  // restMatRef — spine/back material created by splitCoverGeometry; null if split failed
  const restMatRef  = useRef<THREE.MeshPhysicalMaterial | null>(null);

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

        // Build cover material: upgrade Standard→Physical, split mesh, apply texture
        const coverMat = await buildCoverMaterial(
          group,
          bookSize,
          coverUrlRef.current,
          spineTitleRef.current,
          restMatRef,
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
      mat.map      = null;
      mat.normalMap = null;
      mat.bumpMap   = null;
      mat.color.set("#888888"); // restore neutral gray placeholder
      mat.needsUpdate = true;
      console.log("[useBookModel] normalMap after null:", mat.normalMap);
      // Reset spine/back to gray placeholder as well
      const restMat = restMatRef.current;
      if (restMat) {
        restMat.color.set("#888888");
        restMat.needsUpdate = true;
      }
      return;
    }

    let cancelled = false;
    const run = async () => {
      // Use new Image() so we can sample average color for spine/back in the same load
      const imgResult = await new Promise<{ tex: THREE.Texture; img: HTMLImageElement } | null>(
        (resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const tex = new THREE.Texture(img);
            // flipY=false: GLTF UV V=0 is at image top, matching canvas Y=0
            tex.flipY         = false;
            tex.wrapS         = THREE.ClampToEdgeWrapping;
            tex.wrapT         = THREE.ClampToEdgeWrapping;
            tex.colorSpace    = THREE.SRGBColorSpace;
            tex.userData.ours = true;
            tex.needsUpdate   = true;
            resolve({ tex, img });
          };
          img.onerror = () => resolve(null);
          img.src = coverUrl;
        },
      );

      if (cancelled || !imgResult) return;

      const currentMat = coverMatRef.current;
      if (!currentMat) return; // model may have swapped mid-flight

      // Dispose previous texture if we own it
      if (currentMat.map?.userData.ours) currentMat.map.dispose();
      // Reset color to white so texture renders at full brightness (no gray tint)
      currentMat.color.set("#ffffff");
      currentMat.map       = imgResult.tex;
      currentMat.normalMap = null;
      currentMat.bumpMap   = null;
      currentMat.needsUpdate = true;
      console.log("[useBookModel] normalMap after null:", currentMat.normalMap);

      // Update spine/back material with average color sampled from new cover art
      const restMat = restMatRef.current;
      if (restMat) {
        restMat.color.copy(sampleAverageColor(imgResult.img));
        restMat.needsUpdate = true;
      }
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
