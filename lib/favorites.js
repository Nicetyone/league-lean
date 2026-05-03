// Per-position favorited champions, synced with Riot's champ-select preferences
// (the heart system used for autofill protection / "preferred picks").
//
// LCU endpoints (validated against the LCU swagger schema):
//   GET  /lol-champ-select/v1/all-grid-champions   → array of grid champions,
//        each with `positionsFavorited: string[]`
//   POST /lol-champ-select/v1/toggle-favorite/{championId}/{position}
//
// Caveat: these endpoints live under /lol-champ-select/, so they may only
// respond during an active champ-select session. We cache the last good
// response in DataStore so the UI still works outside of queue, and we replay
// pending toggles on the next successful fetch.

import * as lcu from "../lcu.js";

const log = (...a) => console.log("[league-lean][favorites]", ...a);

const CACHE_KEY = "league-lean.favorites-cache";
const PENDING_KEY = "league-lean.favorites-pending";

// Riot uses uppercase position names. Our lane keys come from the Meta tab.
export const LANE_TO_POSITION = {
  top: "TOP", jungle: "JUNGLE", middle: "MIDDLE",
  bottom: "BOTTOM", support: "UTILITY", utility: "UTILITY",
};

function readCache() {
  try {
    const raw = globalThis.DataStore?.get?.(CACHE_KEY);
    if (!raw) return {};
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch { return {}; }
}
function writeCache(byChampion) {
  try {
    globalThis.DataStore?.set?.(CACHE_KEY, JSON.stringify(byChampion));
  } catch (e) { log("cache write failed", e?.message); }
}

function readPending() {
  try {
    const raw = globalThis.DataStore?.get?.(PENDING_KEY);
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writePending(list) {
  try {
    globalThis.DataStore?.set?.(PENDING_KEY, JSON.stringify(list));
  } catch (e) { log("pending write failed", e?.message); }
}

let inMemory = null;       // { [championId]: string[] of positions }
let lastFetchAt = 0;

async function fetchFromLcu() {
  const data = await lcu.get("/lol-champ-select/v1/all-grid-champions");
  const out = {};
  for (const c of data || []) {
    if (Array.isArray(c?.positionsFavorited) && c.positionsFavorited.length) {
      out[c.id] = c.positionsFavorited.slice();
    }
  }
  return out;
}

// Returns { [championId]: string[] of positions }. Tries LCU first, falls back
// to cache. Caches successful LCU responses for offline use.
export async function load({ force = false } = {}) {
  if (inMemory && !force && Date.now() - lastFetchAt < 30_000) return inMemory;
  try {
    const fresh = await fetchFromLcu();
    inMemory = fresh;
    writeCache(fresh);
    lastFetchAt = Date.now();
    // Drain any pending toggles from offline interactions.
    const pending = readPending();
    if (pending.length) {
      log("draining", pending.length, "pending toggles");
      for (const { championId, position } of pending) {
        try { await lcu.post(`/lol-champ-select/v1/toggle-favorite/${championId}/${position}`); }
        catch (e) { log("drain toggle failed", championId, position, e?.message); }
      }
      writePending([]);
      // Re-fetch to reflect the drained state.
      try { inMemory = await fetchFromLcu(); writeCache(inMemory); } catch {}
    }
    return inMemory;
  } catch (e) {
    log("LCU fetch failed; using cache", e?.message);
    inMemory = readCache();
    return inMemory;
  }
}

export function isFavorite(championId, position) {
  const positions = inMemory?.[championId] || [];
  return positions.includes(position);
}

// Toggle the star for (championId, position). Optimistically updates the local
// cache + returns the new boolean state. If the LCU call fails (e.g. not in
// champ select), the toggle is queued and replayed next time fetch succeeds.
export async function toggle(championId, position) {
  const positions = (inMemory?.[championId] || []).slice();
  const idx = positions.indexOf(position);
  if (idx >= 0) positions.splice(idx, 1);
  else          positions.push(position);

  inMemory = { ...inMemory };
  if (positions.length) inMemory[championId] = positions;
  else                  delete inMemory[championId];
  writeCache(inMemory);

  try {
    await lcu.post(`/lol-champ-select/v1/toggle-favorite/${championId}/${position}`);
    log("toggled", championId, position, "→", idx < 0 ? "ON" : "OFF");
  } catch (e) {
    log("LCU toggle failed; queuing for next sync", e?.message);
    const pending = readPending();
    pending.push({ championId, position, ts: Date.now() });
    writePending(pending);
  }
  return idx < 0;
}
