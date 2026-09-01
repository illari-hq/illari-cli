import { UsageError } from "./resolve.js";

/** Management API base + bearer token, shared by `import` and `list`. */
export const DEFAULT_API = "https://illari.dev/api/v1";

export function resolveApiBase(
  cliValue?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (cliValue ?? env.ILLARI_API ?? DEFAULT_API).replace(/\/+$/, "");
}

export function requireToken(
  cliValue?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const t = cliValue ?? env.ILLARI_TOKEN;
  if (!t) {
    throw new UsageError(
      "no API token. Pass --token illari_... or set ILLARI_TOKEN (create one under Settings -> API keys).",
    );
  }
  if (!/^illari_[0-9a-fA-F]{32}$/.test(t)) {
    throw new UsageError("--token doesn't look like an illari API key");
  }
  return t;
}
