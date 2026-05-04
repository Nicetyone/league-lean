// LCU summoner-spell management.
//
// Endpoint: PATCH /lol-champ-select/v1/session/my-selection
//   body: { spell1Id, spell2Id }
//
// Only respects PATCH while the player's pick action is still in-progress;
// once locked in, my-selection becomes immutable and the PATCH 4xx's.

import * as lcu from "../../lcu.js";
import { LCU_CHAMP_SELECT_MY_SELECTION } from "../endpoints.js";
import { FLASH_SPELL_ID } from "../config.js";
import { loggerFor } from "../log.js";

export { FLASH_SPELL_ID };

const log = loggerFor("lcu-spells").log;

/**
 * Arrange `[a, b]` so Flash sits on the user's preferred slot. League's
 * convention: spell1 = D-key, spell2 = F-key.
 *
 *   flashSide="D" → Flash on spell1 (D), other on spell2 (F)
 *   flashSide="F" → Flash on spell2 (F), other on spell1 (D)
 *
 * If neither input is Flash, returns the pair unchanged.
 */
export function arrangeFlash([sa, sb], flashSide = "D") {
  if (!Number.isFinite(sa) || !Number.isFinite(sb)) return null;
  if (sa !== FLASH_SPELL_ID && sb !== FLASH_SPELL_ID) {
    return { spell1Id: sa, spell2Id: sb };
  }
  const other = sa === FLASH_SPELL_ID ? sb : sa;
  return flashSide === "F"
    ? { spell1Id: other, spell2Id: FLASH_SPELL_ID }
    : { spell1Id: FLASH_SPELL_ID, spell2Id: other };
}

/**
 * Apply a pair of summoner spells to the local player's champ-select cell.
 * @param {[number, number]} spells  spell ids in arbitrary order
 * @param {{flashSide?: "D" | "F"}} [opts]
 */
export async function applySummonerSpells(spells, { flashSide = "D" } = {}) {
  if (!Array.isArray(spells) || spells.length < 2) {
    throw new Error(`spells must be [spell1Id, spell2Id], got ${JSON.stringify(spells)}`);
  }
  const arranged = arrangeFlash(spells, flashSide);
  if (!arranged) throw new Error("invalid spell ids");

  await lcu.patch(LCU_CHAMP_SELECT_MY_SELECTION, {
    spell1Id: arranged.spell1Id,
    spell2Id: arranged.spell2Id,
  });
  log("applied spells", arranged);
  return arranged;
}
