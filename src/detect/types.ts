export interface Runner {
  type: string;
  command: string;
  cwd: string;
  port: number;
  url: string;
  env?: Record<string, string>;
  /** true when a heuristic guess was made (e.g. FastAPI app var) — surfaced in status */
  guessed?: boolean;
}

export interface Detector {
  name: string;
  detect(dir: string): Runner | null;
}

export function urlFor(port: number): string {
  return `http://localhost:${port}`;
}
