// Runs at every start, as the sancho user, before Claude: prepares config so the
// session comes up with no interactive prompts.

import { $ } from "bun";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ACCESS_FILE, CFG, readJson, writeJson } from "./discord.ts";

const PLUGIN = "discord@claude-plugins-official";
const env = process.env;

// Answer Claude Code's onboarding, theme, trust and API-key prompts in advance.
const stateFile = join(CFG, ".claude.json");
const state = readJson<any>(stateFile, {});
state.hasCompletedOnboarding = true;
state.theme ??= "dark";
state.projects ??= {};
state.projects["/data"] = { ...state.projects["/data"], hasTrustDialogAccepted: true };
if (env.ANTHROPIC_API_KEY) state.customApiKeyResponses = { approved: [env.ANTHROPIC_API_KEY.slice(-20)], rejected: [] };
writeJson(stateFile, state);
chmodSync(stateFile, 0o600);

const settingsFile = join(CFG, "settings.json");
if (!existsSync(settingsFile)) writeJson(settingsFile, { skipDangerousModePermissionPrompt: true });

// First boot only: allow the owners (and optionally one channel), so no pairing is needed.
if (!existsSync(ACCESS_FILE) && env.DISCORD_OWNER_ID) {
  writeJson(ACCESS_FILE, {
    dmPolicy: "allowlist",
    allowFrom: env.DISCORD_OWNER_ID.split(",").map((id) => id.trim()).filter(Boolean),
    groups: env.DISCORD_CHANNEL_ID ? { [env.DISCORD_CHANNEL_ID]: { requireMention: true, allowFrom: [] } } : {},
  });
}

// The Discord channel plugin, and its dependencies. Installing those on first connect
// is slow enough to make the connection time out, so do it now.
const plugins = await $`claude plugin list`.nothrow().quiet();
if (!plugins.stdout.toString().includes(PLUGIN)) {
  await $`claude plugin marketplace add anthropics/claude-plugins-official`.nothrow();
  await $`claude plugin install ${PLUGIN} --scope user`;
}
const pluginCache = join(CFG, "plugins", "cache", "claude-plugins-official", "discord");
for (const version of existsSync(pluginCache) ? readdirSync(pluginCache) : []) {
  await $`bun install --no-summary`.cwd(join(pluginCache, version)).nothrow();
}

// Claude Code remembers a failed plugin connection for 15 minutes and skips the plugin
// meanwhile. A failure from before this boot must not keep Discord offline.
rmSync(join(CFG, "mcp-needs-auth-cache.json"), { force: true });

// GitHub: with a token, commit as that account and let git push over HTTPS with it.
if (env.GH_TOKEN) {
  const user = await $`gh api user`.nothrow().quiet();
  if (user.exitCode === 0) {
    const { id, login } = user.json();
    await $`git config --global user.email ${`${id}+${login}@users.noreply.github.com`}`;
    await $`git config --global user.name ${login}`;
    await $`gh auth setup-git`;
  } else {
    console.error("[setup] GH_TOKEN is set but GitHub rejected it");
  }
}

// The persona: older installs kept it as CLAUDE.md; new ones start from the example.
if (existsSync("/data/CLAUDE.md") && !existsSync("/data/persona.md")) renameSync("/data/CLAUDE.md", "/data/persona.md");
if (!existsSync("/data/persona.md")) copyFileSync("/etc/claude-code/persona.example.md", "/data/persona.md");

for (const dir of ["articles", "memory", "projects"]) mkdirSync(join("/data", dir), { recursive: true });
