// Shared helpers used by more than one tab in the sidebar.

import * as meta from "../../lib/meta.js";

// Cache the LCU champion summary for the lifetime of the renderer. The summary
// is ~150KB JSON returned by /lol-game-data — fetching it more than once is
// wasted I/O.
let champCache = null;

/** Returns a Map<championId, championRecord> from the LCU. Cached after first hit. */
export async function getChampions() {
  if (champCache) return champCache;
  champCache = await meta.getChampionMap();
  return champCache;
}

/**
 * Derive a coarse S+/S/A+/A/B/C/D tier from raw winrate and pickrate.
 * Mirrors Lolalytics's own thresholds approximately so the in-app letters
 * line up with what the user sees on the source site.
 */
export function derivedTier(wr, pr) {
  if (wr == null || pr == null) return null;
  if (wr >= 53 && pr >= 5) return "S+";
  if (wr >= 52)            return "S";
  if (wr >= 51)            return "A+";
  if (wr >= 50)            return "A";
  if (wr >= 49)            return "B";
  if (wr >= 48)            return "C";
  return "D";
}
