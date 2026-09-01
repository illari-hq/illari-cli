/**
 * Minimal crontab parser for `illari import`. Handles the user-crontab format
 * (5 time fields + command), `CRON_TZ` / `TZ` scoping, comments, blank lines,
 * and the `@daily` family (expanded to 5-field cron). Does NOT handle the
 * system-crontab / cron.d 6-field form (a username before the command).
 */

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

export type CronJob = {
  line: number;
  schedule: string; // 5-field cron
  command: string;
  name: string;
  timezone: string;
};

export type SkippedLine = {
  line: number;
  text: string;
  reason: string;
};

export type ParseResult = {
  jobs: CronJob[];
  skipped: SkippedLine[];
};

const ENV_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export function parseCrontab(
  text: string,
  defaultTz = "UTC",
): ParseResult {
  const jobs: CronJob[] = [];
  const skipped: SkippedLine[] = [];
  let tz = defaultTz;
  const nameCounts = new Map<string, number>();

  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const lineNo = i + 1;
    const line = rawLines[i]!.trim();
    if (line === "" || line.startsWith("#")) continue;

    // Environment assignment (must come before any whitespace-run that looks
    // like a schedule). CRON_TZ / TZ scope the timezone for later lines.
    const env = ENV_RE.exec(line);
    if (env && !/\s/.test(env[1]!)) {
      const key = env[1]!;
      let val = env[2]!.trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key === "CRON_TZ" || key === "TZ") tz = val || defaultTz;
      continue;
    }

    if (line.startsWith("@reboot")) {
      skipped.push({ line: lineNo, text: line, reason: "@reboot has no schedule" });
      continue;
    }

    let schedule: string;
    let command: string;

    const macroMatch = /^(@\w+)\s+(.+)$/.exec(line);
    if (macroMatch) {
      const macro = macroMatch[1]!.toLowerCase();
      const expanded = MACROS[macro];
      if (!expanded) {
        skipped.push({ line: lineNo, text: line, reason: `unknown macro ${macro}` });
        continue;
      }
      schedule = expanded;
      command = macroMatch[2]!.trim();
    } else {
      const parts = line.split(/\s+/);
      if (parts.length < 6) {
        skipped.push({
          line: lineNo,
          text: line,
          reason: "not 5 time fields + a command",
        });
        continue;
      }
      schedule = parts.slice(0, 5).join(" ");
      command = parts.slice(5).join(" ");
    }

    // crontab `%` = newline / stdin separator; the command is the part before it.
    const pct = command.search(/(?<!\\)%/);
    if (pct !== -1) command = command.slice(0, pct).trim();

    let name = deriveName(command);
    const seen = nameCounts.get(name) ?? 0;
    nameCounts.set(name, seen + 1);
    if (seen > 0) name = `${name} ${seen + 1}`;

    jobs.push({ line: lineNo, schedule, command, name, timezone: tz });
  }

  return { jobs, skipped };
}

const SCRIPT_EXT = /\.(sh|bash|py|rb|pl|php|js|mjs|cjs|ts|rake|bin)$/i;
const WRAPPERS = new Set([
  "cd",
  "env",
  "sh",
  "bash",
  "/bin/sh",
  "/bin/bash",
  "/usr/bin/env",
  "flock",
  "nice",
  "ionice",
  "timeout",
  "chronic",
  "run-one",
  "&&",
  ";",
  "|",
]);

/** Best-effort monitor name from a command line. Imperfect by design — the
 *  user reviews the dry run and renames in the dashboard. */
export function deriveName(command: string): string {
  const tokens = command.split(/\s+/).filter(Boolean);
  // The real command usually comes last, after `cd x &&` / `flock lock` / etc.,
  // so prefer the last path-like token.
  const candidate =
    tokens.findLast((t) => SCRIPT_EXT.test(t)) ??
    tokens.findLast((t, idx) => {
      if (!t.includes("/") || t === "/") return false;
      const prev = tokens[idx - 1];
      return prev !== "cd" && prev !== "flock";
    }) ??
    tokens.find((t) => !t.startsWith("-") && !WRAPPERS.has(t)) ??
    tokens[0] ??
    "job";

  const base = candidate.split("/").filter(Boolean).pop() ?? candidate;
  const name = base.replace(/^-+/, "").trim() || command.slice(0, 40).trim();
  return name.slice(0, 60);
}
