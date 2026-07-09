/**
 * Colour environment for spawned dev servers.
 *
 * Servers write to a log file so they can outlive the terminal that started
 * them, but dev servers strip colour when stdout is not a TTY. Forcing colour
 * on keeps ANSI codes in the log file, which `tail` replays on attach.
 * NO_COLOR wins, and an explicit FORCE_COLOR from the user is never overridden.
 */
export function colorEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (base.NO_COLOR !== undefined) return {};
  if (base.FORCE_COLOR !== undefined) return {};
  return { FORCE_COLOR: "1", CLICOLOR_FORCE: "1" };
}
