#!/usr/bin/env bun
// Schedule a one-off task for Sancho to do later.
//
//   schedule add --in 20m --chat <chatId> [--user <name>] [--user-id <id>] "<task>"
//   schedule add --at "2026-11-18 09:00" --tz Asia/Jerusalem --chat <chatId> ... "<task>"
//   schedule list
//   schedule cancel <id>
//
// A clock time needs the timezone it is meant in (an IANA name such as Europe/Paris),
// or an explicit offset: --at 2026-11-18T09:00+02:00. Times are stored in UTC.

import { loadJobs, saveJobs, MAX_JOBS, type Job } from "./schedule-store.ts";

const UNITS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const MAX_AHEAD_MS = 366 * UNITS.d;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

/** How far a timezone is ahead of UTC at a given instant, in milliseconds. */
function zoneOffset(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Turns "2026-11-18 09:00" as read on a clock in `tz` into a UTC instant. */
function wallClockToUtc(text: string, tz: string): number {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) fail(`Cannot read the time "${text}". Use "YYYY-MM-DD HH:MM".`);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  // Two passes, so a time just after a daylight-saving change gets the right offset.
  let utc = wall - zoneOffset(wall, tz);
  utc = wall - zoneOffset(utc, tz);
  return utc;
}

function resolveTime(opts: Record<string, string>): number {
  if (opts.in) {
    const m = opts.in.match(/^(\d+(?:\.\d+)?)([smhd])$/);
    if (!m) fail(`Cannot read the delay "${opts.in}". Use a number and a unit: 30s, 10m, 2h, 3d.`);
    return Date.now() + Number(m[1]) * UNITS[m[2]];
  }
  if (!opts.at) fail("Give a time with --in or --at.");
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(opts.at)) {
    const instant = Date.parse(opts.at);
    if (Number.isNaN(instant)) fail(`Cannot read the time "${opts.at}".`);
    return instant;
  }
  if (!opts.tz) fail("A clock time needs --tz with the timezone it is meant in, for example --tz Europe/Paris.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: opts.tz });
  } catch {
    fail(`Unknown timezone "${opts.tz}". Use an IANA name such as Asia/Jerusalem or America/New_York.`);
  }
  return wallClockToUtc(opts.at, opts.tz);
}

function describe(job: Job, tz?: string): string {
  const unix = Math.floor(Date.parse(job.at) / 1000);
  const local = tz ? ` · ${new Date(job.at).toLocaleString("sv-SE", { timeZone: tz }).slice(0, 16)} ${tz}` : "";
  return `${job.id} · <t:${unix}:F> (<t:${unix}:R>) · ${job.at.slice(0, 16).replace("T", " ")} UTC${local}\n    for ${job.user ?? "?"} in chat ${job.chatId}: ${job.task}`;
}

// --- arguments ---------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);
const opts: Record<string, string> = {};
const words: string[] = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--") words.push(...rest.slice(i + 1)), (i = rest.length);
  else if (rest[i].startsWith("--")) opts[rest[i].slice(2)] = rest[++i] ?? "";
  else words.push(rest[i]);
}

if (command === "add") {
  const task = words.join(" ").trim();
  if (!task) fail("Give the task as the last argument, in quotes.");
  if (!/^\d{17,20}$/.test(opts.chat ?? "")) fail("Give the Discord chat to answer in with --chat <chatId>.");

  const when = resolveTime(opts);
  if (when <= Date.now()) fail("That time is in the past.");
  if (when - Date.now() > MAX_AHEAD_MS) fail("That is more than a year away.");

  const jobs = loadJobs();
  if (jobs.length >= MAX_JOBS) fail(`There are already ${MAX_JOBS} scheduled tasks. Cancel some first.`);

  const job: Job = {
    id: crypto.randomUUID().slice(0, 6),
    at: new Date(when).toISOString(),
    chatId: opts.chat,
    user: opts.user,
    userId: opts["user-id"],
    task,
    createdAt: new Date().toISOString(),
  };
  saveJobs([...jobs, job]);
  console.log(`Scheduled:\n${describe(job, opts.tz)}`);
  console.log("When you confirm on Discord, paste the <t:...> tags as they are: Discord shows each reader the time in their own timezone.");
} else if (command === "list") {
  const jobs = loadJobs();
  console.log(jobs.length ? jobs.map((job) => describe(job)).join("\n") : "Nothing is scheduled.");
} else if (command === "cancel") {
  const jobs = loadJobs();
  const job = jobs.find((j) => j.id === words[0]);
  if (!job) fail(`No scheduled task with id "${words[0] ?? ""}".`);
  saveJobs(jobs.filter((j) => j !== job));
  console.log(`Cancelled:\n${describe(job)}`);
} else {
  fail('usage: schedule add (--in 20m | --at "YYYY-MM-DD HH:MM" --tz Area/City) --chat <chatId> [--user <name>] [--user-id <id>] "<task>"\n       schedule list\n       schedule cancel <id>');
}
