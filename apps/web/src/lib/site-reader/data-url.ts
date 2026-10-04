// Kept apart from logo.ts so code that only stores an image (registration)
// never loads the native image library.

export function toDataUrl(png: Buffer) {
  return `data:image/png;base64,${png.toString("base64")}`;
}

export function fromDataUrl(dataUrl: string) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}
