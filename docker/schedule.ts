#!/usr/bin/env bun
// Schedule a task for Sancho to do later, once or repeatedly.
//
//   schedule add --in 20m --chat <chatId> [--user <name>] [--user-id <id>] "<task>"
//   schedule add --at "2026-11-18 09:00" --tz Asia/Jerusalem --chat <chatId> ... "<task>"
//   schedule add --every day --at 09:00 --tz Asia/Jerusalem --chat <chatId> --user-id <id> ... "<task>"
//   schedule add --every mon,thu --at 18:30 --tz Europe/Paris --chat <chatId> --user-id <id> ... "<task>"
//   schedule add --every 2h --chat <chatId> --user-id <id> ... "<task>"
//   schedule list
//   schedule cancel <id>
//
// A clock time needs the timezone it is meant in (an IANA name such as Europe/Paris),
// or, for a one-off, an explicit offset: --at 2026-11-18T09:00+02:00. Times are stored
// in UTC. A repeating clock time keeps its timezone, so it follows daylight saving.

import { isId, owners } from "./discord.ts";
import {
  DAY_NAMES, MAX_JOBS, describeRepeat, loadJobs, nextRun, saveJobs, wallToUtc, type Job, type Repeat,
} from "./schedule-store.ts";

const UNITS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const MAX_AHEAD_MS = 366 * UNITS.d;
const MIN_INTERVAL_MS = 15 * UNITS.m;
const MAX_REPEATING_PER_USER = 5; // owners are exempt

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function requireTimezone(tz: string | undefined): string {
  if (!tz) fail("A clock time needs --tz with the timezone it is meant in, for example --tz Europe/Paris.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    fail(`Unknown timezone "${tz}". Use an IANA name such as Asia/Jerusalem or America/New_York.`);
  }
  return tz;
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
  const tz = requireTimezone(opts.tz);
  const m = opts.at.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) fail(`Cannot read the time "${opts.at}". Use "YYYY-MM-DD HH:MM".`);
  return wallToUtc(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)), tz);
}

function resolveRepeat(opts: Record<string, string>): Repeat {
  const every = opts.every.toLowerCase();
  if (opts.in) fail("Use --every with --at for a clock time, or on its own for an interval. Not with --in.");

  const interval = every.match(/^(\d+(?:\.\d+)?)([mhd])$/);
  if (interval) {
    if (opts.at) fail('An interval counts from now, so it takes no --at. For a clock time use --every day --at HH:MM --tz Area/City.');
    const ms = Number(interval[1]) * UNITS[interval[2]];
    if (ms < MIN_INTERVAL_MS) fail("The shortest interval is 15 minutes.");
    return { kind: "interval", ms };
  }

  const days = every === "day" ? [0, 1, 2, 3, 4, 5, 6] : [...new Set(every.split(",").map((d) => DAY_NAMES.indexOf(d.trim().slice(0, 3))))].sort();
  if (!days.length || days.includes(-1)) fail(`Cannot read --every "${opts.every}". Use day, a list of days such as mon,thu, or an interval such as 2h.`);
  const time = opts.at?.match(/^(\d{1,2}):(\d{2})$/);
  if (!time || +time[1] > 23 || +time[2] > 59) fail("A repeating task on days needs --at HH:MM, for example --at 09:00.");
  return { kind: "days", days, time: `${time[1].padStart(2, "0")}:${time[2]}`, tz: requireTimezone(opts.tz) };
}

function describe(job: Job, tz?: string): string {
  const unix = Math.floor(Date.parse(job.at) / 1000);
  const local = tz ? ` · ${new Date(job.at).toLocaleString("sv-SE", { timeZone: tz }).slice(0, 16)} ${tz}` : "";
  const repeat = job.repeat ? ` · repeats ${describeRepeat(job.repeat)}, ran ${job.runs ?? 0} time(s), created ${job.createdAt.slice(0, 10)} · next` : "";
  return `${job.id}${repeat} · <t:${unix}:F> (<t:${unix}:R>) · ${job.at.slice(0, 16).replace("T", " ")} UTC${local}\n    for ${job.user ?? "?"} in chat ${job.chatId}: ${job.task}`;
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
  if (!isId(opts.chat)) fail("Give the Discord chat to answer in with --chat <chatId>.");

  const jobs = loadJobs();
  if (jobs.length >= MAX_JOBS) fail(`There are already ${MAX_JOBS} scheduled tasks. Cancel some first.`);

  const repeat = opts.every ? resolveRepeat(opts) : undefined;
  const userId = opts["user-id"];
  const mine = jobs.filter((j) => j.repeat && j.userId === userId);
  const isOwner = owners().includes(userId);
  if (repeat) {
    if (!isId(userId)) fail("A repeating task needs --user-id with the Discord ID of the person who asked.");
    if (!isOwner && mine.length >= MAX_REPEATING_PER_USER) {
      fail(`${opts.user ?? "This user"} already has ${mine.length} repeating tasks, which is the limit. They must cancel one first:\n${mine.map((j) => describe(j)).join("\n")}`);
    }
  }

  const when = repeat ? nextRun(repeat) : resolveTime(opts);
  if (when <= Date.now()) fail("That time is in the past.");
  if (when - Date.now() > MAX_AHEAD_MS) fail("That is more than a year away.");

  const job: Job = {
    id: crypto.randomUUID().slice(0, 6),
    at: new Date(when).toISOString(),
    chatId: opts.chat,
    user: opts.user,
    userId,
    task,
    createdAt: new Date().toISOString(),
    ...(repeat && { repeat, runs: 0 }),
  };
  saveJobs([...jobs, job]);
  console.log(`Scheduled:\n${describe(job, opts.tz)}`);
  console.log("When you confirm on Discord, paste the <t:...> tags as they are: Discord shows each reader the time in their own timezone.");
  if (repeat) console.log(`Say how it repeats too (${describeRepeat(repeat)}) and that they can ask you to cancel it.`);
  if (repeat && isOwner && mine.length >= MAX_REPEATING_PER_USER) {
    console.log(
      `\nThis owner now has ${mine.length + 1} repeating tasks. Owners have no limit, but look at the earlier ones below: ` +
        `if any seem finished, duplicated or forgotten, name them briefly in your reply and offer to cancel. If they all look current, say nothing.\n` +
        mine.map((j) => describe(j)).join("\n"),
    );
  }
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
  fail(
    'usage: schedule add (--in 20m | --at "YYYY-MM-DD HH:MM" --tz Area/City) --chat <chatId> [--user <name>] [--user-id <id>] "<task>"\n' +
      '       schedule add --every (day | mon,thu) --at HH:MM --tz Area/City --chat <chatId> --user <name> --user-id <id> "<task>"\n' +
      '       schedule add --every 2h --chat <chatId> --user <name> --user-id <id> "<task>"\n' +
      "       schedule list\n       schedule cancel <id>",
  );
}
