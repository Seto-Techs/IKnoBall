/**
 * WCAG 2.0 relative luminance — sRGB to linear, then weighted sum.
 * Returns 0..1; higher = lighter.
 */
export function getLuminance(hex: string): number {
  const r = hexToLinear(hex, 1);
  const g = hexToLinear(hex, 3);
  const b = hexToLinear(hex, 5);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * True when the color is light enough that dark text should
 * be used on top of it. Threshold ≈ luminance 0.25.
 */
export function isLightColor(hex: string): boolean {
  return getLuminance(hex) >= 0.25;
}

/**
 * Returns the WCAG 2.0 contrast ratio between two hex colors.
 */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToLinear(hex: string, start: number): number {
  const c = parseInt(hex.slice(start, start + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Darken a hex color by a given amount (0..1).
 * darken('#C4CED4', 0.12) → '#ACB5BA'
 */
export function darken(hex: string, amount: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount));
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount));
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
