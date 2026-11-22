// Every environment variable the scripts read, in one place.
//
// The host sets the first group in .env.local. The second group exists for tests and
// local runs; in the container the defaults apply.

const e = process.env;

export const env = {
  // Set by the host
  botToken: e.DISCORD_BOT_TOKEN || undefined,
  apiKey: e.ANTHROPIC_API_KEY || undefined,
  ownerIds: (e.DISCORD_OWNER_ID ?? "").split(",").map((id) => id.trim()).filter(Boolean),
  firstChannelId: e.DISCORD_CHANNEL_ID || undefined,
  githubToken: e.GH_TOKEN || undefined,

  // Paths and switches, with the container's defaults
  configDir: e.CLAUDE_CONFIG_DIR ?? `${e.HOME}/.claude`,
  ownersFile: e.SANCHO_OWNERS_FILE ?? "/etc/sancho/owners",
  scheduleFile: e.SANCHO_SCHEDULE ?? "/data/schedule.json",
  socket: e.SANCHO_SOCKET ?? "/tmp/sancho.sock",
  resume: e.SANCHO_RESUME !== "0",
  watchdogDir: e.WATCHDOG_DIR,
  watchdogDryRun: e.WATCHDOG_DRY_RUN === "1",
  watchdogCooldownMin: Number(e.WATCHDOG_COOLDOWN_MIN ?? 10),
};
