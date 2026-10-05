import { readFile } from "node:fs/promises";

import { getStorageEnv } from "@/lib/env";
import { getLocalStorageFile } from "@/lib/logo-storage";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: Array<string> }> },
) {
  if (getStorageEnv().STORAGE !== "local") {
    return new Response("Not found", { status: 404 });
  }
  try {
    const key = (await params).path.join("/");
    const extension = key.split(".").at(-1) ?? "";
    const content = await readFile(getLocalStorageFile(key));
    return new Response(content, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
