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
import { MODEL_MAP, SCALE_MAP, FRONT_UV_MAP } from "@/lib/constants";
import type { FrontUVBounds } from "@/lib/constants";
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
    // Dispose owned geometries (tagged userData.ours=true by splitCoverGeometry)
    if (mesh.geometry?.userData?.ours) {
      mesh.geometry.dispose();
    }
    // Belt-and-suspenders: also dispose explicit splitGeo references stored by
    // buildCoverMaterial (catches any geometry that lost its userData.ours tag)
    const splitGeo = mesh.userData.splitGeo as THREE.BufferGeometry | undefined;
    if (splitGeo) {
      splitGeo.dispose();
      delete mesh.userData.splitGeo;
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || !m.userData.ours) continue;
      // Guard: restMat is shared between edgeMesh and restMesh — only dispose once.
      if (m.userData.disposed) continue;
      m.userData.disposed = true;
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

// ─── Cover texture UV transform ───────────────────────────────────────────────
// The front cover UV island occupies only a sub-region of [0,1]² in the atlas.
// A raw texture application maps the full [0,1] texture space to [0,1] UVs, so
// only the small island portion of the texture is visible — appearing zoomed in.
//
// Fix: scale and shift the texture so the island bounds map to the full image:
//   repeat  = 1 / range      → stretches the image to fill the island
//   offset  = -min / range   → shifts the origin so island-min samples image x=0
//
// Verification: at UV u=uMin → transformed = 0 (left edge of image)
//               at UV u=uMax → transformed = 1 (right edge of image)  ✓

function applyCoverUVTransform(tex: THREE.Texture, bounds: FrontUVBounds): void {
  const uRange = bounds.uMax - bounds.uMin;
  const vRange = bounds.vMax - bounds.vMin;
  tex.repeat.set(1 / uRange, 1 / vRange);
  tex.offset.set(-bounds.uMin / uRange, -bounds.vMin / vRange);
  // wrapS/wrapT stay ClampToEdgeWrapping — transformed UVs for frontGeo land
  // in [0,1] so the clamp never fires; repeat > 1 is just the matrix scalar.
  tex.needsUpdate = true;
}

// ─── Split cover geometry into three groups ───────────────────────────────────
// Uses the confirmed Blender UV island layout (five non-overlapping islands):
//
//   frontGeo — large UV area AND avgU < FRONT_U_MAX  (front cover face)
//              → cover texture with UV transform
//
//   edgeGeo  — small UV area (board edges, thin strips that aren't flat faces)
//              → solid sampled color (same material as restGeo, no UV transform)
//              These are the physical board-thickness faces.  Their own UV coords
//              would stretch the cover art so they get a flat color instead.
//
//   restGeo  — large UV area AND avgU >= FRONT_U_MAX  (back cover + spine)
//              → solid sampled color
//
// Returns null if the geometry is non-indexed, lacks required attributes, or
// front/rest groups are both empty.  edgeGeo may be empty (no edges) — that is
// not an error.  All output geometries are tagged userData.ours=true.

/** UV u-coordinate upper bound for the front cover island (Blender-confirmed). */
const FRONT_U_MAX = 0.29; // was 0.30 — tightened to exclude back face boundary triangles

function splitCoverGeometry(
  geo: THREE.BufferGeometry,
  areaFraction = 0.005, // was 0.10→0.02→0.005 — tuning to capture all front-face tris correctly
): { frontGeo: THREE.BufferGeometry; edgeGeo: THREE.BufferGeometry; restGeo: THREE.BufferGeometry } | null {
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

  // ── Diagnostic: log dominant normal directions in the mesh ───────────────────
  // Helps identify which local axis the front face points along (e.g. -Y on Blender
  // exports) when tuning is needed.  Buckets rounded to 0.5 steps so near-axis
  // normals collapse into one bucket.
  {
    const nArr = normalAttr.array as Float32Array;
    const buckets: Record<string, number> = {};
    for (let i = 0; i < nArr.length; i += 3) {
      const key = `${Math.round(nArr[i] * 2) / 2},${Math.round(nArr[i + 1] * 2) / 2},${Math.round(nArr[i + 2] * 2) / 2}`;
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    const top10 = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log("[useBookModel] top face normals by vertex count:", top10);
  }

  const triCount = Math.floor(idx.count / 3);

  // ── Pass 1: compute UV area per triangle ─────────────────────────────────────
  const uvAreas = new Float32Array(triCount);
  let maxArea = 0;
  for (let t = 0; t < triCount; t++) {
    const i0 = idx.getX(t * 3), i1 = idx.getX(t * 3 + 1), i2 = idx.getX(t * 3 + 2);
    const u0 = uvAttr.getX(i0), v0 = uvAttr.getY(i0);
    const u1 = uvAttr.getX(i1), v1 = uvAttr.getY(i1);
    const u2 = uvAttr.getX(i2), v2 = uvAttr.getY(i2);
    // Signed area via 2D cross product; abs gives unsigned UV-space area
    const area = Math.abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)) * 0.5;
    uvAreas[t] = area;
    if (area > maxArea) maxArea = area;
  }

  const areaThreshold = maxArea * areaFraction;
  console.log(
    `[useBookModel] UV area: max=${maxArea.toFixed(6)}, ` +
    `threshold=${areaThreshold.toFixed(6)} (${areaFraction * 100}% of max), ` +
    `triCount=${triCount}`,
  );
  // ── UV area distribution diagnostics ─────────────────────────────────────────
  // Used to tune areaFraction.  Front-face triangles should form a visible cluster
  // in the top-20; edge and degenerate tris cluster near the bottom.
  const sortedAreas = Array.from(uvAreas).sort((a, b) => b - a);
  const posAreas    = sortedAreas.filter(a => a > 0);
  console.log("[useBookModel] top 20 UV areas:",    sortedAreas.slice(0,  20).map(a => a.toFixed(8)));
  console.log("[useBookModel] bottom 20 UV areas:", sortedAreas.slice(-20).map(a => a.toFixed(8)));
  console.log("[useBookModel] median UV area:", (posAreas[Math.floor(posAreas.length / 2)] ?? 0).toFixed(8));
  console.log("[useBookModel] areas above 0.5% of max:", sortedAreas.filter(a => a > maxArea * 0.005).length);
  console.log("[useBookModel] areas above  1% of max:", sortedAreas.filter(a => a > maxArea * 0.01).length);
  console.log("[useBookModel] areas above  2% of max:", sortedAreas.filter(a => a > maxArea * 0.02).length);
  console.log("[useBookModel] areas above  5% of max:", sortedAreas.filter(a => a > maxArea * 0.05).length);
  console.log("[useBookModel] areas above 10% of max:", sortedAreas.filter(a => a > maxArea * 0.10).length);

  // Log UV areas of the first 20 triangles that are confirmed to be on the front
  // face (avgU < FRONT_U_MAX), regardless of area.  This shows exactly where the
  // front-face tris cluster so the threshold can be set to include all of them.
  {
    const frontUDiagAreas: number[] = [];
    for (let t = 0; t < triCount && frontUDiagAreas.length < 20; t++) {
      const i0 = idx.getX(t * 3), i1 = idx.getX(t * 3 + 1), i2 = idx.getX(t * 3 + 2);
      const avgU = (uvAttr.getX(i0) + uvAttr.getX(i1) + uvAttr.getX(i2)) / 3;
      if (avgU < FRONT_U_MAX) frontUDiagAreas.push(uvAreas[t]);
    }
    console.log(
      `[useBookModel] UV areas of first 20 front-U tris (avgU < ${FRONT_U_MAX}):`,
      frontUDiagAreas.map(a => a.toFixed(8)),
    );
  }

  // ── Pass 2: three-way bin — front face / board edges / back+spine ─────────────
  //
  //   isFront = isLargeUV && avgU < FRONT_U_MAX   → frontGeo (cover texture + UV transform)
  //   isRest  = isLargeUV && avgU >= FRONT_U_MAX  → restGeo  (sampled color, no texture)
  //   isEdge  = !isLargeUV                        → edgeGeo  (sampled color, no texture)
  //
  // Edge triangles (board thickness faces) are separated out because their UV coords
  // differ from the front-face island — the UV transform for front wouldn't fit them
  // correctly, causing visible stretching.  They share restMat (same solid color).
  const frontPositions: number[] = [];
  const frontNormals:   number[] = [];
  const frontUVs:       number[] = [];
  const edgePositions:  number[] = [];
  const edgeNormals:    number[] = [];
  const edgeUVs:        number[] = [];
  const restPositions:  number[] = [];
  const restNormals:    number[] = [];
  const restUVs:        number[] = [];
  let frontCount = 0;
  let edgeCount  = 0;
  let restCount  = 0;
  const candidateUSample: number[] = []; // first 10 large-UV avg-U values for diagnostics

  for (let t = 0; t < triCount; t++) {
    const i0 = idx.getX(t * 3), i1 = idx.getX(t * 3 + 1), i2 = idx.getX(t * 3 + 2);

    const isLargeUV = uvAreas[t] >= areaThreshold;

    // Average U of triangle's three UV coordinates
    const avgU = (uvAttr.getX(i0) + uvAttr.getX(i1) + uvAttr.getX(i2)) / 3;

    if (isLargeUV && candidateUSample.length < 10) candidateUSample.push(avgU);

    const isFront = isLargeUV && avgU < FRONT_U_MAX;
    const isRest  = isLargeUV && avgU >= FRONT_U_MAX;
    // isEdge = !isFront && !isRest  (i.e. !isLargeUV — board thickness faces)

    if (isFront)      frontCount++;
    else if (isRest)  restCount++;
    else              edgeCount++;

    const tPos = isFront ? frontPositions : isRest ? restPositions : edgePositions;
    const tNrm = isFront ? frontNormals   : isRest ? restNormals   : edgeNormals;
    const tUV  = isFront ? frontUVs       : isRest ? restUVs       : edgeUVs;

    for (const vi of [i0, i1, i2]) {
      tPos.push(posAttr.getX(vi),    posAttr.getY(vi),    posAttr.getZ(vi));
      tNrm.push(normalAttr.getX(vi), normalAttr.getY(vi), normalAttr.getZ(vi));
      tUV.push( uvAttr.getX(vi),     uvAttr.getY(vi));
    }
  }

  console.log(
    "[useBookModel] large-UV candidate avgU sample (first 10):",
    candidateUSample.map(u => u.toFixed(4)),
  );
  console.log(
    `[useBookModel] Split result: front=${frontCount} tris, ` +
    `edges=${edgeCount} tris, rest=${restCount} tris ` +
    `[isFront=isLargeUV&&avgU<${FRONT_U_MAX}, isRest=isLargeUV&&avgU>=${FRONT_U_MAX}, isEdge=!isLargeUV]`,
  );

  // edgeGeo may legitimately be empty (model has no board edges) — not an error.
  // Only bail out if front or rest are empty (means the UV threshold is wrong).
  if (frontPositions.length === 0 || restPositions.length === 0) {
    console.warn(
      `[useBookModel] splitCoverGeometry: split produced an empty group ` +
      `(front=${frontCount} tris, edges=${edgeCount} tris, rest=${restCount} tris, ` +
      `areaFraction=${areaFraction}) — falling back`,
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
  const edgeGeo  = makeGeo(edgePositions,  edgeNormals,  edgeUVs);
  const restGeo  = makeGeo(restPositions,  restNormals,  restUVs);

  // UV diagnostic — log bounds for front and rest to verify the split.
  // Front should span the confirmed island (u≈0.019–0.290); rest will be elsewhere.
  function uvBounds(g: THREE.BufferGeometry): string {
    const buf = g.attributes.uv as THREE.BufferAttribute;
    if (buf.count === 0) return "(empty)";
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (let i = 0; i < buf.count; i++) {
      const u = buf.getX(i), v = buf.getY(i);
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
    return `u=[${uMin.toFixed(3)}, ${uMax.toFixed(3)}] v=[${vMin.toFixed(3)}, ${vMax.toFixed(3)}]`;
  }
  console.log(
    `[useBookModel] splitCoverGeometry: ` +
    `front=${frontCount} tris, edges=${edgeCount} tris, rest=${restCount} tris | ` +
    `front UV ${uvBounds(frontGeo)} | rest UV ${uvBounds(restGeo)}`,
  );

  return { frontGeo, edgeGeo, restGeo };
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
  // GLB materials often have doubleSided=true.  The cover texture must only appear
  // on the outside face — FrontSide prevents it rendering on the inside of the board.
  cloned.side          = THREE.FrontSide;
  cloned.needsUpdate   = true;
  cloned.userData.ours = true;
  console.log("[useBookModel] normalMap after null:", cloned.normalMap);

  // ── Split cover mesh into front face + rest (spine/back/edges) ───────────────
  const split = splitCoverGeometry(entry.mesh.geometry);
  let restMat: THREE.MeshPhysicalMaterial | null = null;

  if (split) {
    // Spine/back/edge material — sampled color, no texture
    restMat = new THREE.MeshPhysicalMaterial({
      name:            entry.mat.name + "_rest",
      roughness:       entry.mat.roughness,
      metalness:       entry.mat.metalness,
      color:           new THREE.Color("#888888"),
      envMapIntensity: entry.mat.envMapIntensity,
      // FrontSide: prevent spine/back/edge texture from rendering on inside surfaces
      side:            THREE.FrontSide,
    });
    restMat.userData.ours = true;

    // Capture the original mesh's local transform before removing it.
    // Both replacement meshes live in the same parent space, so they copy
    // position/rotation/scale directly.
    const origPos = entry.mesh.position.clone();
    const origRot = entry.mesh.rotation.clone();
    const origScale = entry.mesh.scale.clone();
    const parent = entry.mesh.parent ?? group;

    // Front mesh: cover texture on front-face polygons only
    const frontMesh = new THREE.Mesh(split.frontGeo, cloned);
    frontMesh.name = entry.mesh.name + "_front";
    frontMesh.position.copy(origPos);
    frontMesh.rotation.copy(origRot);
    frontMesh.scale.copy(origScale);
    frontMesh.userData.splitGeo = split.frontGeo; // explicit ref for disposeClone

    // Rest mesh: spine / back with sampled average color
    const restMesh = new THREE.Mesh(split.restGeo, restMat);
    restMesh.name = entry.mesh.name + "_rest";
    restMesh.position.copy(origPos);
    restMesh.rotation.copy(origRot);
    restMesh.scale.copy(origScale);
    restMesh.userData.splitGeo = split.restGeo; // explicit ref for disposeClone

    // Edge mesh: board-thickness faces — shares restMat (same solid color, no UV transform).
    // edgeGeo may be empty (models without thick board edges); an empty mesh is harmless.
    const edgeMesh = new THREE.Mesh(split.edgeGeo, restMat);
    edgeMesh.name = entry.mesh.name + "_edge";
    edgeMesh.position.copy(origPos);
    edgeMesh.rotation.copy(origRot);
    edgeMesh.scale.copy(origScale);
    edgeMesh.userData.splitGeo = split.edgeGeo; // explicit ref for disposeClone

    // Remove the original mesh entirely — replaced by the three split meshes.
    // Do NOT dispose its geometry or material; they are shared with the GLTF cache.
    parent.remove(entry.mesh);
    parent.add(frontMesh);
    parent.add(restMesh);
    parent.add(edgeMesh);

    restMatRef.current = restMat;

    // Diagnostic: log scene meshes + confirm the two materials are distinct instances
    console.log("[useBookModel] meshes in group after split:");
    group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      console.log(` - ${m.name} | material: ${(mat as THREE.Material)?.name ?? "(none)"}`);
    });
    {
      const fObj = group.getObjectByName(frontMesh.name) as THREE.Mesh | undefined;
      const rObj = group.getObjectByName(restMesh.name)  as THREE.Mesh | undefined;
      const fMat = fObj ? (Array.isArray(fObj.material) ? fObj.material[0] : fObj.material) as THREE.Material : null;
      const rMat = rObj ? (Array.isArray(rObj.material) ? rObj.material[0] : rObj.material) as THREE.Material : null;
      console.log("[useBookModel] restMat.map:",   restMat.map, "| restMat.color:", restMat.color.getHexString());
      console.log("[useBookModel] coverMat uuid:", cloned.uuid,  "| restMat uuid:", restMat.uuid);
      console.log("[useBookModel] front mat uuid:", fMat?.uuid,  "| rest mat uuid:", rMat?.uuid);
      console.log("[useBookModel] same material instance?:", fMat === rMat);
    }
    console.log("[useBookModel] Cover mesh split: original removed, front + rest added");
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
    // Scale the texture to fill the front face UV island exactly
    applyCoverUVTransform(tex, FRONT_UV_MAP[bookSize]);
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
      // Scale the texture to fill the front face UV island exactly
      applyCoverUVTransform(imgResult.tex, FRONT_UV_MAP[bookSizeRef.current]);
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
