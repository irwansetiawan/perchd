import type { ActiveServer } from "./state.js";

/** A stale active entry: state says a server is running but its pid is gone. */
export function needsReap(active: ActiveServer | null, pidAlive: boolean): boolean {
  return !!active && !pidAlive;
}
