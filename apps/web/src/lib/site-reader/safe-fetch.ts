import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

// The reader fetches URLs typed by anonymous visitors, so every request is
// treated as hostile: public addresses only, checked at connection time.

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid)$/i;
const MAX_REDIRECTS = 4;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    return !blocked.check(address, "ipv4");
  }
  if (family === 6) {
    // IPv4-mapped addresses (::ffff:10.0.0.1) are judged as the IPv4 they carry.
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (mapped) {
      return !blocked.check(mapped, "ipv4");
    }
    if (/^::ffff:/i.test(address)) {
      return false;
    }
    return !blocked.check(address, "ipv6");
  }
  return false;
}

/** Throws unless the URL is plain http(s) on a standard port with a public-looking host. */
export function assertSafeUrl(input: string | URL, options: { allowPorts?: Array<number> } = {}) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Credentials in URLs are not allowed");
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443 && !options.allowPorts?.includes(port)) {
    throw new UnsafeUrlError("Only standard ports are allowed");
  }
  const host = url.hostname.replaceAll(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(host)) {
    if (!isPublicAddress(host)) {
      throw new UnsafeUrlError("Address is not public");
    }
  } else if (!host.includes(".") || BLOCKED_HOSTS.test(host) || /^[\d.]+$|^0x/i.test(host)) {
    // Bare names and numeric lookalikes (2130706433, 0x7f.1) never reach DNS.
    throw new UnsafeUrlError("Host is not public");
  }
  return url;
}

/** DNS lookup that refuses any answer containing a non-public address. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 0);
      return;
    }
    const list = Array.isArray(addresses) ? addresses : [];
    if (list.length === 0 || list.some((entry) => !isPublicAddress(entry.address))) {
      callback(new UnsafeUrlError("Host resolves to a non-public address"), "", 0);
      return;
    }
    if (options.all) {
      callback(null, list);
      return;
    }
    callback(null, list[0].address, list[0].family);
  });
};

export type SafeResponse = {
  body: Buffer;
  contentType: string;
  status: number;
  /** True when the body was cut at maxBytes. */
  truncated: boolean;
  url: string;
};

export type SafeFetchOptions = {
  accept?: string;
  /** Test only: extra ports beyond 80 and 443. */
  allowPorts?: Array<number>;
  /** Test only: replaces the guarded DNS lookup. */
  lookup?: LookupFunction;
  maxBytes?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const USER_AGENT = "Mozilla/5.0 (compatible; NotaReader/1.0; +https://withnota.com)";

function requestOnce(url: URL, options: SafeFetchOptions, deadline: number) {
  return new Promise<{ location?: string; response?: SafeResponse }>((resolve, reject) => {
    const maxBytes = options.maxBytes ?? 1_500_000;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new Error("Timed out"));
      return;
    }
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        // A fresh socket per request, so the lookup guard always runs.
        agent: false,
        headers: {
          accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en,de;q=0.8,es;q=0.7",
          "user-agent": USER_AGENT,
        },
        lookup: options.lookup ?? guardedLookup,
        method: "GET",
        // Explicit SNI: the socket connects to a looked-up address.
        servername: isIP(url.hostname) ? undefined : url.hostname,
        signal: options.signal,
        timeout: remaining,
      },
      (incoming) => {
        const status = incoming.statusCode ?? 0;
        if (status >= 300 && status < 400 && incoming.headers.location) {
          incoming.resume();
          resolve({ location: incoming.headers.location });
          return;
        }
        const encoding = String(incoming.headers["content-encoding"] ?? "").toLowerCase();
        const decoder =
          encoding === "gzip"
            ? createGunzip()
            : encoding === "br"
              ? createBrotliDecompress()
              : encoding === "deflate"
                ? createInflate()
                : null;
        const stream = decoder ? incoming.pipe(decoder) : incoming;
        const chunks: Array<Buffer> = [];
        let size = 0;
        let settled = false;
        const finish = (truncated: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve({
            response: {
              body: Buffer.concat(chunks).subarray(0, maxBytes),
              contentType: String(incoming.headers["content-type"] ?? ""),
              status,
              truncated,
              url: url.href,
            },
          });
        };
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          // The cap counts decompressed bytes, so a compression bomb stops here too.
          if (size >= maxBytes) {
            finish(true);
            request.destroy();
          }
        });
        stream.on("end", () => finish(false));
        stream.on("error", (error) => (settled ? undefined : reject(error)));
      },
    );
    request.on("timeout", () => request.destroy(new Error("Timed out")));
    request.on("error", reject);
    request.end();
  });
}

/**
 * GET a public URL. Redirects are followed by hand so each hop is re-validated;
 * the connection itself is pinned to an address the guard approved.
 */
export async function safeFetch(
  input: string | URL,
  options: SafeFetchOptions = {},
): Promise<SafeResponse> {
  const deadline = Date.now() + (options.timeoutMs ?? 8000);
  let url = assertSafeUrl(input, options);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await requestOnce(url, options, deadline);
    if (result.response) {
      return result.response;
    }
    url = assertSafeUrl(new URL(result.location!, url), options);
  }
  throw new UnsafeUrlError("Too many redirects");
}

/** Turns what a visitor typed ("bold.video", "www.x.de/about") into the site's root URL. */
export function normalizeWebsite(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.length > 253 || /\s/.test(trimmed)) {
    return null;
  }
  try {
    const url = assertSafeUrl(
      /^[a-z][a-z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    const domain = url.hostname.replace(/^www\./, "");
    return { domain, url: `${url.protocol}//${url.hostname}/` };
  } catch {
    return null;
  }
}
