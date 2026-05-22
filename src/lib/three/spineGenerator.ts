"use client";

/**
 * Generates the spine and back cover textures algorithmically from the
 * dominant colors sampled from the front cover image.
 */

/** Simple k-means color quantizer, returns [r,g,b] dominant colors. */
function sampleDominantColors(
  imgEl: HTMLImageElement,
  count = 3,
): [number, number, number][] {
  const canvas = document.createElement("canvas");
  const SIZE = 64;
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(imgEl, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  const pixels: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  // Simple median-cut approximation: pick count most-spread pixels
  const step = Math.floor(pixels.length / count);
  const centers: [number, number, number][] = [];
  for (let i = 0; i < count; i++) centers.push(pixels[i * step]);
  return centers;
}

function rgbToHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

export function generateSpineTexture(
  imgEl: HTMLImageElement,
  title: string,
  width = 128,
  height = 512,
): HTMLCanvasElement {
  const colors = sampleDominantColors(imgEl, 2);
  const c1 = rgbToHex(colors[0]);
  const c2 = rgbToHex(colors[1] ?? colors[0]);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (title) {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.max(10, Math.min(20, width * 0.55));
    ctx.font = `bold ${fontSize}px serif`;
    ctx.fillText(title, 0, 0);
    ctx.restore();
  }

  return canvas;
}

export function generateBackTexture(
  imgEl: HTMLImageElement,
  width = 512,
  height = 720,
): HTMLCanvasElement {
  const colors = sampleDominantColors(imgEl, 3);
  const c1 = rgbToHex(colors[0]);
  const c2 = rgbToHex(colors[2] ?? colors[1] ?? colors[0]);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, c2);
  grad.addColorStop(1, c1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle vignette
  const vgGrad = ctx.createRadialGradient(
    width / 2, height / 2, height * 0.2,
    width / 2, height / 2, height * 0.8,
  );
  vgGrad.addColorStop(0, "rgba(0,0,0,0)");
  vgGrad.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vgGrad;
  ctx.fillRect(0, 0, width, height);

  return canvas;
}
