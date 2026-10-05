import { initBotId } from "botid/client/core";
import posthog from "posthog-js";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_exceptions: true,
    cross_subdomain_cookie: true,
    debug: process.env.NODE_ENV === "development",
    defaults: "2026-01-30",
    loaded: (client) => client.register({ site_surface: "app" }),
    persistence: "localStorage+cookie",
  });
}

// The website reader is public and spends money per read, so it gets a bot check.
initBotId({
  protect: [{ method: "POST", path: "/api/onboarding/read" }],
});
