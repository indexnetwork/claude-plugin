/**
 * Terminal output helpers for consistent CLI formatting.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

/** Print an error message to stderr and optionally exit. */
export function error(message: string, exitCode?: number): void {
  console.error(`${RED}Error:${RESET} ${message}`);
  if (exitCode !== undefined) {
    process.exit(exitCode);
  }
}

/** Print a success message. */
export function success(message: string): void {
  console.log(`${GREEN}${message}${RESET}`);
}

/** Print an informational message. */
export function info(message: string): void {
  console.log(`${CYAN}${message}${RESET}`);
}

/** Print a warning message. */
export function warn(message: string): void {
  console.log(`${YELLOW}${message}${RESET}`);
}

/** Print a dim/secondary message. */
export function dim(message: string): void {
  console.log(`${DIM}${message}${RESET}`);
}

/** Print a bold heading. */
export function heading(message: string): void {
  console.log(`\n${BOLD}${message}${RESET}`);
}

/**
 * Print a table of sessions.
 *
 * @param sessions - Array of session objects with id, title, createdAt.
 */
export function sessionTable(
  sessions: Array<{ id: string; title: string | null; createdAt: string }>,
): void {
  if (sessions.length === 0) {
    dim("  No chat sessions found.");
    return;
  }

  // Header
  const idWidth = 36;
  const titleWidth = 40;
  const dateWidth = 20;

  console.log(
    `  ${BOLD}${"ID".padEnd(idWidth)}  ${"Title".padEnd(titleWidth)}  ${"Created".padEnd(dateWidth)}${RESET}`,
  );
  console.log(`  ${"-".repeat(idWidth)}  ${"-".repeat(titleWidth)}  ${"-".repeat(dateWidth)}`);

  for (const s of sessions) {
    const title = (s.title ?? "(untitled)").slice(0, titleWidth);
    const date = new Date(s.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    console.log(
      `  ${DIM}${s.id.padEnd(idWidth)}${RESET}  ${title.padEnd(titleWidth)}  ${DIM}${date}${RESET}`,
    );
  }
}

/** Write a token directly to stdout without a newline (for streaming). */
export function token(text: string): void {
  process.stdout.write(text);
}

/** Print a status line (overwrites current line for spinner-like effect). */
export function status(message: string): void {
  process.stderr.write(`\r${DIM}${message}${RESET}\x1b[K`);
}

/** Clear the status line. */
export function clearStatus(): void {
  process.stderr.write("\r\x1b[K");
}
