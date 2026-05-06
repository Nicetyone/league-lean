// Champion-bundle facade: fetches the unified bundle through the provider
// registry (lib/providers/index.js) and applies a complete page (runes +
// spells + items) to the LCU.
//
// Bundle shape (returned by every BuildsProvider):
//   {
//     source: "lolalytics" | "ugg" | "opgg",
//     pages: [{
//       label, wr, n,
//       primaryStyleId, subStyleId, selectedPerkIds,
//       spells: [s1, s2],
//       build: {
//         starters[3], firstThree[3], coreBuild[6], situational[6],
//         boots[1], allBuilds: [{items, picks, wins, wr}]
//       },
//       skillOrder: "QEW", skillSequence: [...]
//     }]
//   }
//
// The user-selected provider is taken from `settings.buildsSource`. On
// failure we silently cascade — see lib/providers/index.js.

import { fetchBuildBundle } from "./providers/index.js";
import { applyRunePage } from "./lcu/runes.js";
import { applySummonerSpells } from "./lcu/spells.js";
import { applyItemSet } from "./lcu/items.js";

/**
 * Fetch the per-champion bundle. Returns the BuildsProvider contract above
 * with the actual serving provider id stamped on `source`.
 */
export async function fetchChampionBundle({ championId, position, tier }) {
  return fetchBuildBundle({ championId, position, tier });
}

// ---------- Apply ----------

/**
 * Apply a complete page (runes + spells + items) in sequence. Each step is
 * gated by a flag so callers can opt-out — e.g. auto-apply may want only
 * runes when the user has spells/items toggled off.
 *
 * Errors per step are collected and rethrown together at the end so a
 * failure mid-sequence doesn't lose the work that succeeded.
 */
export async function applyComplete(page, ctx = {}) {
  const {
    championId, championName, position,
    flashSide = "D",
    alsoSpells = true, alsoItems = true,
  } = ctx;
  const errors = [];

  try { await applyRunePage(page, { label: page.label }); }
  catch (e) { errors.push(`runes: ${e?.message ?? e}`); }

  if (alsoSpells && Array.isArray(page.spells) && page.spells.length >= 2) {
    try { await applySummonerSpells(page.spells, { flashSide }); }
    catch (e) { errors.push(`spells: ${e?.message ?? e}`); }
  }

  if (alsoItems && page.build && championId) {
    const buildToApply = {
      starters:    page.build.starters    || [],
      coreBuild:   page.build.coreBuild   || [],
      situational: page.build.situational || [],
    };
    if (buildToApply.coreBuild.length >= 3) {
      try { await applyItemSet(buildToApply, { championId, championName, position }); }
      catch (e) { errors.push(`items: ${e?.message ?? e}`); }
    }
  }

  if (errors.length) throw new Error(errors.join(" | "));
}

/**
 * Apply a specific alternate 5-item build path (from "Browse all builds").
 * Reuses starters + situational + boots from the base bundle; only the core
 * sequence changes.
 */
export async function applyAltBuild(altItems, baseBuild, ctx = {}) {
  if (!Array.isArray(altItems) || altItems.length < 3) {
    throw new Error("alt build needs at least 3 items");
  }
  const boot = baseBuild?.boots?.[0];
  // Insert the boot in slot 2 — same convention as fetchItemBuild.
  const ordered = [altItems[0], ...(boot ? [boot] : []), ...altItems.slice(1)];
  return applyItemSet(
    {
      starters:    baseBuild?.starters    || [],
      coreBuild:   ordered,
      situational: baseBuild?.situational || [],
    },
    ctx,
  );
}
