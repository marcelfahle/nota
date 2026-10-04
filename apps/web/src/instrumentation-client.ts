import { initBotId } from "botid/client/core";

// The website reader is public and spends money per read, so it gets a bot check.
initBotId({
  protect: [{ method: "POST", path: "/api/onboarding/read" }],
});
