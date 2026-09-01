import { resolveApiBase, requireToken } from "./api.js";
import { UsageError } from "./resolve.js";

type Monitor = {
  name: string;
  status: string;
  paused: boolean;
  snoozedUntil: string | null;
  lastPingAt: string | null;
  cronExpression: string | null;
  timezone: string;
};

/**
 * `illari list [--token T] [--api URL]`
 *
 * Print the account's monitors and their current state.
 */
export async function list(argv: string[]): Promise<number> {
  let token: string | undefined;
  let api: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (tok === "--token") token = need(argv[++i], "--token");
    else if (tok === "--api") api = need(argv[++i], "--api");
    else throw new UsageError(`unexpected argument ${JSON.stringify(tok)}`);
  }

  const base = resolveApiBase(api);
  const t = requireToken(token);

  let res: Response;
  try {
    res = await fetch(`${base}/monitors`, {
      headers: { authorization: `Bearer ${t}` },
    });
  } catch (err) {
    process.stderr.write(
      `illari: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    process.stderr.write(`illari: ${b?.error ?? `HTTP ${res.status}`}\n`);
    return 1;
  }

  const { data } = (await res.json()) as { data: Monitor[] };
  if (data.length === 0) {
    process.stdout.write("No monitors.\n");
    return 0;
  }

  const rows = data.map((m) => [
    m.name,
    effectiveStatus(m),
    m.lastPingAt ? relative(m.lastPingAt) : "never",
    m.cronExpression
      ? `${m.cronExpression} (${m.timezone})`
      : "no fixed schedule",
  ]);
  printTable(["NAME", "STATUS", "LAST CHECK-IN", "SCHEDULE"], rows);
  return 0;
}

export function effectiveStatus(m: {
  status: string;
  paused: boolean;
  snoozedUntil: string | null;
}): string {
  if (m.paused) return "paused";
  if (m.snoozedUntil && new Date(m.snoozedUntil).getTime() > Date.now()) {
    return "snoozed";
  }
  return m.status;
}

export function relative(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 0) return "in the future";
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]!)))
      .join("  ")
      .trimEnd();
  process.stdout.write(line(headers) + "\n");
  for (const r of rows) process.stdout.write(line(r) + "\n");
}

function need(v: string | undefined, name: string): string {
  if (v === undefined) throw new UsageError(`${name} needs a value`);
  return v;
}
