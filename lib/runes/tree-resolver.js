// Resolve a perk's owning rune-tree (style id). Lolalytics returns perk
// arrays without telling you which tree they belong to; the LCU rejects
// rune-page POSTs whose primaryStyleId doesn't match the actual tree of
// the perks in slot 0-3, so getting this right is essential.
//
// PERK_TREE (bundled in lib/perk-data.js) is the source of truth. The
// integer-division fallback is unreliable — Riot ships keystones outside
// their tree's id range (e.g. Deathfire Touch 8992 lives in Sorcery 8200,
// not the non-existent 8900).

import { PERK_TREE } from "../perk-data.js";

/** Map of style-letter index → style id (lolalytics' page.pri/page.sec uses 0-4). */
const STYLE_BY_INDEX = [8000, 8100, 8200, 8300, 8400];

/**
 * Look up a single perk's tree id, falling back through the heuristic chain.
 * Returns 8000 (Precision) as a last-resort default rather than 0/undefined,
 * since LCU rejects pages with no primaryStyleId.
 */
export function treeOf(perkId) {
  const explicit = PERK_TREE[perkId];
  if (explicit) return explicit;
  const guess = Math.floor(perkId / 100) * 100;
  if (guess >= 8000 && guess <= 8400) return guess;
  return 8000;
}

/**
 * Walk a list of perk ids and return the first tree-id we can identify.
 * Used to derive primaryStyleId / subStyleId from the actual perks chosen,
 * which is more robust than relying on the source's `page.pri/page.sec`
 * indices alone.
 *
 * @param {number[]} perks       perks in this slot (primary or secondary)
 * @param {number}   fallbackIdx 0..4 — which tree to fall back to (uses STYLE_BY_INDEX)
 */
export function resolveTreeFromPerks(perks, fallbackIdx = 0) {
  for (const id of perks || []) {
    const t = PERK_TREE[id];
    if (t) return t;
  }
  if (perks?.length) {
    const guess = Math.floor(perks[0] / 100) * 100;
    if (guess >= 8000 && guess <= 8400) return guess;
  }
  return STYLE_BY_INDEX[fallbackIdx] ?? 8000;
}
