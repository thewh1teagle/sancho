#!/usr/bin/env bun
// Change who can reach Sancho, on behalf of an owner who asked on Discord.
//
//   access allow-channel  <channelId> --message <chatId>/<messageId> [--no-mention]
//   access remove-channel <channelId> --message <chatId>/<messageId>
//   access allow-user     <userId>    --message <chatId>/<messageId>
//   access remove-user    <userId>    --message <chatId>/<messageId>
//   access list
//
// Sancho runs this himself, but it does not take his word for who asked. --message
// names the Discord message that made the request; the command fetches that message
// from Discord and goes ahead only if an owner wrote it, in the last few minutes, and
// it names the channel or user being changed. Owners are set by the host in
// DISCORD_OWNER_ID and written to a root-owned file the agent cannot edit.

import { existsSync, readFileSync } from "node:fs";
import { discordGet as discord, isId, loadAccess, saveAccess } from "./discord.ts";

const OWNERS = process.env.SANCHO_OWNERS_FILE ?? "/etc/sancho/owners";
const MAX_AGE_MS = 10 * 60_000;

function refuse(message: string): never {
  console.error(`Refused: ${message}`);
  process.exit(1);
}

function owners(): string[] {
  if (!existsSync(OWNERS)) return [];
  return readFileSync(OWNERS, "utf8").split(/\s+/).filter(isId);
}

/** Proves that an owner asked for a change to `targetId`, or exits. Returns the owner's name. */
async function requireOwnerRequest(proof: string | undefined, targetId: string, targetName?: string): Promise<string> {
  const allowed = owners();
  if (!allowed.length) refuse("no owners are configured. The host sets DISCORD_OWNER_ID in .env.local.");

  const m = proof?.match(/^(\d{17,20})\/(\d{17,20})$/);
  if (!m) refuse("pass the request with --message <chatId>/<messageId>.");
  const message = await discord(`/channels/${m[1]}/messages/${m[2]}`);
  if (!message) refuse("that message could not be read from Discord.");

  if (!allowed.includes(message.author?.id)) refuse(`${message.author?.username ?? "the sender"} is not an owner. Only an owner can change access.`);
  if (Date.now() - Date.parse(message.timestamp) > MAX_AGE_MS) refuse("that request is more than ten minutes old. Ask the owner to send it again.");
  // The owner must have named the target: as a mention (which carries the ID) or by its plain name.
  const content = String(message.content).toLowerCase();
  const named = content.includes(targetId) || (!!targetName && content.includes(targetName.toLowerCase()));
  if (!named) refuse(`the owner's message does not name ${targetName ?? targetId}. They must name the channel or user themselves.`);
  return message.author.username;
}

// --- arguments ---------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--") && a !== "--message"));
const proof = rest[rest.indexOf("--message") + 1];
const target = rest.find((a) => /^\d{17,20}$/.test(a)) ?? "";
const needsTarget = () => target || refuse(`give the ${command!.endsWith("channel") ? "channel" : "user"} ID.`);

switch (command) {
  case "list": {
    const access = loadAccess();
    const names = await Promise.all(
      Object.keys(access.groups).map(async (id) => {
        const channel = await discord(`/channels/${id}`);
        return `  ${id} ${channel ? `#${channel.name}` : "(not visible)"}${access.groups[id].requireMention === false ? " · answers every message" : ""}`;
      }),
    );
    console.log(`Channels (${names.length}):\n${names.join("\n")}`);
    console.log(`DM policy: ${access.dmPolicy}. DM allowlist: ${access.allowFrom.join(", ") || "nobody"}`);
    console.log(`Owners: ${owners().join(", ") || "none configured"}`);
    break;
  }

  case "allow-channel": {
    needsTarget();
    const channel = await discord(`/channels/${target}`);
    if (!channel) refuse("I cannot see that channel. The bot needs access to it in Discord first.");
    const owner = await requireOwnerRequest(proof, target, channel.name);
    const access = loadAccess();
    access.groups[target] = { requireMention: !flags.has("--no-mention"), allowFrom: access.groups[target]?.allowFrom ?? [] };
    saveAccess(access);
    console.log(`Allowed #${channel.name} (${target}), as asked by ${owner}. Mention required: ${!flags.has("--no-mention")}.`);
    break;
  }

  case "remove-channel": {
    needsTarget();
    const owner = await requireOwnerRequest(proof, target, (await discord(`/channels/${target}`))?.name);
    const access = loadAccess();
    if (!access.groups[target]) refuse("that channel is not on the allowlist.");
    delete access.groups[target];
    saveAccess(access);
    console.log(`Removed channel ${target}, as asked by ${owner}.`);
    break;
  }

  case "allow-user":
  case "remove-user": {
    needsTarget();
    const owner = await requireOwnerRequest(proof, target, (await discord(`/users/${target}`))?.username);
    const access = loadAccess();
    const without = access.allowFrom.filter((id: string) => id !== target);
    access.allowFrom = command === "allow-user" ? [...without, target] : without;
    saveAccess(access);
    console.log(`${command === "allow-user" ? "Allowed" : "Removed"} user ${target} for DMs, as asked by ${owner}.`);
    break;
  }

  default:
    console.error("usage: access allow-channel|remove-channel <channelId> --message <chatId>/<messageId> [--no-mention]\n       access allow-user|remove-user <userId> --message <chatId>/<messageId>\n       access list");
    process.exit(2);
}
