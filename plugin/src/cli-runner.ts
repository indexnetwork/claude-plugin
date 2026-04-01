import { execFile } from 'child_process';
import type { AuthConfig } from './auth.js';

export interface CliResult {
  success: boolean;
  data?: unknown;
  error?: string;
  [key: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Runs an `index` CLI command with `--json` output and returns the parsed result.
 *
 * @param command - Positional arguments after `index`, e.g. `['intent', 'list']`
 * @param auth - Authentication config (token + apiUrl)
 * @param timeout - Optional timeout in milliseconds (default 120s)
 * @returns Parsed CLI result
 */
export async function runCli(
  command: string[],
  auth: AuthConfig,
  timeout: number = DEFAULT_TIMEOUT_MS
): Promise<CliResult> {
  const args = [
    ...command,
    '--json',
    '--token', auth.token,
    '--api-url', auth.apiUrl,
  ];

  return new Promise<CliResult>((resolve) => {
    execFile('index', args, { timeout, maxBuffer: MAX_BUFFER_BYTES }, (error, stdout, stderr) => {
      if (error) {
        // Try to parse stderr as JSON first (CLI may emit structured errors there)
        const errText = stderr?.trim() || error.message;
        try {
          const parsed = JSON.parse(errText) as Omit<CliResult, 'success'> & { success?: boolean };
          resolve({ ...parsed, success: false });
        } catch {
          resolve({ success: false, error: errText });
        }
        return;
      }

      const out = stdout.trim();
      if (!out) {
        resolve({ success: true });
        return;
      }

      try {
        const parsed = JSON.parse(out) as CliResult;
        // If the CLI already sets success, preserve it; otherwise default to true
        if (typeof parsed.success === 'undefined') {
          resolve({ ...parsed, success: true });
        } else {
          resolve(parsed);
        }
      } catch {
        // Not JSON — return raw text
        resolve({ success: true, data: out });
      }
    });
  });
}
