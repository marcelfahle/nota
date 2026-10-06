import { createUI } from "./shared.js";
export function printConfig(config: {
  apiKey?: string | null;
  path: string;
  url?: string;
  auth?: string;
}) {
  const u = createUI();
  u.heading("Configuration");
  u.field("Server", config.url || "https://app.withnota.com");
  u.field("Authentication", config.auth || "Not signed in");
  u.field("API key", config.apiKey || "Not set");
  u.field("File", config.path);
}
