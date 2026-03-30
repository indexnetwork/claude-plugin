import type { CredentialStore } from "./auth.store";

/** Result of the login callback flow. */
export interface LoginResult {
  success: boolean;
  error?: string;
}

/** Options for the login handler. */
export interface LoginOptions {
  /** AbortSignal to cancel the callback server. */
  signal?: AbortSignal;
  /** Timeout in milliseconds for the callback server. Defaults to 120_000 (2 min). */
  timeoutMs?: number;
}

/** Return value from handleLogin — gives the caller the auth URL and a promise. */
export interface LoginHandle {
  /** The full OAuth URL to open in the browser. */
  authUrl: string;
  /** The port the callback server is listening on. */
  port: number;
  /** Resolves when the callback is received or the timeout fires. */
  callbackPromise: Promise<LoginResult>;
}

/**
 * Start the OAuth login flow.
 *
 * 1. Starts a local HTTP server on an ephemeral port.
 * 2. Constructs the OAuth URL pointing the callback to the local server.
 * 3. Returns the URL so the caller can open it in a browser.
 * 4. Waits for the callback (or timeout).
 * 5. Saves the received token to the credential store.
 *
 * @param apiUrl - The protocol server base URL.
 * @param store - The credential store instance.
 * @param options - Optional signal and timeout configuration.
 * @returns A handle with the auth URL and a promise for the result.
 */
export async function handleLogin(
  apiUrl: string,
  store: CredentialStore,
  options: LoginOptions = {},
): Promise<LoginHandle> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const baseUrl = apiUrl.replace(/\/$/, "");

  let resolveCallback: (result: LoginResult) => void;
  const callbackPromise = new Promise<LoginResult>((resolve) => {
    resolveCallback = resolve;
  });

  // Start local callback server on ephemeral port
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/callback") {
        const sessionToken = url.searchParams.get("session_token");

        if (sessionToken) {
          await store.save({ token: sessionToken, apiUrl: baseUrl });
          resolveCallback({ success: true });

          return new Response(
            "<html><body><h2>Login successful!</h2><p>You can close this window and return to the terminal.</p></body></html>",
            { headers: { "Content-Type": "text/html" } },
          );
        }

        resolveCallback({
          success: false,
          error: "No session token received in callback.",
        });

        return new Response(
          "<html><body><h2>Login failed</h2><p>No session token received.</p></body></html>",
          { headers: { "Content-Type": "text/html" }, status: 400 },
        );
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  const port = server.port;
  const callbackUrl = `http://localhost:${port}/callback`;

  // Construct the OAuth URL
  // Better Auth social sign-in URL with callback redirect to our local server
  const authUrl =
    `${baseUrl}/api/auth/sign-in/social?provider=google` +
    `&callbackURL=${encodeURIComponent(callbackUrl)}`;

  // Set up timeout
  const timeout = setTimeout(() => {
    resolveCallback({
      success: false,
      error: "Login timed out. No callback received.",
    });
    server.stop(true);
  }, timeoutMs);

  // Set up abort handler
  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      server.stop(true);
      resolveCallback({
        success: false,
        error: "Login cancelled.",
      });
    });
  }

  // Clean up server after callback resolves (with a short delay to allow
  // the HTTP response to be flushed before the server shuts down).
  const wrappedPromise = callbackPromise.then(async (result) => {
    clearTimeout(timeout);
    await new Promise((r) => setTimeout(r, 100));
    server.stop(true);
    return result;
  });

  return {
    authUrl,
    port,
    callbackPromise: wrappedPromise,
  };
}
