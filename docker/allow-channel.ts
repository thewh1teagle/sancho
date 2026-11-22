#!/usr/bin/env bun
// Add a Discord channel to Sancho's allowlist, from the host. No restart needed.
//
//   docker compose exec -u sancho sancho allow-channel <channelId> [--no-mention]

import { isId, loadAccess, saveAccess } from "./discord.ts";

const [id, flag] = process.argv.slice(2);
if (!isId(id)) {
  console.error("usage: allow-channel <channelId> [--no-mention]");
  process.exit(2);
}

const requireMention = flag !== "--no-mention";
const access = loadAccess();
access.groups[id] = { requireMention, allowFrom: access.groups[id]?.allowFrom ?? [] };
saveAccess(access);

console.log(`Allowed channel ${id} (mention required: ${requireMention}). Channels now allowed:`);
console.log(Object.keys(access.groups).join("\n"));
