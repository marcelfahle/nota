import { expect, test } from "bun:test";

import {
  MAX_LOGO_BYTES,
  buildOrgLogoPath,
  isManagedLogoUrl,
  validateLogoFile,
} from "@/lib/logo-storage";

test("validateLogoFile accepts supported logo formats", () => {
  expect(
    validateLogoFile(new File([new Uint8Array([1])], "logo.png", { type: "image/png" })),
  ).toEqual({
    contentType: "image/png",
    extension: "png",
  });
  expect(
    validateLogoFile(new File([new Uint8Array([1])], "logo.jpg", { type: "image/jpeg" })),
  ).toEqual({
    contentType: "image/jpeg",
    extension: "jpg",
  });
  expect(
    validateLogoFile(new File([new Uint8Array([1])], "logo.webp", { type: "image/webp" })),
  ).toEqual({
    contentType: "image/webp",
    extension: "webp",
  });
});

test("validateLogoFile rejects unsupported formats and oversize files", () => {
  expect(
    validateLogoFile(new File([new Uint8Array([1])], "logo.svg", { type: "image/svg+xml" })),
  ).toEqual({
    error: "Logos must be PNG, JPG, or WebP files",
  });
  expect(
    validateLogoFile(
      new File([new Uint8Array(MAX_LOGO_BYTES + 1)], "logo.png", { type: "image/png" }),
    ),
  ).toEqual({
    error: "Logo files must be 2 MB or smaller",
  });
});

test("managed logo helpers only target Blob-hosted assets", () => {
  expect(buildOrgLogoPath("org_123", "png")).toBe("orgs/org_123/logo.png");
  expect(
    isManagedLogoUrl("https://store.public.blob.vercel-storage.com/orgs/org_123/logo.png"),
  ).toBe(true);
  expect(isManagedLogoUrl("https://example.com/logo.png")).toBe(false);
  expect(isManagedLogoUrl("nota-logo")).toBe(false);
});
