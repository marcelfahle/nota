import { expect, test } from "bun:test";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated subprocesses keep tests away from ~/.nota and exercise process locks.
test("concurrent refresh rotates once, credentials stay private, URL changes clear login", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nota-config-test-"));
  let refreshes = 0;
  let issuer = "";
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/.well-known/oauth-authorization-server")
        return Response.json({
          issuer,
          code_challenge_methods_supported: ["S256"],
          authorization_endpoint: `${issuer}/authorize`,
          registration_endpoint: `${issuer}/register`,
          token_endpoint: `${issuer}/token`,
          revocation_endpoint: `${issuer}/revoke`,
        });
      if (url.pathname === "/token") {
        refreshes++;
        expect(new URLSearchParams(await request.text()).get("refresh_token")).toBe(
          "original-refresh",
        );
        await Bun.sleep(100);
        return Response.json({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      return new Response(null, { status: 404 });
    },
  });
  issuer = `http://127.0.0.1:${server.port}`;
  const moduleUrl = new URL("../src/config.ts", import.meta.url).href;
  async function run(code: string) {
    const process = Bun.spawn(
      ["bun", "--eval", `const c = await import(${JSON.stringify(moduleUrl)}); ${code}`],
      {
        env: { ...Bun.env, NOTA_CONFIG_DIR: directory, NOTA_API_KEY: "", NOTA_URL: "" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [out, err, status] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    if (status) throw new Error(err);
    return out;
  }
  try {
    await run(
      `await c.updateConfig({ url: ${JSON.stringify(issuer)}, oauth: { issuer: ${JSON.stringify(issuer)}, clientId: "client", accessToken: "old-access", refreshToken: "original-refresh", expiresAt: 1 } });`,
    );
    await Promise.all(Array.from({ length: 4 }, () => run("await c.createConfiguredClient({});")));
    expect(refreshes).toBe(1);
    expect(
      JSON.parse(await readFile(join(directory, "config.json"), "utf8")).oauth.refreshToken,
    ).toBe("new-refresh");
    expect((await stat(join(directory, "config.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect(
      await run(
        `try { await c.createConfiguredClient({ NOTA_URL: "https://other.example" }); } catch(e) { console.log(e.message); }`,
      ),
    ).toContain("differs from your saved login");
    await run('await c.updateConfig({ url: "https://other.example" });');
    expect(
      JSON.parse(await readFile(join(directory, "config.json"), "utf8")).oauth,
    ).toBeUndefined();
    await run('await c.updateConfig({ apiKey: "nota_test_key" }); await c.clearLogin();');
    expect(JSON.parse(await readFile(join(directory, "config.json"), "utf8"))).toEqual({
      url: "https://other.example",
    });
  } finally {
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
