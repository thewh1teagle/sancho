#!/usr/bin/env bun
// Allow every text channel a Discord server has right now, from the host.
//
//   docker compose exec -u sancho sancho allow-server <serverId>
//
// One-off: channels created later are not added. Run it again, or use allow-channel.
// The channels require an @mention, like the rest.

import { discordGet, isId, loadAccess, saveAccess, TEXT_CHANNEL_TYPES } from "./discord.ts";

const serverId = process.argv[2];
if (!isId(serverId)) {
  console.error("usage: allow-server <serverId>");
  process.exit(2);
}

const [server, channels] = await Promise.all([discordGet(`/guilds/${serverId}`), discordGet(`/guilds/${serverId}/channels`)]);
if (!server || !channels) {
  console.error(`Cannot read server ${serverId}. Is the bot a member of it?`);
  process.exit(1);
}

const access = loadAccess();
let added = 0;
for (const channel of channels) {
  if (!TEXT_CHANNEL_TYPES.has(channel.type) || access.groups[channel.id]) continue;
  access.groups[channel.id] = { requireMention: true, allowFrom: [] };
  console.log(`[allow-server] allowed #${channel.name} (${channel.id}) in ${server.name}`);
  added++;
}
if (added) saveAccess(access);
console.log(`${added} channel(s) of ${server.name} added. Channels created later are not added.`);
