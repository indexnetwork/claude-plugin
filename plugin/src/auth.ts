import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface AuthConfig {
  token: string;
  apiUrl: string;
}

const DEFAULT_API_URL = 'https://protocol.index.network';
const CREDENTIALS_PATH = join(homedir(), '.index', 'credentials.json');

/**
 * Resolves authentication configuration.
 *
 * Priority:
 * 1. `INDEX_API_TOKEN` environment variable
 * 2. `~/.index/credentials.json` file with `{ token, apiUrl }`
 *
 * @returns Resolved auth config with token and apiUrl
 * @throws Error if no token can be found
 */
export function resolveAuth(): AuthConfig {
  const envToken = process.env['INDEX_API_TOKEN'];
  const envApiUrl = process.env['INDEX_API_URL'] ?? DEFAULT_API_URL;

  if (envToken) {
    return { token: envToken, apiUrl: envApiUrl };
  }

  try {
    const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as { token?: string; apiUrl?: string };

    if (!parsed.token) {
      throw new Error(`credentials.json found at ${CREDENTIALS_PATH} but missing "token" field`);
    }

    return {
      token: parsed.token,
      apiUrl: parsed.apiUrl ?? DEFAULT_API_URL,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'No Index Network authentication found.\n\n' +
        'Please set the INDEX_API_TOKEN environment variable, or run `index login` to save ' +
        `credentials to ${CREDENTIALS_PATH}.`
      );
    }
    throw err;
  }
}
