import { UsageError } from "./resolve.js";

export type RunArgs = {
  key?: string;
  url?: string;
  base?: string;
  tailBytes: number;
  start: boolean;
  command: string[];
};

const DEFAULT_TAIL = 10_000;

/**
 * `illari run [--key K] [--url U] [--base B] [--tail N] [--no-start] [--] cmd [args...]`
 *
 * Option parsing stops at the first token that is not a known `--flag`, or at
 * `--`. Everything from there on is the command, options and all.
 */
export function parseRunArgs(argv: string[]): RunArgs {
  const out: RunArgs = { tailBytes: DEFAULT_TAIL, start: true, command: [] };
  let i = 0;

  for (; i < argv.length; i++) {
    const tok = argv[i]!;
    if (tok === "--") {
      i++;
      break;
    }
    if (!tok.startsWith("--")) break;

    const eq = tok.indexOf("=");
    const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
    const inlineVal = eq === -1 ? undefined : tok.slice(eq + 1);
    const takeVal = (): string => {
      if (inlineVal !== undefined) return inlineVal;
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`--${name} needs a value`);
      return v;
    };

    switch (name) {
      case "key":
        out.key = takeVal();
        break;
      case "url":
        out.url = takeVal();
        break;
      case "base":
        out.base = takeVal();
        break;
      case "tail": {
        const n = Number(takeVal());
        if (!Number.isInteger(n) || n < 0) {
          throw new UsageError("--tail must be a non-negative integer");
        }
        out.tailBytes = n;
        break;
      }
      case "start":
        out.start = true;
        break;
      case "no-start":
        out.start = false;
        break;
      default:
        throw new UsageError(`unknown option --${name}`);
    }
  }

  out.command = argv.slice(i);
  if (out.command.length === 0) {
    throw new UsageError("nothing to run. Usage: illari run [options] -- <command>");
  }
  return out;
}
