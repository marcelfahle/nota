import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

import { createNotaClient } from "@nota-app/sdk";
import lockfile from "proper-lockfile";
import { normalizeIssuer, refreshSession, type OAuthSession } from "./oauth.js";

export type NotaCliConfig = {
  apiKey?: string;
  url?: string;
  oauth?: OAuthSession;
};

const CONFIG_DIR = process.env.NOTA_CONFIG_DIR || path.join(homedir(), ".nota");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function normalizeConfig(config: unknown): NotaCliConfig {
  if (!config || typeof config !== "object") {
    return {};
  }

  const input = config as Record<string, unknown>;
  const oauth = input.oauth as OAuthSession | undefined;
  return {
    apiKey:
      typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : undefined,
    url: typeof input.url === "string" && input.url.trim() ? input.url.trim() : undefined,
    oauth:
      oauth &&
      typeof oauth.issuer === "string" &&
      typeof oauth.clientId === "string" &&
      typeof oauth.accessToken === "string" &&
      typeof oauth.refreshToken === "string" &&
      typeof oauth.expiresAt === "number" &&
      Number.isFinite(oauth.expiresAt)
        ? oauth
        : undefined,
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

async function writeConfig(config: NotaCliConfig) {
  const temporaryPath = `${CONFIG_PATH}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporaryPath, CONFIG_PATH);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function withConfigLock<T>(operation: () => Promise<T>): Promise<T> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  if ((await lstat(CONFIG_DIR)).isSymbolicLink())
    throw new Error("Nota config directory must not be a symbolic link.");
  await chmod(CONFIG_DIR, 0o700);
  const release = await lockfile.lock(CONFIG_PATH, {
    realpath: false,
    retries: { retries: 60, minTimeout: 250, maxTimeout: 500 },
  });
  try {
    return await operation();
  } finally {
    await release();
  }
}

export async function updateConfig(patch: Partial<NotaCliConfig>) {
  return withConfigLock(async () => {
    const current = await readConfig();
    const next = { ...current, ...patch };
    // Credentials are bound to a server. Changing servers must never forward them.
    if (patch.url && current.url && normalizeIssuer(patch.url) !== normalizeIssuer(current.url)) {
      next.oauth = patch.oauth;
      next.apiKey = patch.apiKey;
    }
    if (patch.apiKey) next.oauth = undefined;
    if (patch.oauth) next.apiKey = undefined;
    await writeConfig(next);
    return next;
  });
}

export async function getResolvedConfig(env: NodeJS.ProcessEnv = process.env) {
  const fileConfig = await readConfig();

  return {
    apiKey: env.NOTA_API_KEY?.trim() || fileConfig.apiKey,
    path: CONFIG_PATH,
    url: env.NOTA_URL?.trim() || fileConfig.url,
    auth:
      env.NOTA_API_KEY?.trim() || fileConfig.apiKey
        ? "API key"
        : fileConfig.oauth
          ? "Browser session"
          : "Not signed in",
  };
}

export async function clearLogin() {
  return withConfigLock(async () => {
    const current = await readConfig();
    await writeConfig({ url: current.url });
    return current;
  });
}

export async function createConfiguredClient(env: NodeJS.ProcessEnv = process.env) {
  const { url, token } = await withConfigLock(async () => {
    const config = await readConfig();
    const url = normalizeIssuer(env.NOTA_URL?.trim() || config.url || "https://app.withnota.com");
    if (env.NOTA_API_KEY?.trim()) return { url, token: env.NOTA_API_KEY.trim() };
    if (config.url && normalizeIssuer(config.url) !== url)
      throw new Error(
        "NOTA_URL differs from your saved login. Run 'nota login --url <url>' or provide NOTA_API_KEY.",
      );
    if (config.apiKey) return { url, token: config.apiKey };
    let session = config.oauth;
    if (!session || session.issuer !== url)
      throw new Error("You are not signed in to this Nota server. Run 'nota login'.");
    if (session.expiresAt <= Date.now() + 60_000) {
      session = await refreshSession(session);
      await writeConfig({ ...config, oauth: session });
    }
    return { url, token: session.accessToken };
  });
  return createNotaClient(url, token, (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("user-agent", "nota-cli");
    return fetch(input, {
      ...init,
      headers,
      redirect: "error",
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });
  });
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
