// Scheduled jobs, shared by the `schedule` command and the supervisor.
// Stored in the data folder so they survive restarts and the owner can read them.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { env } from "./env.ts";

export const SCHEDULE_FILE = env.scheduleFile;
export const MAX_JOBS = 50;
export const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** How a job repeats: every so many milliseconds, or on given weekdays at a clock time in a timezone. */
export type Repeat =
  | { kind: "interval"; ms: number }
  | { kind: "days"; days: number[]; time: string; tz: string }; // days: 0 = Sunday; time: "HH:MM"

export type Job = {
  id: string;
  at: string; // when to run next, UTC ISO-8601
  chatId: string; // Discord chat to answer in
  user?: string; // who asked
  userId?: string;
  task: string;
  createdAt: string;
  attempts?: number;
  repeat?: Repeat; // absent for a one-off job
  runs?: number; // times a repeating job has come due
};

export function loadJobs(): Job[] {
  if (!existsSync(SCHEDULE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
  } catch {
    return [];
  }
}

export function saveJobs(jobs: Job[]) {
  const sorted = [...jobs].sort((a, b) => a.at.localeCompare(b.at));
  writeFileSync(`${SCHEDULE_FILE}.tmp`, JSON.stringify(sorted, null, 2) + "\n");
  renameSync(`${SCHEDULE_FILE}.tmp`, SCHEDULE_FILE);
}

/** How far a timezone is ahead of UTC at a given instant, in milliseconds. */
export function zoneOffset(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Turns a wall-clock time in `tz`, given as if it were UTC, into the real UTC instant. */
export function wallToUtc(wall: number, tz: string): number {
  // Two passes, so a time just after a daylight-saving change gets the right offset.
  const utc = wall - zoneOffset(wall, tz);
  return wall - zoneOffset(utc, tz);
}

/** The first time a repeating job should run after `after`. */
export function nextRun(repeat: Repeat, after = Date.now()): number {
  if (repeat.kind === "interval") return after + repeat.ms;
  const [hour, minute] = repeat.time.split(":").map(Number);
  const local = new Date(after + zoneOffset(after, repeat.tz)); // the wall clock there, in UTC fields
  for (let ahead = 0; ahead <= 7; ahead++) {
    const wall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + ahead, hour, minute);
    if (!repeat.days.includes(new Date(wall).getUTCDay())) continue;
    const utc = wallToUtc(wall, repeat.tz);
    if (utc > after) return utc;
  }
  throw new Error("a repeating job needs at least one day");
}

export function describeRepeat(repeat: Repeat): string {
  if (repeat.kind === "interval") {
    const minutes = repeat.ms / 60_000;
    return `every ${minutes % 1440 === 0 ? `${minutes / 1440}d` : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`}`;
  }
  const days = repeat.days.length === 7 ? "every day" : `every ${repeat.days.map((d) => DAY_NAMES[d]).join(", ")}`;
  return `${days} at ${repeat.time} ${repeat.tz}`;
}

/**
 * Returns every job that is due. One-off jobs are removed; repeating jobs move to their
 * next time counted from now, so a stretch of downtime gives one late run, not a backlog.
 */
export function takeDueJobs(now = Date.now()): Job[] {
  const jobs = loadJobs();
  const due = jobs.filter((job) => Date.parse(job.at) <= now);
  if (!due.length) return [];
  saveJobs(
    jobs.flatMap((job) => {
      if (!due.includes(job)) return [job];
      if (!job.repeat) return [];
      return [{ ...job, at: new Date(nextRun(job.repeat, now)).toISOString(), runs: (job.runs ?? 0) + 1 }];
    }),
  );
  return due;
}
