import { expect, test } from "bun:test";

import { NextRequest } from "next/server";

import nextConfig from "../../next.config";
import { proxy } from "../proxy";

test("Next preserves loopback OAuth callbacks and signed query values without opening protected pages", () => {
  const previous = process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE;
  // Next's build maps this supported config flag to the runtime setting.
  expect(nextConfig.skipProxyUrlNormalize).toBe(true);
  process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = "1";
  try {
    const callback = "http://127.0.0.1:49152/callback";
    const url = new URL("https://app.withnota.com/api/auth/oauth2/authorize");
    url.search = new URLSearchParams({
      redirect_uri: callback,
      state: "opaque-127.0.0.1-value",
    }).toString();
    const request = new NextRequest(url);
    expect(request.url).toBe(url.href);
    expect(new URL(request.url).searchParams.get("redirect_uri")).toBe(callback);
    expect(new URL(request.url).searchParams.get("state")).toBe("opaque-127.0.0.1-value");
    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
    expect(
      proxy(new NextRequest("https://app.withnota.com/settings")).headers.get("location"),
    ).toBe("https://app.withnota.com/login");
    expect(
      proxy(new NextRequest("https://app.withnota.com/email/nota-mark.png")).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
  } finally {
    if (previous === undefined) {
      delete process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE;
    } else {
      process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = previous;
    }
  }
});
