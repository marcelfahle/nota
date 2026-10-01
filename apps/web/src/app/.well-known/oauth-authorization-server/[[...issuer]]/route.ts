import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/lib/better-auth";

// RFC 8414 discovery for ChatGPT, Claude and other MCP clients.
export const GET = oauthProviderAuthServerMetadata(auth);
