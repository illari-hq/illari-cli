# illari CLI

Wrap a scheduled job so [illari](https://illari.dev) sees its start, exit code,
duration, and output, without editing the script.

```
npm install -g illari
# or: npx illari run -- ./job.sh
```

## illari run

```
illari run [options] -- <command> [args...]
```

Sends `<ping>/start`, runs the command with stdio passed straight through, then
sends `<ping>/<exit code>` with the tail of the command's output as the body.
The wrapper exits with the command's own exit code. A failed ping is a warning
on stderr, never fatal.

```bash
illari run --key abc123 -- ./nightly-etl.sh

# from a crontab line, key in the environment
ILLARI_KEY=abc123 illari run -- /usr/local/bin/backup.sh
```

### Options

| Option | Env | Default | |
|---|---|---|---|
| `--key <key>` | `ILLARI_KEY` | | monitor ping key |
| `--url <url>` | `ILLARI_URL` | | full ping URL; overrides `--key` |
| `--base <url>` | `ILLARI_BASE` | `https://illari.dev/ping` | base joined to `--key` |
| `--tail <bytes>` | | `10000` | output kept for the completion body; `0` disables |
| `--no-start` | | | skip the `/start` ping |

## illari ping

A one-shot check-in, for a crontab line or a manual test. The optional trailing
argument is the event suffix: `start`, `fail`, or an exit code.

```bash
illari ping --key abc123
illari ping --key abc123 fail
ILLARI_URL=https://illari.dev/ping/abc123 illari ping
```

## Notes

- Node 18 or newer. No runtime dependencies.
- `illari import` (read a crontab, create monitors) is planned, not built yet.

Docs: <https://illari.dev/docs>

## Development

```bash
npm install
npm test        # tsc build + node --test
```

Source is TypeScript in `src/`, tests in `test/`. The published package is the
compiled `dist/src` only. Releases go out from a `vX.Y.Z` tag (see
`.github/workflows/release.yml`).

MIT licensed.
