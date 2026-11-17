// Watchdog: tells a Discord channel when Claude could not answer.
//
// Every reply Sancho sends is the model calling a tool. If the API rejects the request
// (no credits, rate limit, outage, bad key) the model never runs, so nothing is said.
// This script follows the session transcripts and, when a Discord message is followed
// by an API error, replies to that message through Discord's REST API. No model involved.
//
// Run: bun watchdog.ts        Env: WATCHDOG_DIR, WATCHDOG_DRY_RUN=1, WATCHDOG_COOLDOWN_MIN

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CFG = process.env.CLAUDE_CONFIG_DIR ?? `${process.env.HOME}/.claude`;
const DIR = process.env.WATCHDOG_DIR ?? join(CFG, "projects", "-data");
const DRY_RUN = process.env.WATCHDOG_DRY_RUN === "1";
const COOLDOWN_MS = Number(process.env.WATCHDOG_COOLDOWN_MIN ?? 10) * 60_000;
const POLL_MS = 3_000;

const NOTICES: Record<string, string> = {
  billing_error: "I can't answer right now: my API credits have run out. My owner needs to top them up.",
  rate_limit_error: "I can't answer right now: I've hit a rate limit. Try again in a few minutes.",
  overloaded_error: "I can't answer right now: Claude's API is overloaded. Try again in a few minutes.",
  api_error: "I can't answer right now: Claude's API is having trouble. Try again in a few minutes.",
  authentication_error: "I can't answer right now: my API key was rejected. My owner needs to fix it.",
  permission_error: "I can't answer right now: my API key isn't allowed to do this. My owner needs to fix it.",
};
const DEFAULT_NOTICE = "I can't answer right now: I hit an API error. Try again in a few minutes.";

type Source = { chatId: string; messageId: string };
type FileState = { offset: number; source: Source | null };

const files = new Map<string, FileState>();
const lastNotice = new Map<string, number>(); // chatId -> time of last notice
const notified = new Set<string>(); // message ids already answered

function botToken(): string | undefined {
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;
  const envFile = join(CFG, "channels", "discord", ".env");
  if (!existsSync(envFile)) return undefined;
  return readFileSync(envFile, "utf8").match(/^DISCORD_BOT_TOKEN=(.+)$/m)?.[1]?.trim();
}

function channelSource(entry: any): Source | null {
  const text = typeof entry.message?.content === "string" ? entry.message.content : "";
  const chatId = text.match(/<channel [^>]*\bchat_id="(\d+)"/)?.[1];
  const messageId = text.match(/<channel [^>]*\bmessage_id="(\d+)"/)?.[1];
  return chatId && messageId ? { chatId, messageId } : null;
}

async function notify(source: Source, kind: string) {
  if (notified.has(source.messageId)) return;
  notified.add(source.messageId);

  const now = Date.now();
  if (now - (lastNotice.get(source.chatId) ?? 0) < COOLDOWN_MS) {
    console.log(`[watchdog] ${kind} in ${source.chatId}: within cooldown, staying quiet`);
    return;
  }
  lastNotice.set(source.chatId, now);

  const content = NOTICES[kind] ?? DEFAULT_NOTICE;
  console.log(`[watchdog] ${kind} in ${source.chatId}: "${content}"${DRY_RUN ? " (dry run)" : ""}`);
  if (DRY_RUN) return;

  const token = botToken();
  if (!token) return console.error("[watchdog] no bot token, cannot post");
  const res = await fetch(`https://discord.com/api/v10/channels/${source.chatId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      message_reference: { message_id: source.messageId, fail_if_not_exists: false },
      allowed_mentions: { parse: [] },
    }),
  });
  if (!res.ok) console.error(`[watchdog] Discord answered ${res.status}`);
}

async function handle(state: FileState, entry: any) {
  if (entry.isSidechain) return; // subagent traffic; the main session reports its own failures

  if (entry.type === "user") {
    if (entry.origin?.kind === "channel") state.source = channelSource(entry);
    // A prompt typed at the terminal ends the Discord turn; tool results do not.
    else if (typeof entry.message?.content === "string") state.source = null;
    return;
  }

  if (entry.type === "assistant" && entry.isApiErrorMessage && state.source) {
    await notify(state.source, String(entry.error ?? entry.apiErrorType ?? "unknown"));
  }
}

async function poll(firstPass: boolean) {
  if (!existsSync(DIR)) return;
  for (const name of readdirSync(DIR)) {
    if (!name.endsWith(".jsonl")) continue;
    const path = join(DIR, name);
    const size = statSync(path).size;

    let state = files.get(path);
    if (!state) {
      // Transcripts that predate the watchdog are skipped; new ones are read from the top.
      state = { offset: firstPass ? size : 0, source: null };
      files.set(path, state);
    }
    if (size <= state.offset) continue;

    const chunk = await Bun.file(path).slice(state.offset, size).text();
    const complete = chunk.slice(0, chunk.lastIndexOf("\n") + 1);
    state.offset += Buffer.byteLength(complete);

    for (const line of complete.split("\n")) {
      if (!line.trim()) continue;
      try {
        await handle(state, JSON.parse(line));
      } catch (err) {
        console.error("[watchdog] skipped a line:", (err as Error).message);
      }
    }
  }
}

console.log(`[watchdog] watching ${DIR}${DRY_RUN ? " (dry run)" : ""}`);
await poll(true);
setInterval(() => poll(false).catch((err) => console.error("[watchdog]", err)), POLL_MS);
