import sharp from "sharp";

import { safeFetch, type SafeFetchOptions } from "./safe-fetch";

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

/**
 * Re-encodes any fetched image as a small PNG. We never store or serve a
 * site's original bytes: an SVG is rasterised, so scripts in it die here.
 */
export async function reencodeImage(source: Buffer, size: number) {
  try {
    const image = sharp(source, { density: 192, limitInputPixels: 24_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      return null;
    }
    const png = await image
      .resize({ fit: "inside", height: size, width: size, withoutEnlargement: !metadata.density })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    return { height: metadata.height, png, width: metadata.width };
  } catch {
    return null;
  }
}

/** The most common saturated colours in an image, strongest first, as hex. */
export async function dominantColors(png: Buffer) {
  try {
    const { data } = await sharp(png)
      .resize(48, 48, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const counts = new Map<number, { blue: number; count: number; green: number; red: number }>();
    let opaque = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 200) {
        continue;
      }
      opaque += 1;
      const [red, green, blue] = [data[index], data[index + 1], data[index + 2]];
      // 4 bits per channel: anti-aliased edges fall into their neighbour's bucket.
      const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
      const entry = counts.get(key) ?? { blue: 0, count: 0, green: 0, red: 0 };
      entry.red += red;
      entry.green += green;
      entry.blue += blue;
      entry.count += 1;
      counts.set(key, entry);
    }
    return [...counts.values()]
      .filter((entry) => entry.count / Math.max(opaque, 1) > 0.06)
      .sort((left, right) => right.count - left.count)
      .slice(0, 4)
      .map(
        (entry) =>
          `#${[entry.red, entry.green, entry.blue]
            .map((sum) =>
              Math.round(sum / entry.count)
                .toString(16)
                .padStart(2, "0"),
            )
            .join("")}`,
      );
  } catch {
    return [];
  }
}

export function toDataUrl(png: Buffer) {
  return `data:image/png;base64,${png.toString("base64")}`;
}

export function fromDataUrl(dataUrl: string) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

/** First candidate that downloads and decodes, as a PNG data URL. */
export async function fetchImage(
  candidates: Array<string>,
  size: number,
  options: SafeFetchOptions = {},
) {
  for (const url of candidates) {
    try {
      const response = await safeFetch(url, {
        accept: "image/*",
        maxBytes: MAX_SOURCE_BYTES,
        timeoutMs: 5000,
        ...options,
      });
      if (response.status !== 200 || response.truncated) {
        continue;
      }
      const encoded = await reencodeImage(response.body, size);
      // Tracking pixels and blank placeholders are not logos.
      if (encoded && encoded.width >= 16 && encoded.height >= 16) {
        return toDataUrl(encoded.png);
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}
