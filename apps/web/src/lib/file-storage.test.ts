import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The local backend, end to end. Blob and S3 need credentials and are exercised in staging.
const root = mkdtempSync(join(tmpdir(), "nota-file-storage-"));
process.env.STORAGE = "local";
process.env.LOCAL_STORAGE_PATH = root;

const { deletePrivateFiles, localStorageFile, putPrivateFile, readPrivateFile } =
  await import("./file-storage");

afterAll(() => {
  rmSync(root, { force: true, recursive: true });
});

test("a private file round-trips byte for byte and disappears on delete", async () => {
  const key = "invoices/org/inv/INV-0001.pdf";
  const content = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x10]);
  await putPrivateFile(key, content, "application/pdf");
  expect((await readPrivateFile(key))?.equals(content)).toBe(true);
  await deletePrivateFiles([key]);
  expect(await readPrivateFile(key)).toBeNull();
  // Deleting again is not an error.
  await deletePrivateFiles([key]);
});

test("nothing is stored under a missing key, and keys cannot leave the storage root", async () => {
  expect(await readPrivateFile("invoices/none/none/missing.pdf")).toBeNull();
  expect(() => localStorageFile("../outside.pdf")).toThrow("Invalid storage path");
  expect(() => localStorageFile("/etc/passwd")).toThrow("Invalid storage path");
});
