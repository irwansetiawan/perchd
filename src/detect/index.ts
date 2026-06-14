import type { Detector, Runner } from "./types.js";
import { javascriptDetector } from "./javascript.js";
import { pythonDetector } from "./python.js";

/** Default chain order per PRD §5. config + convention added in M2. */
export const defaultDetectors: Detector[] = [javascriptDetector, pythonDetector];

export function detectRunner(dir: string, detectors: Detector[] = defaultDetectors): Runner | null {
  for (const d of detectors) {
    const r = d.detect(dir);
    if (r) return r;
  }
  return null;
}
