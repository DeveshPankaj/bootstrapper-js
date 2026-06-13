import { Platform } from "@shared/index";

const CRONTAB_PATH = "/etc/crontab";
const CRON_TICK_MS = 15000;

type CronJob = {
  minute: string;
  hour: string;
  dom: string;
  month: string;
  dow: string;
  command: string;
};

// Matches a single cron field (`*`, `5`, `1,3,5`, `1-5`, `*/15`, ...) against
// a calendar value.
const fieldMatches = (field: string, value: number): boolean => {
  return field.split(",").some((part) => {
    if (part === "*") return true;
    if (part.includes("/")) {
      const [range, step] = part.split("/");
      const start = range === "*" ? 0 : parseInt(range, 10);
      return value >= start && (value - start) % parseInt(step, 10) === 0;
    }
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      return value >= start && value <= end;
    }
    return parseInt(part, 10) === value;
  });
};

// Parses standard 5-field crontab lines (`m h dom mon dow command...`).
// Blank lines and lines starting with `#` are ignored.
export const parseCrontab = (content: string): CronJob[] => {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [minute, hour, dom, month, dow, ...command] = line.split(/\s+/);
      return { minute, hour, dom, month, dow, command: command.join(" ") };
    })
    .filter((job) => job.command);
};

const jobMatchesTime = (job: CronJob, now: Date): boolean =>
  fieldMatches(job.minute, now.getMinutes()) &&
  fieldMatches(job.hour, now.getHours()) &&
  fieldMatches(job.dom, now.getDate()) &&
  fieldMatches(job.month, now.getMonth() + 1) &&
  fieldMatches(job.dow, now.getDay());

// A job's command is either a path to a script (run via `host.exec`, so
// `.js`/`.run`/etc. all work as usual) or a `execCommand` DSL expression
// (e.g. `service('root', 'exec') ('/opt/cron/check-public-ip.js')`).
const runJob = (job: CronJob) => {
  const platform = Platform.getInstance();
  try {
    if (job.command.startsWith("/")) {
      const [filepath, ...args] = job.command.split(/\s+/);
      platform.host.exec(platform, filepath, ...args);
    } else {
      platform.host.execCommand(job.command, platform);
    }
  } catch (err) {
    console.error(`cron: failed to run job "${job.command}"`, err);
  }
};

const minuteKey = (now: Date) =>
  `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

// Polls `/etc/crontab` and runs any due jobs, at most once per calendar
// minute. Returns the interval id so callers can stop it if needed.
export const startCronScheduler = (): number => {
  let lastMinuteKey = "";

  const tick = () => {
    const platform = Platform.getInstance();
    try {
      const fs = platform.host.getFS();
      if (!fs.existsSync(CRONTAB_PATH)) return;

      const now = new Date();
      const key = minuteKey(now);
      if (key === lastMinuteKey) return;
      lastMinuteKey = key;

      const content = fs.readFileSync(CRONTAB_PATH, "utf-8") as string;
      parseCrontab(content)
        .filter((job) => jobMatchesTime(job, now))
        .forEach(runJob);
    } catch (err) {
      console.error("cron: tick failed", err);
    }
  };

  tick();
  return window.setInterval(tick, CRON_TICK_MS);
};
