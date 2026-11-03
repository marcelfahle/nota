export type ImageSize = { height: number; width: number };

/** The box a logo is fitted into on documents, in points. Wide wordmarks use the width, marks the height. */
export const LOGO_BOX: ImageSize = { height: 40, width: 160 };

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function size(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { height, width } : null;
}

/**
 * Pixel dimensions read from the file header of a PNG, JPEG, GIF or WebP
 * image, without decoding it. Null when the bytes are none of those.
 */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") {
    return size(view.getUint32(16), view.getUint32(20));
  }

  if (ascii(bytes, 0, 3) === "GIF") {
    return size(view.getUint16(6, true), view.getUint16(8, true));
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      // Padding, restart markers and the start marker carry no length.
      if (
        marker === 0xff ||
        marker === 0xd8 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        offset += marker === 0xff ? 1 : 2;
        continue;
      }
      const startOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (startOfFrame) {
        return size(view.getUint16(offset + 7), view.getUint16(offset + 5));
      }
      offset += 2 + view.getUint16(offset + 2);
    }
    return null;
  }

  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    const chunk = ascii(bytes, 12, 16);
    if (chunk === "VP8 " && bytes.length >= 30) {
      return size(view.getUint16(26, true) & 0x3f_ff, view.getUint16(28, true) & 0x3f_ff);
    }
    if (chunk === "VP8L" && bytes.length >= 25) {
      const bits = view.getUint32(21, true);
      return size((bits & 0x3f_ff) + 1, ((bits >>> 14) & 0x3f_ff) + 1);
    }
    if (chunk === "VP8X" && bytes.length >= 30) {
      return size(
        1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
        1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
      );
    }
  }

  return null;
}

/** Dimensions of an inline `data:image/...;base64,` image, as the PDF renderer receives it. */
export function imageSizeFromDataUri(src: string): ImageSize | null {
  const comma = src.indexOf(",");
  if (!src.startsWith("data:") || comma === -1 || !src.slice(0, comma).endsWith(";base64")) {
    return null;
  }
  try {
    return imageSize(new Uint8Array(Buffer.from(src.slice(comma + 1), "base64")));
  } catch {
    return null;
  }
}

/**
 * Scales an image to fill the box in one dimension while keeping its aspect
 * ratio: a square mark becomes box-height square, a wide wordmark takes the
 * box width. Unknown dimensions fall back to a box-height square.
 */
export function fitImage(image: ImageSize | null, box: ImageSize = LOGO_BOX): ImageSize {
  if (!image) {
    return { height: box.height, width: box.height };
  }
  const scale = Math.min(box.width / image.width, box.height / image.height);
  return {
    height: Math.round(image.height * scale * 100) / 100,
    width: Math.round(image.width * scale * 100) / 100,
  };
}
