import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { LookupFunction } from "node:net";
import { gzipSync } from "node:zlib";

import {
  assertSafeUrl,
  guardedLookup,
  isPublicAddress,
  normalizeWebsite,
  safeFetch,
  UnsafeUrlError,
} from "./safe-fetch";

describe("isPublicAddress", () => {
  test.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.9",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "not-an-ip",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  test.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe("assertSafeUrl", () => {
  test.each([
    "ftp://example.com/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://localhost/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://intranet/",
    "http://printer.local/",
    "http://db.internal/",
    "https://example.com:8443/",
    "https://user:pass@example.com/",
    "not a url",
  ])("refuses %s", (url) => {
    expect(() => assertSafeUrl(url)).toThrow(UnsafeUrlError);
  });

  test("allows a plain public site", () => {
    expect(assertSafeUrl("https://example.com/about").hostname).toBe("example.com");
  });
});

test("the guarded lookup refuses a name that resolves to loopback", async () => {
  const error = await new Promise<Error | null>((resolve) => {
    guardedLookup("localhost", {}, (failure) => resolve(failure));
  });
  expect(error).toBeInstanceOf(UnsafeUrlError);
});

test("normalizeWebsite turns what a visitor types into a root URL", () => {
  expect(normalizeWebsite(" BoldVideo.com ")).toEqual({
    domain: "boldvideo.com",
    url: "https://boldvideo.com/",
  });
  expect(normalizeWebsite("https://www.studio.de/ueber-uns?x=1")).toEqual({
    domain: "studio.de",
    url: "https://www.studio.de/",
  });
  expect(normalizeWebsite("localhost:3000")).toBeNull();
  expect(normalizeWebsite("192.168.0.1")).toBeNull();
  expect(normalizeWebsite("two words")).toBeNull();
  expect(normalizeWebsite("")).toBeNull();
});

describe("safeFetch", () => {
  let server: Server;
  let port = 0;
  // Stands in for public DNS: "site.test" is the fixture server, and anything
  // else goes through the real guard.
  const lookup: LookupFunction = (hostname, options, callback) => {
    if (hostname === "site.example") {
      if (options.all) {
        callback(null, [{ address: "127.0.0.1", family: 4 }]);
      } else {
        callback(null, "127.0.0.1", 4);
      }
      return;
    }
    guardedLookup(hostname, options, callback);
  };
  const options = () => ({ allowPorts: [port], lookup, timeoutMs: 3000 });

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/to-metadata") {
        response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        response.end();
      } else if (request.url === "/to-localhost") {
        response.writeHead(302, { location: `http://localhost:${port}/secret` });
        response.end();
      } else if (request.url === "/to-file") {
        response.writeHead(302, { location: "file:///etc/passwd" });
        response.end();
      } else if (request.url === "/loop") {
        response.writeHead(302, { location: "/loop" });
        response.end();
      } else if (request.url === "/hop") {
        response.writeHead(301, { location: "/page" });
        response.end();
      } else if (request.url === "/bomb") {
        response.writeHead(200, { "content-encoding": "gzip", "content-type": "text/html" });
        response.end(gzipSync(Buffer.alloc(5_000_000, "a")));
      } else {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<title>ok</title>");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
  });

  test("fetches a page and follows a same-site redirect", async () => {
    const response = await safeFetch(`http://site.example:${port}/hop`, options());
    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe("<title>ok</title>");
    expect(response.url).toBe(`http://site.example:${port}/page`);
  });

  test.each(["/to-metadata", "/to-localhost", "/to-file", "/loop"])(
    "refuses the redirect at %s",
    async (path) => {
      await expect(safeFetch(`http://site.example:${port}${path}`, options())).rejects.toThrow(
        UnsafeUrlError,
      );
    },
  );

  test("stops a compressed body at the byte cap", async () => {
    const response = await safeFetch(`http://site.example:${port}/bomb`, {
      ...options(),
      maxBytes: 50_000,
    });
    expect(response.truncated).toBe(true);
    expect(response.body.length).toBe(50_000);
  });

  test("refuses an internal address before any request is made", async () => {
    await expect(safeFetch(`http://127.0.0.1:${port}/`, options())).rejects.toThrow(UnsafeUrlError);
  });
});
