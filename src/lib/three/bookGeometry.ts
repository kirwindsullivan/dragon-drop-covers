import * as THREE from "three";
import type { BookSize } from "@/types";

/**
 * Physical dimensions in Three.js units. Scale is intentionally small (1 unit ≈ 1 cm)
 * so the book fits the default camera framing comfortably.
 */
export const BOOK_DIMS: Record<BookSize, { w: number; h: number; d: number; type: string }> = {
  hardcover: { w: 1.5,  h: 2.2,  d: 0.28, type: "hard" },
  softcover: { w: 1.5,  h: 2.2,  d: 0.22, type: "soft" },
  digest:    { w: 1.35, h: 2.1,  d: 0.15, type: "soft" },
  zine:      { w: 1.35, h: 2.1,  d: 0.04, type: "zine" },
  letter:    { w: 2.1,  h: 2.75, d: 0.28, type: "hard" },
};

/**
 * UV regions for book faces on the atlas texture.
 * The front cover uses its own texture; spine/back use a generated canvas.
 */
export const FACE = {
  FRONT:  0,
  BACK:   1,
  SPINE:  2,
  TOP:    3,
  BOTTOM: 4,
  PAGES:  5,
} as const;

/**
 * Build a procedural book mesh (fallback when no .glb is available).
 * This is NOT BoxGeometry — it's a multi-material merged mesh that
 * correctly represents the book's physical parts.
 */
export function buildProceduralBook(
  size: BookSize,
  coverTex: THREE.Texture | null,
  spineTex: THREE.Texture | null,
  backTex: THREE.Texture | null,
): THREE.Group {
  const dims = BOOK_DIMS[size];
  const { w, h, d } = dims;
  const isHard = dims.type === "hard";
  const isZine = dims.type === "zine";

  const group = new THREE.Group();

  // ─── Materials ───────────────────────────────────────────────────────────
  // [v2.1] Upgraded to MeshPhysicalMaterial so applyFinish() can set clearcoat
  // without rebuilding.  Materials are named so traversal-based finish updates
  // (BookScene) and Phase 2 GLTF integration can find them by name.
  const coverMat = new THREE.MeshPhysicalMaterial({
    name: "cover",
    map: coverTex ?? null,
    roughness: isHard ? 0.9 : 0.9,  // default matte; applyFinish overrides at runtime
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    color: coverTex ? new THREE.Color(0xffffff) : new THREE.Color(0x7040c0),
    emissive: coverTex ? new THREE.Color(0) : new THREE.Color(0x2a0060),
    emissiveIntensity: coverTex ? 0 : 0.25,
    side: THREE.FrontSide,
  });

  const spineMat = new THREE.MeshPhysicalMaterial({
    name: "spine",
    map: spineTex ?? null,
    roughness: 0.9,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    color: spineTex ? new THREE.Color(0xffffff) : new THREE.Color(0x4422aa),
    emissive: spineTex ? new THREE.Color(0) : new THREE.Color(0x150030),
    emissiveIntensity: spineTex ? 0 : 0.2,
  });

  const backMat = new THREE.MeshPhysicalMaterial({
    name: "back",
    map: backTex ?? null,
    roughness: 0.9,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    color: backTex ? new THREE.Color(0xffffff) : new THREE.Color(0x4422aa),
    emissive: backTex ? new THREE.Color(0) : new THREE.Color(0x150030),
    emissiveIntensity: backTex ? 0 : 0.2,
  });

  const pageMat = new THREE.MeshStandardMaterial({
    name: "pages",
    color: new THREE.Color(0xf0ead8),
    roughness: 0.92,
    metalness: 0.0,
  });

  const edgeMat = new THREE.MeshStandardMaterial({
    name: "edge",
    color: new THREE.Color(0x6a5080),
    roughness: 0.75,
    metalness: 0.0,
  });

  // ─── Page block ──────────────────────────────────────────────────────────
  const pageDepth = isZine ? d * 0.85 : d * 0.88;
  const pageGeo = new THREE.BoxGeometry(w - 0.12, h - (isHard ? 0.06 : 0.02), pageDepth);
  const pageMesh = new THREE.Mesh(pageGeo, pageMat);
  pageMesh.position.set(0.03, 0, 0); // slight offset toward fore-edge
  group.add(pageMesh);

  if (isZine) {
    // Saddle-stitched — just a thin folded page stack, no spine board
    const coverGeo = new THREE.BoxGeometry(w, h, 0.04);
    const frontCover = new THREE.Mesh(coverGeo, coverMat);
    frontCover.position.set(0, 0, d / 2 - 0.02);
    group.add(frontCover);

    const backCover = new THREE.Mesh(coverGeo, backMat);
    backCover.position.set(0, 0, -d / 2 + 0.02);
    group.add(backCover);
    return group;
  }

  // ─── Hard/soft cover boards ──────────────────────────────────────────────
  const lipX = isHard ? 0.125 : 0.0;
  const lipY = isHard ? 0.125 : 0.0;
  const boardThickness = isHard ? 0.08 : 0.04;

  // Front cover
  const frontGeo = new THREE.BoxGeometry(w + lipX * 2, h + lipY * 2, boardThickness);
  const frontBoard = new THREE.Mesh(frontGeo, coverMat);
  frontBoard.position.set(0, 0, pageDepth / 2 + boardThickness / 2);
  group.add(frontBoard);

  // Back cover
  const backGeo = new THREE.BoxGeometry(w + lipX * 2, h + lipY * 2, boardThickness);
  const backBoard = new THREE.Mesh(backGeo, backMat);
  backBoard.position.set(0, 0, -(pageDepth / 2 + boardThickness / 2));
  group.add(backBoard);

  // Spine
  const spineW = d;
  const spineGeo = new THREE.BoxGeometry(spineW, h + lipY * 2, boardThickness);
  const spineMesh = new THREE.Mesh(spineGeo, spineMat);
  spineMesh.rotation.y = Math.PI / 2;
  spineMesh.position.set(-(w / 2 + spineW / 2), 0, 0);
  group.add(spineMesh);

  // Top/bottom edges
  const edgeGeo = new THREE.BoxGeometry(w + lipX * 2, boardThickness, d + boardThickness);
  const topEdge = new THREE.Mesh(edgeGeo, edgeMat);
  topEdge.position.set(0, (h + lipY * 2) / 2 + boardThickness / 2, 0);
  group.add(topEdge);

  const bottomEdge = topEdge.clone();
  bottomEdge.position.set(0, -((h + lipY * 2) / 2 + boardThickness / 2), 0);
  group.add(bottomEdge);

  return group;
}
