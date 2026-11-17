#!/usr/bin/env bun
// Allow every text channel of a Discord server, now and as new ones appear.
//
//   allow-server <serverId>   trust a server and allow all of its channels
//   allow-server --sync       re-check every trusted server (runs automatically)
//   allow-server --list       show trusted servers
//
// The Discord plugin's allowlist is per channel, so a trusted server is kept in a
// separate file and its channels are copied into access.json whenever they change.
// New channels require an @mention, like the rest.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CFG = process.env.CLAUDE_CONFIG_DIR ?? `${process.env.HOME}/.claude`;
const DIR = join(CFG, "channels", "discord");
const ACCESS = join(DIR, "access.json");
const SERVERS = join(DIR, "servers.json");
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
async function syncServer(serverId: string): Promise<number> {
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
const servers = readJson<string[]>(SERVERS, []);

if (arg === "--list") {
  console.log(servers.length ? servers.join("\n") : "No trusted servers.");
} else if (arg === "--sync") {
  for (const id of servers) {
    await syncServer(id).catch((err) => console.error(`[allow-server] ${id}: ${err.message}`));
  }
} else if (arg && /^\d{17,20}$/.test(arg)) {
  const added = await syncServer(arg); // fails here if the bot is not in that server
  if (!servers.includes(arg)) writeJson(SERVERS, [...servers, arg]);
  console.log(`Server ${arg} is trusted. ${added} channel(s) added now; new channels are picked up automatically.`);
} else {
  console.error("usage: allow-server <serverId> | --sync | --list");
  process.exit(2);
}
