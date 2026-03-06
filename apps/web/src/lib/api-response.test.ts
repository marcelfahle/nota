import { expect, test } from "bun:test";

import { error, json, paginated } from "@/lib/api-response";

test("API response helpers build JSON payloads with the expected shapes", async () => {
  const okResponse = json({ ok: true }, 201);
  expect(okResponse.status).toBe(201);
  await expect(okResponse.json()).resolves.toEqual({ ok: true });

  const errorResponse = error("Unauthorized", 401);
  expect(errorResponse.status).toBe(401);
  await expect(errorResponse.json()).resolves.toEqual({ error: "Unauthorized" });

  const paginatedResponse = paginated([{ id: "1" }], { page: 1, perPage: 20, total: 1 });
  await expect(paginatedResponse.json()).resolves.toEqual({
    data: [{ id: "1" }],
    pagination: { page: 1, perPage: 20, total: 1 },
  });
});
