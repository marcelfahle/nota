import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { del, put } from "@vercel/blob";

import { getAppEnv, getStorageEnv } from "@/lib/env";

const BLOB_HOST_SUFFIX = "blob.vercel-storage.com";
const LOGO_CACHE_MAX_AGE = 60 * 60 * 24 * 365;
const SAFE_IMAGE_KEY = /^orgs\/[0-9a-f-]{36}\/(?:logo|favicon)\.(?:jpg|png|webp)$/;

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const logoContentTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type LogoContentType = keyof typeof logoContentTypes;
type LogoValidationResult = { contentType: LogoContentType; extension: string } | { error: string };
type LogoUploadResult = { url: string } | { error: string };

function assertSafeImageKey(key: string) {
  if (!SAFE_IMAGE_KEY.test(key)) {
    throw new Error("Invalid organization image path");
  }
  return key;
}

export function getLocalStorageFile(key: string) {
  const root = resolve(getStorageEnv().LOCAL_STORAGE_PATH);
  const path = resolve(root, assertSafeImageKey(key));
  if (!path.startsWith(`${root}${sep}`)) {
    throw new Error("Invalid organization image path");
  }
  return path;
}

function localPublicUrl(key: string) {
  return new URL(`/api/storage/${key}`, getAppEnv().APP_URL).toString();
}

function s3Client() {
  const env = getStorageEnv();
  return new S3Client({
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    region: env.S3_REGION,
  });
}

async function store(key: string, content: Buffer, contentType: LogoContentType) {
  assertSafeImageKey(key);
  const env = getStorageEnv();
  if (env.STORAGE === "vercel-blob") {
    const uploaded = await put(key, content, {
      access: "public",
      addRandomSuffix: true,
      cacheControlMaxAge: LOGO_CACHE_MAX_AGE,
      contentType,
      token: env.BLOB_READ_WRITE_TOKEN!,
    });
    return uploaded.url;
  }
  if (env.STORAGE === "s3") {
    await s3Client().send(
      new PutObjectCommand({
        Body: content,
        Bucket: env.S3_BUCKET!,
        CacheControl: `public, max-age=${LOGO_CACHE_MAX_AGE}, immutable`,
        ContentType: contentType,
        Key: key,
      }),
    );
    return new URL(key, `${env.S3_PUBLIC_URL!.replace(/\/$/, "")}/`).toString();
  }
  const path = getLocalStorageFile(key);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { mode: 0o644 });
  await rename(temporary, path);
  return localPublicUrl(key);
}

function managedKey(url: string) {
  const parsed = new URL(url);
  const localPrefix = "/api/storage/";
  if (
    parsed.origin === new URL(getAppEnv().APP_URL).origin &&
    parsed.pathname.startsWith(localPrefix)
  ) {
    return decodeURIComponent(parsed.pathname.slice(localPrefix.length));
  }
  const publicUrl = getStorageEnv().S3_PUBLIC_URL;
  if (publicUrl) {
    const base = new URL(publicUrl);
    const prefix = base.pathname.replace(/\/$/, "") + "/";
    if (parsed.origin === base.origin && parsed.pathname.startsWith(prefix)) {
      return decodeURIComponent(parsed.pathname.slice(prefix.length));
    }
  }
  return null;
}

export function isManagedLogoUrl(logoUrl: string | null | undefined) {
  if (!logoUrl) {
    return false;
  }
  try {
    return new URL(logoUrl).hostname.endsWith(BLOB_HOST_SUFFIX) || Boolean(managedKey(logoUrl));
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
  return { contentType, extension: logoContentTypes[contentType] };
}

export function buildOrgLogoPath(orgId: string, extension: string) {
  return assertSafeImageKey(`orgs/${orgId}/logo.${extension}`);
}

export function buildOrgFaviconPath(orgId: string, extension: string) {
  return assertSafeImageKey(`orgs/${orgId}/favicon.${extension}`);
}

export async function deleteManagedLogo(logoUrl: string | null | undefined) {
  if (!logoUrl || !isManagedLogoUrl(logoUrl)) {
    return;
  }
  try {
    if (new URL(logoUrl).hostname.endsWith(BLOB_HOST_SUFFIX)) {
      const env = getStorageEnv();
      if (env.BLOB_READ_WRITE_TOKEN) {
        await del(logoUrl, { token: env.BLOB_READ_WRITE_TOKEN });
      }
      return;
    }
    const key = managedKey(logoUrl);
    if (!key) {
      return;
    }
    assertSafeImageKey(key);
    const env = getStorageEnv();
    if (env.STORAGE === "s3") {
      await s3Client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }));
    } else if (env.STORAGE === "local") {
      await rm(getLocalStorageFile(key), { force: true });
    }
  } catch {
    // Best-effort cleanup must not block settings or workspace deletion.
  }
}

export async function uploadOrgLogo(orgId: string, file: File): Promise<LogoUploadResult> {
  return uploadOrgImage(buildOrgLogoPath, orgId, file);
}

export async function uploadOrgFavicon(orgId: string, file: File): Promise<LogoUploadResult> {
  return uploadOrgImage(buildOrgFaviconPath, orgId, file);
}

export async function storeOrgImage(kind: "favicon" | "logo", orgId: string, png: Buffer) {
  if (png.byteLength === 0 || png.byteLength > MAX_LOGO_BYTES) {
    return null;
  }
  try {
    const key = (kind === "logo" ? buildOrgLogoPath : buildOrgFaviconPath)(orgId, "png");
    return await store(key, png, "image/png");
  } catch {
    return null;
  }
}

async function uploadOrgImage(
  buildPath: (orgId: string, extension: string) => string,
  orgId: string,
  file: File,
): Promise<LogoUploadResult> {
  const validation = validateLogoFile(file);
  if ("error" in validation) {
    return validation;
  }
  try {
    const url = await store(
      buildPath(orgId, validation.extension),
      Buffer.from(await file.arrayBuffer()),
      validation.contentType,
    );
    return { url };
  } catch {
    return { error: "Logo upload failed. Please try again." };
  }
}
