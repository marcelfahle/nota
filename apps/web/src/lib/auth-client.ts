import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

// The OAuth client plugin forwards a pending ChatGPT/Claude authorization
// through sign-in, so it resumes once the user is logged in.
export const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
});
