// Champion-data utilities — slug formatting (for site URLs), the LCU
// champion-summary cache, and a couple of common LCU position helpers.

import * as lcu from "../../lcu.js";
import { LCU_CHAMPION_SUMMARY } from "../endpoints.js";

/**
 * Convert a champion display name to the slug used by lolalytics / op.gg /
 * mobalytics URLs. Handles all the tricky cases (apostrophes in Cho'Gath,
 * dots in Dr. Mundo, ampersands, spaces).
 *
 * Examples:
 *   "Aatrox"        → "aatrox"
 *   "Dr. Mundo"     → "drmundo"
 *   "Kai'Sa"        → "kaisa"
 *   "Renata Glasc"  → "renataglasc"
 */
export function formatChampionSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/['\s]/g, "")
    .replace(/\./g, "")
    .replace(/&/g, "and");
}

/**
 * Map an LCU position name (TOP / JUNGLE / MIDDLE / BOTTOM / UTILITY) to
 * the lane string lolalytics + u.gg expect (top / jungle / middle / bottom
 * / support). Empty string for "no preference".
 */
export function lcuPositionToLane(p) {
  const lower = String(p || "").toLowerCase();
  return lower === "utility" ? "support" : lower;
}

let cachedMap = null;

/**
 * Returns a Map<championId, {id, name, alias}> populated from LCU's
 * champion-summary.json. Cached for the lifetime of the renderer.
 */
export async function getChampionMap() {
  if (cachedMap) return cachedMap;
  try {
    const list = await lcu.get(LCU_CHAMPION_SUMMARY);
    const m = new Map();
    for (const c of list) {
      if (c.id < 0) continue; // skip the synthetic "None" entry (id = -1)
      m.set(c.id, c);
    }
    cachedMap = m;
  } catch {
    cachedMap = new Map();
  }
  return cachedMap;
}
