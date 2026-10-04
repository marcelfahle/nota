import type { BrandColorCandidate } from "./types";

const INK = "#1F1B16";

type Rgb = [number, number, number];

function toHex([red, green, blue]: Rgb) {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const match = lightness - chroma / 2;
  return [red, green, blue].map((channel) => Math.round((channel + match) * 255)) as Rgb;
}

export function parseColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const hex = text.match(/^#([\da-f]{3,8})$/)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      // #rgba with a mostly transparent alpha is an overlay, not a brand colour.
      if (hex.length === 4 && Number.parseInt(hex[3], 16) < 12) {
        return null;
      }
      return [0, 1, 2].map((index) => Number.parseInt(hex[index] + hex[index], 16)) as Rgb;
    }
    if (hex.length === 6 || hex.length === 8) {
      if (hex.length === 8 && Number.parseInt(hex.slice(6), 16) < 200) {
        return null;
      }
      return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as Rgb;
    }
    return null;
  }
  const call = text.match(/^(rgb|hsl)a?\(([^)]+)\)$/);
  if (!call) {
    return null;
  }
  const parts = call[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const alpha = parts[3]
    ? parts[3].endsWith("%")
      ? Number.parseFloat(parts[3]) / 100
      : Number(parts[3])
    : 1;
  if (!(alpha >= 0.8)) {
    return null;
  }
  if (call[1] === "rgb") {
    const channels = parts
      .slice(0, 3)
      .map((part) => (part.endsWith("%") ? (Number.parseFloat(part) / 100) * 255 : Number(part)));
    return channels.every((channel) => channel >= 0 && channel <= 255)
      ? (channels.map(Math.round) as Rgb)
      : null;
  }
  const hue = Number.parseFloat(parts[0]);
  const saturation = Number.parseFloat(parts[1]) / 100;
  const lightness = Number.parseFloat(parts[2]) / 100;
  return [hue, saturation, lightness].every(Number.isFinite)
    ? hslToRgb(hue, saturation, lightness)
    : null;
}

function luminance([red, green, blue]: Rgb) {
  return [red, green, blue]
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(left: number, right: number) {
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

/** Ink or white, whichever reads better on the colour. */
export function contrastText(hex: string) {
  const rgb = parseColor(hex);
  if (!rgb) {
    return INK;
  }
  const value = luminance(rgb);
  return contrast(value, luminance(parseColor(INK)!)) >= contrast(value, 1) ? INK : "#FFFFFF";
}

function saturationOf([red, green, blue]: Rgb) {
  const max = Math.max(red, green, blue) / 255;
  const min = Math.min(red, green, blue) / 255;
  const lightness = (max + min) / 2;
  return {
    lightness,
    saturation: max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1)),
  };
}

function isNeutral(rgb: Rgb) {
  const { lightness, saturation } = saturationOf(rgb);
  return saturation < 0.18 || lightness < 0.1 || lightness > 0.93;
}

function distance(left: Rgb, right: Rgb) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

const COLOR_PATTERN = /#[\da-f]{3,8}\b|(?:rgb|hsl)a?\([^)]{5,40}\)/gi;
const BRAND_HINT = /--[\w-]*(brand|primary|accent|theme|main|highlight|cta)[\w-]*\s*:\s*$/i;
const FILL_HINT = /(background(-color)?|fill|border-color|--[\w-]+)\s*:\s*$/i;

/**
 * Up to three brand colour candidates, most likely first. The logo's own
 * colours outrank the site's `theme-color`, which outranks anything counted
 * in the stylesheets.
 */
export function pickBrandColors(
  css: string,
  themeColor?: string | null,
  logoColors: Array<string> = [],
): Array<BrandColorCandidate> {
  const scores = new Map<string, { rgb: Rgb; score: number }>();
  const add = (rgb: Rgb, score: number) => {
    if (isNeutral(rgb)) {
      return;
    }
    const key = toHex(rgb);
    const entry = scores.get(key) ?? { rgb, score: 0 };
    entry.score += score;
    scores.set(key, entry);
  };

  logoColors.forEach((color, index) => {
    const rgb = parseColor(color);
    if (rgb) {
      add(rgb, 5000 - index * 500);
    }
  });
  const theme = themeColor ? parseColor(themeColor) : null;
  if (theme) {
    add(theme, 1000);
  }
  for (const match of css.slice(0, 2_000_000).matchAll(COLOR_PATTERN)) {
    const rgb = parseColor(match[0]);
    if (!rgb) {
      continue;
    }
    const before = css.slice(Math.max(0, match.index - 60), match.index);
    add(rgb, BRAND_HINT.test(before) ? 25 : FILL_HINT.test(before) ? 3 : 1);
  }

  const ranked = [...scores.values()].sort((left, right) => right.score - left.score);
  const picked: Array<{ rgb: Rgb; score: number }> = [];
  for (const candidate of ranked) {
    // Shades of one colour collapse into the strongest of them.
    if (picked.every((entry) => distance(entry.rgb, candidate.rgb) > 60)) {
      picked.push(candidate);
    }
    if (picked.length === 3) {
      break;
    }
  }
  return picked.map(({ rgb }) => {
    const hex = toHex(rgb);
    return { hex, text: contrastText(hex) };
  });
}
