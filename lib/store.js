// Settings persistence. Pengu provides a DataStore global with localStorage-
// like get/set, so we wrap it with defaults + a typed shape.

const KEY = "league-lean.settings";

export const defaults = Object.freeze({
  autoAccept: false,
  postGameOpgg: true,
  champSelectMeta: true,
  homeCleanup: true,
  performanceMode: false,

  // Auto champ-select actions
  autoLockIn: true,
  autoApplyRunes: true,
  autoApplyItems: true,
  autoApplyRunePage: "pick",  // "pick" (most played) | "win" (highest winrate)

  // Meta options
  metaSource: "lolalytics",   // "lolalytics" | "ugg" | "riot"
  metaTier: "platinum_plus",  // "all" | "platinum_plus" | "emerald_plus" | "diamond_plus" | "master_plus" | "challenger"

  // Update channel — which Git branch the in-app updater pulls from.
  updateBranch: "main",       // "main" (stable) | "dev" (experimental)
});

// Starred champions — separate key so they don't bloat the settings blob.
const STARS_KEY = "league-lean.starred-champions";

export function getStarredIds() {
  try {
    const raw = globalThis.DataStore?.get?.(STARS_KEY);
    if (!raw) return new Set();
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return new Set(Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : []);
  } catch {
    return new Set();
  }
}

export function isStarred(championId) {
  return getStarredIds().has(Number(championId));
}

export function toggleStar(championId) {
  const set = getStarredIds();
  const id = Number(championId);
  if (set.has(id)) set.delete(id); else set.add(id);
  try {
    globalThis.DataStore?.set?.(STARS_KEY, JSON.stringify([...set]));
  } catch (e) {
    console.warn("[league-lean][store] star persist failed", e);
  }
  return set.has(id);
}

function readRaw() {
  try {
    const raw = globalThis.DataStore?.get?.(KEY);
    if (!raw) return {};
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function writeRaw(obj) {
  try {
    globalThis.DataStore?.set?.(KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn("[league-lean][store] persist failed", e);
  }
}

export function load() {
  return { ...defaults, ...readRaw() };
}

export function save(patch) {
  const next = { ...load(), ...patch };
  writeRaw(next);
  return next;
}
