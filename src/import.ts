import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseCrontab } from "./crontab.js";
import { UsageError } from "./resolve.js";

const DEFAULT_API = "https://illari.dev/api/v1";

type Args = {
  token?: string;
  api: string;
  timezone: string;
  prefix: string;
  dryRun: boolean;
  file?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    api: process.env.ILLARI_API ?? DEFAULT_API,
    timezone: "UTC",
    prefix: "",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${tok} needs a value`);
      return v;
    };
    if (tok === "--token") out.token = val();
    else if (tok === "--api") out.api = val().replace(/\/+$/, "");
    else if (tok === "--timezone" || tok === "--tz") out.timezone = val();
    else if (tok === "--prefix") out.prefix = val();
    else if (tok === "--dry-run" || tok === "-n") out.dryRun = true;
    else if (tok.startsWith("-")) throw new UsageError(`unknown option ${tok}`);
    else if (out.file === undefined) out.file = tok;
    else throw new UsageError(`unexpected argument ${JSON.stringify(tok)}`);
  }
  return out;
}

function readCrontab(file: string | undefined): string {
  if (file) return readFileSync(file, "utf8");
  if (!process.stdin.isTTY) {
    try {
      return readFileSync(0, "utf8");
    } catch {
      /* fall through to crontab -l */
    }
  }
  try {
    return execFileSync("crontab", ["-l"], { encoding: "utf8" });
  } catch {
    throw new UsageError(
      "no crontab given. Pass a file, pipe one in, or make sure `crontab -l` works.",
    );
  }
}

/**
 * `illari import [--token T] [--api URL] [--timezone TZ] [--prefix P] [--dry-run] [file]`
 *
 * Reads a crontab (a file, stdin, or `crontab -l`) and creates one monitor per
 * scheduled line via the Management API. Prints each monitor's ping key so the
 * jobs can be wired up.
 */
export async function importCrontab(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  const text = readCrontab(args.file);
  const { jobs, skipped } = parseCrontab(text, args.timezone);

  for (const s of skipped) {
    process.stderr.write(`illari: line ${s.line} skipped (${s.reason}): ${s.text}\n`);
  }
  if (jobs.length === 0) {
    process.stderr.write("illari: nothing to import.\n");
    return skipped.length ? 1 : 0;
  }

  const named = jobs.map((j) => ({
    ...j,
    name: (args.prefix + j.name).slice(0, 60),
  }));

  if (args.dryRun) {
    process.stdout.write(
      `Would create ${named.length} monitor${named.length === 1 ? "" : "s"}:\n\n`,
    );
    for (const j of named) {
      process.stdout.write(`  ${j.name}\n    ${j.schedule}  (${j.timezone})\n`);
    }
    process.stdout.write("\nRe-run without --dry-run to create them.\n");
    return 0;
  }

  const token = args.token ?? process.env.ILLARI_TOKEN;
  if (!token) {
    throw new UsageError(
      "no API token. Pass --token illari_... or set ILLARI_TOKEN (create one under Settings -> API keys).",
    );
  }
  if (!/^illari_[0-9a-fA-F]{32}$/.test(token)) {
    throw new UsageError("--token doesn't look like an illari API key");
  }

  let failed = 0;
  for (const j of named) {
    try {
      const res = await fetch(`${args.api}/monitors`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: j.name,
          cronExpression: j.schedule,
          timezone: j.timezone,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { data?: { pingKey?: string }; error?: string }
        | null;
      if (!res.ok) {
        failed++;
        process.stderr.write(
          `  ✗ ${j.name}: ${body?.error ?? `HTTP ${res.status}`}\n`,
        );
        continue;
      }
      process.stdout.write(
        `  ✓ ${j.name}  ${j.schedule}  →  ping key ${body?.data?.pingKey ?? "?"}\n`,
      );
    } catch (err) {
      failed++;
      process.stderr.write(
        `  ✗ ${j.name}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  const ok = named.length - failed;
  process.stdout.write(
    `\n${ok} created, ${failed} failed. Wire each job to ` +
      `https://illari.dev/ping/<key> as its last step.\n`,
  );
  return failed ? 1 : 0;
}
