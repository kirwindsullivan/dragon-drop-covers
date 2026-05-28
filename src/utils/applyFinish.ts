/**
 * [v2.1] applyFinish — material finish utility
 *
 * Applies one of three finish presets (Matte / Satin / Gloss) to any
 * THREE.MeshPhysicalMaterial in-place.  Designed so Phase 2 GLTF integration
 * can call this on its own cover materials without changes here.
 */

import * as THREE from "three";
import type { FinishType } from "@/types";

export type { FinishType };

export const FINISH_SETTINGS: Record<
  FinishType,
  {
    roughness:          number;
    metalness:          number;
    clearcoat:          number;
    clearcoatRoughness: number;
  }
> = {
  matte: { roughness: 0.9,  metalness: 0.0, clearcoat: 0.0,  clearcoatRoughness: 0.0 },
  satin: { roughness: 0.5,  metalness: 0.0, clearcoat: 0.3,  clearcoatRoughness: 0.4 },
  gloss: { roughness: 0.15, metalness: 0.0, clearcoat: 1.0,  clearcoatRoughness: 0.1 },
};

/**
 * Mutates a MeshPhysicalMaterial to match the requested finish.
 * Call with any material whose name is "cover", "spine", or "back" to keep
 * Phase 2 consistent: find the material by name, call applyFinish.
 */
export function applyFinish(
  material: THREE.MeshPhysicalMaterial,
  finish: FinishType,
): void {
  const s = FINISH_SETTINGS[finish];
  material.roughness          = s.roughness;
  material.metalness          = s.metalness;
  material.clearcoat          = s.clearcoat;
  material.clearcoatRoughness = s.clearcoatRoughness;
  material.needsUpdate        = true;
}
