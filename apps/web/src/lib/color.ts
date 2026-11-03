/** Black or white, whichever reads better on the given hex background. */
export function readableTextColor(background: string) {
  const hex = /^#([\da-f]{6})$/i.exec(background)?.[1];
  if (!hex) {
    return "#ffffff";
  }
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const luminance = (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255;
  return luminance > 0.6 ? "#1f1b16" : "#ffffff";
}

/** A six-digit hex colour, or the fallback when the value is anything else. */
export function hexColor(value: string | null | undefined, fallback: string) {
  return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}
