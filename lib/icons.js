// Icon URL resolver. Perk + shard data is *bundled* (lib/perk-data.js) instead
// of fetched at runtime, so a Riot CDN hiccup or LCU path change can never
// break rune rendering. Other URLs go through the LCU's local asset server
// (`/lol-game-data/assets/v1/...`), which is same-origin to the renderer.
//
// To regenerate perk-data.js after a major rune shake-up:
//   bash scripts/regen-perks.sh
// (fetches CDragon's perks.json and dumps a fresh PERK_ICONS map.)

import { PERK_ICONS } from "./perk-data.js";

const ASSETS_BASE = "/lol-game-data/assets/v1";

export async function preload() { /* nothing to do — data is bundled */ }

export function perkIconUrl(perkId) {
  // PERK_ICONS values are already full LCU paths (start with /lol-game-data/...).
  return PERK_ICONS[Number(perkId)] || "";
}

// Stat shard ids (5001-5013) live inside PERK_ICONS — same source of truth.
export function shardIconUrl(shardId) {
  return PERK_ICONS[Number(shardId)] || "";
}

// Style (rune-tree) icons.
const STYLE_PATHS = {
  8000: "perk-images/Styles/7201_Precision.png",
  8100: "perk-images/Styles/7200_Domination.png",
  8200: "perk-images/Styles/7202_Sorcery.png",
  8300: "perk-images/Styles/7203_Whimsy.png",
  8400: "perk-images/Styles/7204_Resolve.png",
};
export function styleIconUrl(styleId) {
  const path = STYLE_PATHS[Number(styleId)];
  if (!path) return "";
  return `${ASSETS_BASE}/${path}`;
}

export function championPortraitUrl(championId) {
  return `${ASSETS_BASE}/champion-icons/${championId}.png`;
}

export function summonerSpellIconUrl(spellId) {
  // LCU ships summoner spell icons at this path. Same-origin to the renderer.
  return `${ASSETS_BASE}/summoner-spells/${spellId}.png`;
}

export function itemIconUrl(itemId) {
  return `${ASSETS_BASE}/items/${itemId}.png`;
}

// Position icons — inline SVGs so they render regardless of any plugin path.
export const POSITION_SVG = {
  top:     `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M3 21V3h18v6h-6v6h-6v6H3z" opacity="0.9"/></svg>`,
  jungle:  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 2L4 7v6c0 4 3 7 8 9 5-2 8-5 8-9V7l-8-5zm0 3l5 3v5c0 2.5-2 4.5-5 5.7-3-1.2-5-3.2-5-5.7V8l5-3z" opacity="0.9"/></svg>`,
  middle:  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21L21 3"/><path d="M5 19h2v-2H5z" fill="currentColor"/><path d="M17 7h2V5h-2z" fill="currentColor"/><path d="M10 14h4v-4h-4z"/></svg>`,
  bottom:  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M21 3v18H3v-6h6V9h6V3h6z" opacity="0.9"/></svg>`,
  support: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 2C7 2 4 6 4 11c0 5 3 8 8 11 5-3 8-6 8-11 0-5-3-9-8-9zm0 3c3 0 5 3 5 6 0 3-2 5-5 7-3-2-5-4-5-7 0-3 2-6 5-6z"/></svg>`,
  utility: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 2C7 2 4 6 4 11c0 5 3 8 8 11 5-3 8-6 8-11 0-5-3-9-8-9zm0 3c3 0 5 3 5 6 0 3-2 5-5 7-3-2-5-4-5-7 0-3 2-6 5-6z"/></svg>`,
};
export function positionSvg(lane) {
  const k = String(lane || "").toLowerCase();
  return POSITION_SVG[k] || POSITION_SVG.middle;
}

// Legacy no-op (kept so old callers don't crash).
export function laneIconUrl() { return ""; }
