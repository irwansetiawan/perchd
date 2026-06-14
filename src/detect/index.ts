import type { Detector, Runner } from "./types.js";
import { conventionDetector } from "./convention.js";
import { javascriptDetector } from "./javascript.js";
import { pythonDetector } from "./python.js";

/**
 * Default chain order per PRD §5. Explicit config is applied separately in
 * resolveRunner (it overrides whatever is detected here), so the chain itself
 * is: convention runners → JS → Python.
 */
export const defaultDetectors: Detector[] = [conventionDetector, javascriptDetector, pythonDetector];

export function detectRunner(dir: string, detectors: Detector[] = defaultDetectors): Runner | null {
  for (const d of detectors) {
    const r = d.detect(dir);
    if (r) return r;
  }
  return null;
}
