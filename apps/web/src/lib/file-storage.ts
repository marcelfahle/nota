import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { del, get, put } from "@vercel/blob";

import { getStorageEnv } from "@/lib/env";

/**
 * Originals live in a private Blob store. Logos stay in the public one, so a
 * hosted install sets a second token; a single private store needs only the first.
 */
function privateToken(env: ReturnType<typeof getStorageEnv>) {
  return env.BLOB_PRIVATE_READ_WRITE_TOKEN ?? env.BLOB_READ_WRITE_TOKEN!;
}

/**
 * Private files on the configured backend (Vercel Blob, S3, or the local
 * directory). Nothing here is ever reachable by URL: callers read the bytes
 * and serve them behind their own authorization. Logos, which are public, live
 * in `logo-storage.ts` on the same backend.
 */

export function s3Client() {
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

/** Resolves a key under the local storage root and refuses anything that would escape it. */
export function localStorageFile(key: string) {
  const root = resolve(getStorageEnv().LOCAL_STORAGE_PATH);
  const path = resolve(root, key);
  if (!path.startsWith(`${root}${sep}`)) {
    throw new Error("Invalid storage path");
  }
  return path;
}

function isMissing(error: unknown) {
  const code = (error as { code?: string; name?: string } | null) ?? {};
  return code.code === "ENOENT" || code.name === "NoSuchKey" || code.name === "NotFound";
}

/**
 * Writes one private file. A key is written at most once per document; the
 * overwrite exists so a retry after a rolled-back issuance can reuse it.
 */
export async function putPrivateFile(key: string, content: Buffer, contentType: string) {
  const env = getStorageEnv();
  if (env.STORAGE === "vercel-blob") {
    await put(key, content, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      token: privateToken(env),
    });
    return;
  }
  if (env.STORAGE === "s3") {
    await s3Client().send(
      new PutObjectCommand({
        Body: content,
        Bucket: env.S3_BUCKET!,
        ContentType: contentType,
        Key: key,
      }),
    );
    return;
  }
  const path = localStorageFile(key);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, path);
}

/** The file's bytes, or null when nothing is stored under the key. */
export async function readPrivateFile(key: string): Promise<Buffer | null> {
  const env = getStorageEnv();
  if (env.STORAGE === "vercel-blob") {
    const result = await get(key, {
      access: "private",
      token: privateToken(env),
      useCache: false,
    });
    if (!result?.stream) {
      return null;
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  try {
    if (env.STORAGE === "s3") {
      const object = await s3Client().send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }),
      );
      return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
    }
    return await readFile(localStorageFile(key));
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}

/** Removes files for good. A key that is already gone is not an error. */
export async function deletePrivateFiles(keys: Array<string>) {
  if (keys.length === 0) {
    return;
  }
  const env = getStorageEnv();
  if (env.STORAGE === "vercel-blob") {
    await del(keys, { token: privateToken(env) });
    return;
  }
  for (const key of keys) {
    if (env.STORAGE === "s3") {
      await s3Client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }));
    } else {
      await rm(localStorageFile(key), { force: true });
    }
  }
}
