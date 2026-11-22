// Shared helpers for the commands that read Discord or edit the plugin's allowlist.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CFG = process.env.CLAUDE_CONFIG_DIR ?? `${process.env.HOME}/.claude`;
export const DISCORD_DIR = join(CFG, "channels", "discord");
export const ACCESS_FILE = join(DISCORD_DIR, "access.json");
export const TEXT_CHANNEL_TYPES = new Set([0, 5]); // text, announcement

export const isId = (value: string | undefined): value is string => /^\d{17,20}$/.test(value ?? "");

export function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

/** Writes through a temp file and a rename, so no reader ever sees a half-written file. */
export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n");
  renameSync(`${path}.tmp`, path);
}

export type Access = {
  dmPolicy: string;
  allowFrom: string[];
  groups: Record<string, { requireMention: boolean; allowFrom: string[] }>;
  [key: string]: unknown;
};

/** The plugin's allowlist. Read it right before changing it; the plugin edits it too. */
export function loadAccess(): Access {
  const access = readJson<Partial<Access>>(ACCESS_FILE, {});
  return { ...access, dmPolicy: access.dmPolicy ?? "pairing", allowFrom: access.allowFrom ?? [], groups: access.groups ?? {} };
}

export const saveAccess = (access: Access) => writeJson(ACCESS_FILE, access);

export function botToken(): string | undefined {
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;
  const envFile = join(DISCORD_DIR, ".env");
  if (!existsSync(envFile)) return undefined;
  return readFileSync(envFile, "utf8").match(/^DISCORD_BOT_TOKEN=(.+)$/m)?.[1]?.trim();
}

/** GET from Discord's API as the bot. Returns null when Discord refuses or there is no token. */
export async function discordGet(path: string): Promise<any | null> {
  const token = botToken();
  if (!token) return null;
  const res = await fetch(`https://discord.com/api/v10${path}`, { headers: { Authorization: `Bot ${token}` } });
  return res.ok ? res.json() : null;
}
