"use client";

import { useEffect, useState } from "react";

// Looks like a complete domain: at least one dot and a real-looking ending.
const DOMAIN =
  /^(?:https?:\/\/)?((?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,24})(?:[/:?#].*)?$/i;
const PATHS = ["/favicon.ico", "/apple-touch-icon.png", "/favicon.svg", "/icon.svg"];
const SETTLE_MS = 350;
const LOAD_TIMEOUT_MS = 2500;

function load(url: string, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    const finish = (ok: boolean) => {
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };
    image.onload = () => finish(image.naturalWidth >= 8);
    image.onerror = () => finish(false);
    signal.addEventListener("abort", () => finish(false), { once: true });
    // A site that never answers must not hold up the ones that did.
    setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
    image.referrerPolicy = "no-referrer";
    image.src = url;
  });
}

/**
 * The favicon of the site being typed, fetched by the visitor's own browser
 * once the address looks complete. Nothing goes through our servers, so this
 * costs no read and needs no limit.
 */
export function useTypedFavicon(website: string) {
  const domain = website.trim().match(DOMAIN)?.[1]?.toLowerCase() ?? null;
  const [icon, setIcon] = useState<{ domain: string; url: string } | null>(null);

  useEffect(() => {
    if (!domain) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      // All candidates at once; the first in the list that loads wins.
      const urls = PATHS.map((path) => `https://${domain}${path}`);
      const loaded = await Promise.all(urls.map((url) => load(url, controller.signal)));
      const url = urls.find((_, index) => loaded[index]);
      if (url && !controller.signal.aborted) {
        setIcon({ domain, url });
      }
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [domain]);

  // An icon only ever shows for the domain it was loaded from.
  return icon && icon.domain === domain ? icon.url : null;
}
