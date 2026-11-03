import { expect, test } from "bun:test";

import { fitImage, imageSize, imageSizeFromDataUri, LOGO_BOX } from "@/lib/image-size";

function png(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number) {
  // SOI, an APP0 segment to skip, then a baseline SOF0 with the dimensions.
  const bytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const view = new DataView(bytes.buffer);
  view.setUint16(13, height);
  view.setUint16(15, width);
  return bytes;
}

function webpLossless(width: number, height: number) {
  const bytes = new Uint8Array(32);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
  bytes[20] = 0x2f;
  new DataView(bytes.buffer).setUint32(21, (width - 1) | ((height - 1) << 14), true);
  return bytes;
}

test("reads dimensions from PNG, JPEG and WebP headers", () => {
  expect(imageSize(png(640, 160))).toEqual({ height: 160, width: 640 });
  expect(imageSize(jpeg(300, 300))).toEqual({ height: 300, width: 300 });
  expect(imageSize(webpLossless(1200, 150))).toEqual({ height: 150, width: 1200 });
  expect(imageSize(new Uint8Array(40))).toBeNull();
  expect(
    imageSize(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")),
  ).toBeNull();
});

test("reads the data URI the PDF renderer receives", () => {
  const src = `data:image/png;base64,${Buffer.from(png(88, 44)).toString("base64")}`;
  expect(imageSizeFromDataUri(src)).toEqual({ height: 44, width: 88 });
  expect(imageSizeFromDataUri("https://example.com/logo.png")).toBeNull();
});

test("fits a logo into the document box by its aspect ratio", () => {
  // A square mark fills the height; a wordmark fills the width; nothing distorts.
  expect(fitImage({ height: 512, width: 512 })).toEqual({ height: 40, width: 40 });
  expect(fitImage({ height: 100, width: 800 })).toEqual({ height: 20, width: 160 });
  expect(fitImage({ height: 100, width: 300 })).toEqual({ height: 40, width: 120 });
  expect(fitImage(null)).toEqual({ height: LOGO_BOX.height, width: LOGO_BOX.height });
});
