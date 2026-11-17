#!/usr/bin/env bun
// Allow every text channel a Discord server has right now.
//
//   allow-server <serverId>
//
// One-off: channels created later are not added. Run it again, or use allow-channel.
// The channels require an @mention, like the rest.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CFG = process.env.CLAUDE_CONFIG_DIR ?? `${process.env.HOME}/.claude`;
const DIR = join(CFG, "channels", "discord");
const ACCESS = join(DIR, "access.json");
const TEXT_CHANNEL_TYPES = new Set([0, 5]); // text, announcement

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n");
  renameSync(`${path}.tmp`, path); // atomic, so the plugin never reads a half-written file
}

function botToken(): string {
  const fromEnv = process.env.DISCORD_BOT_TOKEN;
  if (fromEnv) return fromEnv;
  const envFile = join(DIR, ".env");
  const fromFile = existsSync(envFile) ? readFileSync(envFile, "utf8").match(/^DISCORD_BOT_TOKEN=(.+)$/m)?.[1]?.trim() : undefined;
  if (!fromFile) throw new Error("no Discord bot token available");
  return fromFile;
}

async function discord(path: string): Promise<any> {
  const res = await fetch(`https://discord.com/api/v10${path}`, { headers: { Authorization: `Bot ${botToken()}` } });
  if (!res.ok) throw new Error(`Discord answered ${res.status} for ${path}`);
  return res.json();
}

/** Adds any missing channels of one server to the allowlist. Returns how many were added. */
async function allowServer(serverId: string): Promise<number> {
  const [server, channels] = await Promise.all([discord(`/guilds/${serverId}`), discord(`/guilds/${serverId}/channels`)]);

  // Re-read right before writing; the plugin edits this file too.
  const access = readJson<any>(ACCESS, { dmPolicy: "pairing", allowFrom: [], groups: {} });
  access.groups ??= {};

  let added = 0;
  for (const channel of channels) {
    if (!TEXT_CHANNEL_TYPES.has(channel.type) || access.groups[channel.id]) continue;
    access.groups[channel.id] = { requireMention: true, allowFrom: [] };
    console.log(`[allow-server] allowed #${channel.name} (${channel.id}) in ${server.name}`);
    added++;
  }
  if (added) writeJson(ACCESS, access);
  return added;
}

const arg = process.argv[2];

if (arg && /^\d{17,20}$/.test(arg)) {
  const added = await allowServer(arg); // fails here if the bot is not in that server
  console.log(`${added} channel(s) of server ${arg} added. Channels created later are not added.`);
} else {
  console.error("usage: allow-server <serverId>");
  process.exit(2);
}
