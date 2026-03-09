import { del, put } from "@vercel/blob";
import { z } from "zod";

const BLOB_HOST_SUFFIX = "blob.vercel-storage.com";
const LOGO_CACHE_MAX_AGE = 60 * 60 * 24 * 365;
const logoUploadEnvSchema = z.object({
  BLOB_READ_WRITE_TOKEN: z.string().min(1, "BLOB_READ_WRITE_TOKEN is required for logo uploads"),
});

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const logoContentTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type LogoContentType = keyof typeof logoContentTypes;

type LogoValidationResult =
  | {
      contentType: LogoContentType;
      extension: string;
    }
  | {
      error: string;
    };

type LogoUploadResult =
  | {
      url: string;
    }
  | {
      error: string;
    };

function getLogoUploadToken() {
  const result = logoUploadEnvSchema.safeParse(process.env);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Logo uploads are not configured" };
  }

  return result.data.BLOB_READ_WRITE_TOKEN;
}

export function isManagedLogoUrl(logoUrl: string | null | undefined) {
  if (!logoUrl) {
    return false;
  }

  try {
    return new URL(logoUrl).hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

export function validateLogoFile(file: File): LogoValidationResult {
  if (file.size <= 0) {
    return { error: "Choose a logo file to upload" };
  }

  if (file.size > MAX_LOGO_BYTES) {
    return { error: "Logo files must be 2 MB or smaller" };
  }

  const contentType = file.type as LogoContentType;
  if (!(contentType in logoContentTypes)) {
    return { error: "Logos must be PNG, JPG, or WebP files" };
  }

  return {
    contentType,
    extension: logoContentTypes[contentType],
  };
}

export function buildOrgLogoPath(orgId: string, extension: string) {
  return `orgs/${orgId}/logo.${extension}`;
}

export async function deleteManagedLogo(logoUrl: string | null | undefined) {
  if (!logoUrl || !isManagedLogoUrl(logoUrl)) {
    return;
  }

  const token = getLogoUploadToken();
  if (typeof token !== "string") {
    return;
  }

  try {
    await del(logoUrl, { token });
  } catch {
    // Best effort cleanup: a stale Blob should not block settings updates.
  }
}

export async function uploadOrgLogo(orgId: string, file: File): Promise<LogoUploadResult> {
  const validation = validateLogoFile(file);
  if ("error" in validation) {
    return validation;
  }

  const token = getLogoUploadToken();
  if (typeof token !== "string") {
    return token;
  }

  try {
    const uploaded = await put(buildOrgLogoPath(orgId, validation.extension), file, {
      access: "public",
      addRandomSuffix: true,
      cacheControlMaxAge: LOGO_CACHE_MAX_AGE,
      contentType: validation.contentType,
      token,
    });

    return {
      url: uploaded.url,
    };
  } catch {
    return {
      error: "Logo upload failed. Please try again.",
    };
  }
}
