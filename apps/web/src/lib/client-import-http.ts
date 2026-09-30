import { z } from "zod";

import { ClientImportError } from "@/lib/client-import";
import { importClientsCsv, previewClientsCsv } from "@/lib/client-import-service";

const payloadSchema = z.discriminatedUnion("mode", [
  z.object({ csv: z.string().min(1), mode: z.literal("preview") }),
  z.object({
    csv: z.string().min(1),
    mode: z.literal("commit"),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function handleClientImport(
  request: Request,
  auth: Parameters<typeof previewClientsCsv>[0],
) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Send a JSON request." }, { status: 415 });
  }
  let payload: z.infer<typeof payloadSchema>;
  try {
    const reader = request.body?.getReader();
    if (!reader) {
      return Response.json({ error: "CSV is required." }, { status: 400 });
    }
    const chunks: Array<Uint8Array> = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return Response.json({ error: "This upload is too large." }, { status: 413 });
      }
      chunks.push(value);
    }
    const result = payloadSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!result.success) {
      return Response.json(
        { error: "Provide CSV text and a valid preview or commit request." },
        { status: 400 },
      );
    }
    payload = result.data;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    if (payload.mode === "preview") {
      return Response.json({ data: await previewClientsCsv(auth, payload.csv) });
    }
    const result = await importClientsCsv(auth, payload.csv, payload.previewHash);
    return result.stale
      ? Response.json(
          {
            data: result.preview,
            error: "Your client list changed. Review the refreshed preview before adding clients.",
          },
          { status: 409 },
        )
      : Response.json({ data: result });
  } catch (error) {
    if (error instanceof ClientImportError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "The import could not finish. Your existing clients are intact. Try again." },
      { status: 500 },
    );
  }
}
