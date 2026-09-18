import { Platform } from "@shared/index";
import { Subject } from "rxjs";

// A lightweight systemd/systemctl analog. Unit files are read from
// SYSTEMD_UNITS_DIR (the FHS-lite equivalent of /etc/systemd/system/), each
// service is executed as an isolated `Platform` (so its
// `platform.getService('systemd')` context - `onStop`/`log` - is scoped to
// that one activation), and enabled units autostart at boot (the analog of
// reaching multi-user.target). See src/core/cron.ts for the sibling
// scheduled-job system this mirrors conventions from.
export const SYSTEMD_UNITS_DIR = "/etc/systemd/system";
export const SYSTEMD_ENABLED_PATH = "/etc/systemd/enabled.json";
export const SYSTEMD_LOG_DIR = "/var/log/systemd";

type RestartPolicy = "no" | "on-failure" | "always";

type ParsedUnit = {
  description: string;
  execStart: string;
  restart: RestartPolicy;
  restartSec: number;
  wantedBy: string;
};

export type UnitStatus = "inactive" | "activating" | "active" | "deactivating" | "failed";

export type UnitInfo = {
  name: string;
  description: string;
  execStart: string;
  restart: RestartPolicy;
  status: UnitStatus;
  enabled: boolean;
  mainPid: number | null;
  startedAt: number | null;
  restartCount: number;
  lastError: string | null;
};

type UnitRuntime = {
  status: UnitStatus;
  mainPid: number | null;
  startedAt: number | null;
  restartCount: number;
  lastError: string | null;
  restartTimer: number | null;
  stopCallbacks: Array<() => void>;
};

const runtime = new Map<string, UnitRuntime>();
let nextPid = 1000;

const newRuntime = (): UnitRuntime => ({
  status: "inactive",
  mainPid: null,
  startedAt: null,
  restartCount: 0,
  lastError: null,
  restartTimer: null,
  stopCallbacks: [],
});

const getRuntime = (name: string): UnitRuntime => {
  if (!runtime.has(name)) runtime.set(name, newRuntime());
  return runtime.get(name)!;
};

const normalizeName = (name: string) => (name.endsWith(".service") ? name : `${name}.service`);

// Parses the small ini-style subset real systemd unit files use: `[Section]`
// headers and `Key=Value` lines. `#`/`;` line comments are ignored, matching
// systemd's own unit file syntax.
const parseUnitFile = (content: string): ParsedUnit => {
  let section = "";
  const fields: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) { section = sectionMatch[1]; continue; }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    fields[`${section}.${key}`] = value;
  }
  return {
    description: fields["Unit.Description"] || "",
    execStart: fields["Service.ExecStart"] || "",
    restart: (fields["Service.Restart"] as RestartPolicy) || "no",
    restartSec: Number(fields["Service.RestartSec"]) || 5,
    wantedBy: fields["Install.WantedBy"] || "",
  };
};

const readEnabled = (): string[] => {
  const platform = Platform.getInstance();
  try {
    const fs = platform.host.getFS();
    if (!fs.existsSync(SYSTEMD_ENABLED_PATH)) return [];
    return JSON.parse(fs.readFileSync(SYSTEMD_ENABLED_PATH, "utf-8") as string);
  } catch {
    return [];
  }
};

const writeEnabled = (names: string[]) => {
  const platform = Platform.getInstance();
  const fs = platform.host.getFS();
  const dir = SYSTEMD_ENABLED_PATH.slice(0, SYSTEMD_ENABLED_PATH.lastIndexOf("/"));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SYSTEMD_ENABLED_PATH, JSON.stringify(names, null, 2));
};

const appendJournal = (name: string, line: string) => {
  const platform = Platform.getInstance();
  try {
    const fs = platform.host.getFS();
    if (!fs.existsSync(SYSTEMD_LOG_DIR)) fs.mkdirSync(SYSTEMD_LOG_DIR, { recursive: true });
    const path = `${SYSTEMD_LOG_DIR}/${name}.log`;
    const existing = fs.existsSync(path) ? (fs.readFileSync(path, "utf-8") as string) : "";
    fs.writeFileSync(path, `${existing}${new Date().toISOString()} ${line}\n`);
  } catch (err) {
    console.error(`systemd: failed to write journal for ${name}`, err);
  }
};

export const readJournal = (name: string, lines = 50): string[] => {
  const unitName = normalizeName(name);
  const platform = Platform.getInstance();
  try {
    const fs = platform.host.getFS();
    const path = `${SYSTEMD_LOG_DIR}/${unitName}.log`;
    if (!fs.existsSync(path)) return [];
    const content = fs.readFileSync(path, "utf-8") as string;
    return content.split("\n").filter(Boolean).slice(-lines);
  } catch {
    return [];
  }
};

export const listUnitNames = (): string[] => {
  const platform = Platform.getInstance();
  try {
    const fs = platform.host.getFS();
    if (!fs.existsSync(SYSTEMD_UNITS_DIR)) return [];
    return (fs.readdirSync(SYSTEMD_UNITS_DIR) as string[]).filter((f) => f.endsWith(".service")).sort();
  } catch {
    return [];
  }
};

const readUnit = (name: string): ParsedUnit | null => {
  const platform = Platform.getInstance();
  try {
    const fs = platform.host.getFS();
    const path = `${SYSTEMD_UNITS_DIR}/${name}`;
    if (!fs.existsSync(path)) return null;
    return parseUnitFile(fs.readFileSync(path, "utf-8") as string);
  } catch {
    return null;
  }
};

export const getStatus = (name: string): UnitInfo | null => {
  const unitName = normalizeName(name);
  const unit = readUnit(unitName);
  if (!unit) return null;
  const rt = getRuntime(unitName);
  return {
    name: unitName,
    description: unit.description,
    execStart: unit.execStart,
    restart: unit.restart,
    status: rt.status,
    enabled: readEnabled().includes(unitName),
    mainPid: rt.mainPid,
    startedAt: rt.startedAt,
    restartCount: rt.restartCount,
    lastError: rt.lastError,
  };
};

export const listUnits = (): UnitInfo[] =>
  listUnitNames()
    .map((name) => getStatus(name))
    .filter((u): u is UnitInfo => !!u);

const MAX_RESTARTS = 5;

// Runs a unit's ExecStart, isolated in its own Platform so the script's
// `platform.getService('systemd')` (`onStop`/`isStopRequested`/`log`) is
// scoped to this one activation rather than shared with whatever's calling
// `startUnit`/`activate` - mirrors a real service getting its own process.
const activate = (name: string) => {
  const rootPlatform = Platform.getInstance();
  const unit = readUnit(name);
  const rt = getRuntime(name);

  if (rt.restartTimer !== null) {
    window.clearTimeout(rt.restartTimer);
    rt.restartTimer = null;
  }

  if (!unit || !unit.execStart) {
    rt.status = "failed";
    rt.lastError = "No ExecStart directive";
    return;
  }

  rt.stopCallbacks = [];
  rt.status = "activating";
  rt.mainPid = nextPid++;
  rt.startedAt = Date.now();
  rt.lastError = null;
  appendJournal(name, `Starting ${unit.description || name}...`);

  const svcPlatform = new Platform(new Subject(), `systemd:${name}:${rt.mainPid}`, "/");
  svcPlatform.setHost(rootPlatform.host);
  svcPlatform.register("systemd", {
    unit: name,
    onStop: (cb: () => void) => { rt.stopCallbacks.push(cb); },
    isStopRequested: () => rt.status === "deactivating",
    log: (...args: unknown[]) => appendJournal(name, args.map(String).join(" ")),
  });

  try {
    const fs = rootPlatform.host.getFS();
    const source = fs.readFileSync(unit.execStart, "utf-8") as string;
    if (unit.execStart.endsWith(".run")) {
      rootPlatform.host.execCommand(source, svcPlatform);
    } else {
      rootPlatform.host.execString(source, unit.execStart, svcPlatform);
    }
    rt.status = "active";
    rt.restartCount = 0;
    appendJournal(name, `Started ${unit.description || name}.`);
  } catch (err) {
    rt.status = "failed";
    rt.mainPid = null;
    rt.lastError = err instanceof Error ? err.message : String(err);
    appendJournal(name, `Failed: ${rt.lastError}`);
    console.error(`systemd: unit ${name} failed`, err);

    if (unit.restart === "always" || unit.restart === "on-failure") {
      if (rt.restartCount >= MAX_RESTARTS) {
        appendJournal(name, "Start request repeated too quickly, refusing to start (start-limit-hit).");
        return;
      }
      rt.restartCount += 1;
      rt.restartTimer = window.setTimeout(() => activate(name), unit.restartSec * 1000);
    }
  }
};

export const startUnit = (name: string): void => {
  const unitName = normalizeName(name);
  const rt = getRuntime(unitName);
  if (rt.status === "active" || rt.status === "activating") return;
  activate(unitName);
};

// Stopping is cooperative, like sending a real service SIGTERM: it runs
// every callback the unit registered via `systemd.onStop(...)` and then
// marks the unit inactive. A unit that never registered a stop handler (the
// equivalent of a daemon ignoring SIGTERM) has no interval/timer we can
// reach into from outside to force-cancel, so it keeps running - write
// services to cooperate with `onStop`, the same expectation a real daemon
// has of handling SIGTERM.
export const stopUnit = (name: string): void => {
  const unitName = normalizeName(name);
  const rt = getRuntime(unitName);
  if (rt.restartTimer !== null) {
    window.clearTimeout(rt.restartTimer);
    rt.restartTimer = null;
  }
  if (rt.status !== "active" && rt.status !== "activating") return;

  rt.status = "deactivating";
  appendJournal(unitName, "Stopping...");
  rt.stopCallbacks.forEach((cb) => {
    try { cb(); } catch (err) { console.error(`systemd: stop handler for ${unitName} threw`, err); }
  });
  rt.stopCallbacks = [];
  rt.status = "inactive";
  rt.mainPid = null;
  rt.restartCount = 0;
  appendJournal(unitName, "Stopped.");
};

export const restartUnit = (name: string): void => {
  const unitName = normalizeName(name);
  stopUnit(unitName);
  activate(unitName);
};

// `enable`/`disable` record autostart intent in SYSTEMD_ENABLED_PATH - the
// flat-file stand-in for real systemd's `WantedBy=` symlinks under
// /etc/systemd/system/multi-user.target.wants/ (skipped here since the vfs's
// symlink support is unreliable, matching this repo's existing preference
// for plain tracked files over symlinks elsewhere, e.g. crontab).
export const enableUnit = (name: string): void => {
  const unitName = normalizeName(name);
  const names = readEnabled();
  if (!names.includes(unitName)) writeEnabled([...names, unitName]);
  appendJournal(unitName, `Created symlink for ${unitName}.`);
};

export const disableUnit = (name: string): void => {
  const unitName = normalizeName(name);
  writeEnabled(readEnabled().filter((n) => n !== unitName));
  appendJournal(unitName, `Removed symlink for ${unitName}.`);
};

// Starts every enabled unit found on disk - the analog of systemd reaching
// multi-user.target at boot. Units not listed in enabled.json stay inactive
// until started manually via `systemctl start`.
export const startSystemd = (): void => {
  const enabled = readEnabled();
  const present = new Set(listUnitNames());
  enabled.filter((name) => present.has(name)).forEach((name) => activate(name));
};
