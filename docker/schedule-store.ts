// Scheduled jobs, shared by the `schedule` command and the supervisor.
// Stored in the data folder so they survive restarts and the owner can read them.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export const SCHEDULE_FILE = process.env.SANCHO_SCHEDULE ?? "/data/schedule.json";
export const MAX_JOBS = 50;

export type Job = {
  id: string;
  at: string; // when to run, UTC ISO-8601
  chatId: string; // Discord chat to answer in
  user?: string; // who asked
  userId?: string;
  task: string;
  createdAt: string;
  attempts?: number;
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

/** Removes and returns every job that is due. */
export function takeDueJobs(now = Date.now()): Job[] {
  const jobs = loadJobs();
  const due = jobs.filter((job) => Date.parse(job.at) <= now);
  if (due.length) saveJobs(jobs.filter((job) => !due.includes(job)));
  return due;
}
