import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/lib/better-auth";

export const GET = oauthProviderOpenIdConfigMetadata(auth);
