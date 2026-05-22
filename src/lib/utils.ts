import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Build a CSS background string from a BackgroundPreset */
export function bgToCss(bg: {
  mode: string;
  value: string;
  value2?: string;
  angle?: number;
}): string {
  if (bg.mode === "gradient") {
    return `linear-gradient(${bg.angle ?? 135}deg, ${bg.value}, ${bg.value2 ?? bg.value})`;
  }
  return bg.value;
}
