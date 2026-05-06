// OP.GG builds provider.
//
// Single-fetch provider — op.gg's per-champion endpoint returns runes,
// items, spells, skill order, and counters in one payload. No companion
// fetch needed (unlike lolalytics, which piggybacks u.gg for spells).

import * as opgg from "../../sources/opgg.js";
import { isBoot } from "../../data/boots.js";
import { ALT_BUILDS_MAX, ALT_BUILD_MIN_ITEMS, SITUATIONAL_ITEMS_MAX } from "../../config.js";

export const id = "opgg";
export const label = "OP.GG";

/**
 * BuildsProvider.fetchBundle — see lib/providers/index.js for the contract.
 */
export async function fetchBundle({ championId, position }) {
  const raw = await opgg.fetchChampion({ championId, position });

  const spells = (raw.summonerSpells?.[0]?.ids || []).slice(0, 2);

  // Boots: first boot id from the most-played boots entry.
  const bootIds = (raw.boots?.[0]?.ids || []).filter(isBoot);
  const boot = bootIds[0];

  // Core build: most-played core_items entry, with boot inserted at slot 2
  // (matches the convention used in lolalytics + ugg adapters).
  const topCore = (raw.coreItems?.[0]?.ids || []).filter((id) => !isBoot(id));
  const orderedCore = topCore.length
    ? [topCore[0], ...(boot ? [boot] : []), ...topCore.slice(1)]
    : (boot ? [boot] : []);

  // Situational: items appearing in alternate core_items entries but not in
  // the main core, weighted by play count.
  const altFreq = new Map();
  (raw.coreItems || []).slice(1, 8).forEach((entry) => {
    const ids = entry.ids || [];
    const weight = entry.play || 1;
    for (const id of ids) {
      if (isBoot(id)) continue;
      altFreq.set(id, (altFreq.get(id) || 0) + weight);
    }
  });
  const coreSet = new Set(orderedCore);
  const situational = [...altFreq.entries()]
    .filter(([id]) => !coreSet.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, SITUATIONAL_ITEMS_MAX);

  // All-builds list for the "Browse all builds" panel.
  const allBuilds = (raw.coreItems || [])
    .slice(0, ALT_BUILDS_MAX)
    .map((entry) => {
      const items = entry.ids || [];
      const picks = Number(entry.play) || 0;
      const wins  = Number(entry.win)  || 0;
      return { items, picks, wins, wr: picks > 0 ? (wins / picks) * 100 : 0 };
    })
    .filter((b) => b.items.length >= ALT_BUILD_MIN_ITEMS);

  const composedBuild = {
    starters:   (raw.starterItems?.[0]?.ids || []).slice(0, 3),
    firstThree: orderedCore.slice(0, 3),
    coreBuild:  orderedCore,
    situational,
    boots:      boot ? [boot] : [],
    allBuilds,
  };

  // Sort pages: highest play first (= "Most played"), then highest WR.
  const pagesByPlay = [...raw.runePages].sort((a, b) => (b.play || 0) - (a.play || 0));
  const pagesByWr = [...raw.runePages].sort((a, b) => {
    const wrA = a.play > 0 ? a.win / a.play : 0;
    const wrB = b.play > 0 ? b.win / b.play : 0;
    return wrB - wrA;
  });
  const mostPlayed = pagesByPlay[0];
  const highestWr  = pagesByWr.find((p) => p !== mostPlayed) || null;

  const buildPage = (raw, label) => {
    const wr = raw.play > 0 ? (raw.win / raw.play) * 100 : null;
    return {
      label,
      wr,
      n: raw.play,
      primaryStyleId:  raw.primaryStyleId,
      subStyleId:      raw.subStyleId,
      selectedPerkIds: raw.selectedPerkIds,
      spells,
      build: composedBuild,
      skillOrder:    (raw.skillOrder || []).join(""),
      skillSequence: raw.skillSequence || [],
    };
  };

  const pages = [
    mostPlayed && buildPage(mostPlayed, "Most played"),
    highestWr  && buildPage(highestWr,  "Highest winrate"),
  ].filter(Boolean);

  // Inherit skill data from the bundle level since op.gg returns skills
  // independent of the rune page chosen.
  for (const p of pages) {
    p.skillOrder    = (raw.skillOrder || []).join("");
    p.skillSequence = raw.skillSequence || [];
  }

  return { source: id, pages };
}
