import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { createNotaClient } from "@nota-app/sdk";

export type NotaCliConfig = {
  apiKey?: string;
  url?: string;
};

const CONFIG_DIR = path.join(homedir(), ".nota");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function normalizeConfig(config: unknown): NotaCliConfig {
  if (!config || typeof config !== "object") {
    return {};
  }

  const input = config as Record<string, unknown>;
  return {
    apiKey: typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : undefined,
    url: typeof input.url === "string" && input.url.trim() ? input.url.trim() : undefined,
  };
}

export async function readConfig(): Promise<NotaCliConfig> {
  try {
    const contents = await readFile(CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(contents));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeConfig(config: NotaCliConfig) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function updateConfig(patch: Partial<NotaCliConfig>) {
  const current = await readConfig();
  const next = {
    ...current,
    ...patch,
  };
  await writeConfig(next);
  return next;
}

export async function getResolvedConfig(env: NodeJS.ProcessEnv = process.env) {
  const fileConfig = await readConfig();

  return {
    apiKey: env.NOTA_API_KEY?.trim() || fileConfig.apiKey,
    path: CONFIG_PATH,
    url: env.NOTA_URL?.trim() || fileConfig.url,
  };
}

export async function createConfiguredClient(env: NodeJS.ProcessEnv = process.env) {
  const config = await getResolvedConfig(env);
  if (!config.url) {
    throw new Error(`Nota URL is missing. Run 'nota config set-url <url>' or set NOTA_URL. Config: ${config.path}`);
  }

  if (!config.apiKey) {
    throw new Error(`Nota API key is missing. Run 'nota config set-key <key>' or set NOTA_API_KEY. Config: ${config.path}`);
  }

  return createNotaClient(config.url, config.apiKey);
}

export function getConfigPath() {
  return CONFIG_PATH;
}

export function maskApiKey(value?: string) {
  if (!value) {
    return null;
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}…${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
