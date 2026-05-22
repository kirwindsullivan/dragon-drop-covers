import * as THREE from "three";

/**
 * Maps the lighting pad (0–1 normalized XY) to a 3D point light position
 * orbiting the book. padX controls azimuth, padY controls elevation.
 */
export function padToLightPosition(
  padX: number,
  padY: number,
  radius = 4,
): THREE.Vector3 {
  const azimuth = (padX - 0.5) * Math.PI * 1.6;    // ±144°
  const elevation = (0.5 - padY) * Math.PI * 0.75; // ±67.5°
  const x = radius * Math.cos(elevation) * Math.sin(azimuth);
  const y = radius * Math.sin(elevation);
  const z = radius * Math.cos(elevation) * Math.cos(azimuth);
  return new THREE.Vector3(x, y, z);
}
