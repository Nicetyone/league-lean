// Composer: produces the full per-champion bundle the Champion tab renders.
//
// Three parallel fetches:
//   - Lolalytics runes  (preferred source — two variants, pick + win)
//   - U.GG overview      (spells + starter items + skill order — bits
//                         Lolalytics doesn't expose)
//   - Lolalytics build   (boots + 5-item core + situational + alt builds)
//
// Falls back to U.GG when Lolalytics is unreachable for any of these.
// Spells/items don't differ per rune-page variant in practice, so we attach
// the same spells/build to each rune page after fetching.
//
// Dedupe rule: if `pick` and `win` rune pages are identical, collapse into
// a single card labelled "Most played · Highest winrate".

import { fetchRunes, fetchItemBuild } from "./sources/lolalytics.js";
import { fetchOverview, fetchRunesFallback, fetchItemBuildFallback } from "./sources/ugg.js";
import { applyRunePage } from "./lcu/runes.js";
import { applySummonerSpells } from "./lcu/spells.js";
import { applyItemSet } from "./lcu/items.js";
import { isBoot } from "./data/boots.js";
import { loggerFor } from "./log.js";

const log = loggerFor("bundle").log;

// ---------- Fetch with fallback ----------

async function fetchRunesWithFallback(args) {
  try {
    return await fetchRunes(args);
  } catch (e) {
    log("lolalytics runes failed, falling back to u.gg:", e?.message);
    return fetchRunesFallback(args);
  }
}

async function fetchItemBuildWithFallback(args) {
  try {
    return await fetchItemBuild(args);
  } catch (e) {
    log("lolalytics build failed, falling back to u.gg:", e?.message);
    return fetchItemBuildFallback(args);
  }
}

// ---------- Compose ----------

const pageKey = (p) =>
  JSON.stringify([p.primaryStyleId, p.subStyleId, ...p.selectedPerkIds]);

/**
 * Build the full champion bundle for the Champion tab.
 *
 * Returns:
 *   {
 *     source: "lolalytics" | "ugg",
 *     pages: [{
 *       label, wr, n,
 *       primaryStyleId, subStyleId, selectedPerkIds,
 *       spells: [s1, s2],
 *       build: {
 *         starters[3], firstThree[3], coreBuild[6], situational[6],
 *         boots[1], allBuilds: [{items, picks, wins, wr}]
 *       },
 *       skillOrder: "QEW", skillSequence: [...]
 *     }]
 *   }
 */
export async function fetchChampionBundle({ championId, position, tier, source = "lolalytics" }) {
  const [runesR, uggR, buildR] = await Promise.allSettled([
    fetchRunesWithFallback({ championId, position, tier, source }),
    fetchOverview({ championId, position }),
    fetchItemBuildWithFallback({ championId, position, tier }),
  ]);

  if (runesR.status !== "fulfilled") throw runesR.reason;
  const runes = runesR.value;
  const ugg   = uggR.status === "fulfilled" ? uggR.value : null;
  const build = buildR.status === "fulfilled" ? buildR.value : null;

  const composedBuild = {
    starters:    ugg?.starters ?? [],
    firstThree:  Array.isArray(build?.firstThree) ? build.firstThree : [],
    coreBuild:   Array.isArray(build?.coreBuild) ? build.coreBuild : [],
    situational: Array.isArray(build?.situational) ? build.situational : [],
    boots:       build?.boot ? [build.boot] : [],
    allBuilds:   Array.isArray(build?.allBuilds) ? build.allBuilds : [],
  };

  const enrich = (page) => ({
    ...page,
    spells: ugg?.spells ?? [],
    build: composedBuild,
    skillOrder: ugg?.skillOrder ?? "",
    skillSequence: ugg?.skillSequence ?? [],
  });

  let pages = (runes.pages || []).map(enrich);
  if (pages.length === 2 && pageKey(pages[0]) === pageKey(pages[1])) {
    pages = [{
      ...pages[0],
      label: "Most played · Highest winrate",
      n: Math.max(pages[0].n ?? 0, pages[1].n ?? 0),
    }];
  }

  return { source: runes.source, pages };
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
