// Current LoL patch (e.g. "16.9") cached for the renderer's lifetime.
// Source: Riot's Data Dragon versions list (first entry).

import { DDRAGON_VERSIONS } from "../endpoints.js";

let cached = null;

/** Returns the current major.minor patch string, e.g. "16.9". */
export async function currentPatch() {
  if (cached) return cached;
  try {
    const versions = await fetch(DDRAGON_VERSIONS).then((r) => r.json());
    const [maj, min] = versions[0].split(".");
    cached = `${maj}.${min}`;
  } catch {
    cached = "";
  }
  return cached;
}
