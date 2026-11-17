// Supervisor: runs Claude Code headless (Agent SDK mode) as one long-lived session.
//
// Discord messages reach the session through the channel plugin. This process keeps the
// session's stdin open so it stays alive, prints one log line per event, and lets the
// owner send a message from the host:
//
//   docker compose exec -u sancho sancho say "your message"
//
// If Claude exits, so does this process, and Docker's restart policy starts a new one.

import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadJobs, saveJobs, takeDueJobs, type Job } from "./schedule-store.ts";

const CFG = process.env.CLAUDE_CONFIG_DIR ?? `${process.env.HOME}/.claude`;
const SOCKET = process.env.SANCHO_SOCKET ?? "/tmp/sancho.sock";
const SESSION_FILE = join(CFG, "sancho-session-id");
const RESUME = process.env.SANCHO_RESUME !== "0";

const log = (line: string) => console.log(`[sancho] ${line}`);
const clip = (text: string, max = 100) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

// --- start Claude -----------------------------------------------------------

const previous = RESUME && existsSync(SESSION_FILE) ? readFileSync(SESSION_FILE, "utf8").trim() : "";
const args = [
  "-p",
  "--input-format", "stream-json",
  "--output-format", "stream-json",
  "--verbose",
  "--replay-user-messages",
  "--channels", "plugin:discord@claude-plugins-official",
  "--dangerously-skip-permissions",
  ...(previous ? ["--resume", previous] : []),
];

const startedAt = Date.now();
const claude = Bun.spawn(["claude", ...args], { cwd: "/data", stdin: "pipe", stdout: "pipe", stderr: "inherit" });
log(previous ? `starting, resuming conversation ${previous.slice(0, 8)}` : "starting a new conversation");

function send(text: string, uuid: string) {
  const message = { type: "user", uuid, message: { role: "user", content: text }, parent_tool_use_id: null, session_id: "" };
  claude.stdin.write(JSON.stringify(message) + "\n");
  claude.stdin.flush();
}

// A headless session only starts up, and only begins listening to Discord, once it gets
// its first input. Wake it now so a message arriving after a restart is not lost.
send("Supervisor: the session has just started. Nothing to do. Reply with the single word OK and use no tools.", crypto.randomUUID());

// --- owner messages over a local socket -------------------------------------

type Client = { write(data: string): number; end(): void };
const waiting = new Map<string, Client>(); // message uuid -> client, until Claude picks it up
let answering: Client | null = null; // client whose turn is running now

if (existsSync(SOCKET)) rmSync(SOCKET);
Bun.listen({
  unix: SOCKET,
  socket: {
    data(client, data) {
      const text = data.toString().trim();
      if (!text) return client.end();
      const uuid = crypto.randomUUID();
      waiting.set(uuid, client);
      log(`← owner: ${clip(text)}`);
      send(text, uuid);
    },
    close(client) {
      for (const [uuid, waiter] of waiting) if (waiter === client) waiting.delete(uuid);
      if (answering === client) answering = null;
    },
  },
});

// --- scheduled tasks ---------------------------------------------------------

const RETRY_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const started = new Map<string, Job>(); // message uuid -> job, until Claude picks it up
let runningJob: Job | null = null;

function runDueJobs() {
  for (const job of takeDueJobs()) {
    const lateMinutes = Math.round((Date.now() - Date.parse(job.at)) / 60_000);
    const who = job.userId ? `<@${job.userId}>` : (job.user ?? "the person who asked");
    const uuid = crypto.randomUUID();
    started.set(uuid, job);
    log(`⏰ scheduled ${job.id} for ${job.user ?? "?"}: ${clip(job.task)}`);
    send(
      `Scheduled task ${job.id}, due now. ${job.user ?? "Someone"} asked for it on ${job.createdAt} in Discord chat ${job.chatId}.` +
        (lateMinutes >= 5 ? ` It is ${lateMinutes} minutes late because you were unavailable; say so.` : "") +
        ` Do it now with whatever tools it needs, then post the result with the reply tool to chat_id ${job.chatId}, mentioning ${who}.` +
        `\n\nThe task: ${job.task}`,
      uuid,
    );
  }
}
setInterval(runDueJobs, 5_000);

/** A task that failed because the API refused it goes back in the queue for later. */
function retryJob(job: Job) {
  const attempts = (job.attempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) return log(`⏰ scheduled ${job.id} failed ${attempts} times, giving up`);
  saveJobs([...loadJobs(), { ...job, attempts, at: new Date(Date.now() + RETRY_MS).toISOString() }]);
  log(`⏰ scheduled ${job.id} failed, retrying in ${RETRY_MS / 60_000} minutes`);
}

// --- events from Claude -----------------------------------------------------

let sessionId = "";

function handle(event: any) {
  switch (event.type) {
    case "system":
      if (event.subtype === "init") {
        if (event.session_id === sessionId) return; // repeated at the start of every turn
        sessionId = event.session_id;
        writeFileSync(SESSION_FILE, event.session_id);
        const servers = (event.mcp_servers ?? []).map((s: any) => `${s.name}: ${s.status}`).join(", ");
        log(`session ${String(event.session_id).slice(0, 8)} · ${event.model} · ${servers || "no MCP servers"}`);
      } else if (event.subtype === "api_retry") {
        log(`API retry ${event.attempt}/${event.max_retries}: ${event.error}`);
      }
      return;

    case "user": {
      // Our own messages come back when Claude starts on them; channel events arrive the same way.
      const text = typeof event.message?.content === "string" ? event.message.content : "";
      if (event.isReplay && waiting.has(event.uuid)) {
        answering = waiting.get(event.uuid)!;
        waiting.delete(event.uuid);
      } else if (event.isReplay && started.has(event.uuid)) {
        runningJob = started.get(event.uuid)!;
        started.delete(event.uuid);
      } else if (text.startsWith("<channel ")) {
        const user = text.match(/\buser="([^"]*)"/)?.[1] ?? "?";
        log(`← discord · ${user}: ${clip(text.replace(/^<channel [^>]*>/, "").replace(/<\/channel>\s*$/, ""))}`);
      }
      return;
    }

    case "assistant":
      if (event.parent_tool_use_id) return; // subagent chatter
      for (const block of event.message?.content ?? []) {
        if (block.type === "tool_use") log(`  tool: ${block.name}`);
      }
      return;

    case "result": {
      const seconds = ((event.duration_ms ?? 0) / 1000).toFixed(1);
      const cost = typeof event.total_cost_usd === "number" ? ` · $${event.total_cost_usd.toFixed(2)} so far` : "";
      const text = String(event.result ?? "");
      log(`${event.is_error ? "✗" : "✓"} turn ${seconds}s${cost}${event.is_error ? ` · ${clip(text)}` : ""}`);
      if (runningJob) {
        if (event.is_error) retryJob(runningJob);
        runningJob = null;
      }
      if (answering) {
        answering.write(text + "\n");
        answering.end();
        answering = null;
      }
      return;
    }
  }
}

const decoder = new TextDecoder();
let buffer = "";
for await (const chunk of claude.stdout) {
  buffer += decoder.decode(chunk, { stream: true });
  let newline: number;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch {
      log(`unreadable output: ${clip(line)}`);
    }
  }
}

// --- Claude exited ----------------------------------------------------------

const code = await claude.exited;
// A conversation that cannot be resumed must not trap the container in a restart loop.
if (previous && Date.now() - startedAt < 30_000) {
  log("the saved conversation would not resume; the next start will be fresh");
  rmSync(SESSION_FILE, { force: true });
}
log(`Claude exited with code ${code}`);
process.exit(code || 1);
