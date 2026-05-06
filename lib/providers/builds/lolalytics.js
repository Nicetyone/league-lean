// Lolalytics builds provider.
//
// Two-source provider — lolalytics for runes + items, u.gg for spells +
// skill order (lolalytics doesn't expose those). The u.gg dependency is
// soft: if u.gg is unreachable we still return runes/items with empty
// spells. Hard failures on lolalytics throw and the registry cascades to
// the next provider.

import { fetchRunes, fetchItemBuild } from "../../sources/lolalytics.js";
import { fetchOverview } from "../../sources/ugg.js";

export const id = "lolalytics";
export const label = "Lolalytics";

const pageKey = (p) =>
  JSON.stringify([p.primaryStyleId, p.subStyleId, ...p.selectedPerkIds]);

export async function fetchBundle({ championId, position, tier }) {
  // Runes + items are required for this provider — let them throw to cascade.
  const [runes, build, overview] = await Promise.all([
    fetchRunes({ championId, position, tier }),
    fetchItemBuild({ championId, position, tier }).catch(() => null),
    // Spells/skill order are nice-to-have; degrade silently if u.gg is down.
    fetchOverview({ championId, position }).catch(() => null),
  ]);

  const composedBuild = {
    starters:    overview?.starters ?? [],
    firstThree:  Array.isArray(build?.firstThree)  ? build.firstThree  : [],
    coreBuild:   Array.isArray(build?.coreBuild)   ? build.coreBuild   : [],
    situational: Array.isArray(build?.situational) ? build.situational : [],
    boots:       build?.boot ? [build.boot] : [],
    allBuilds:   Array.isArray(build?.allBuilds)   ? build.allBuilds   : [],
  };

  const enrich = (page) => ({
    ...page,
    spells:        overview?.spells ?? [],
    build:         composedBuild,
    skillOrder:    overview?.skillOrder ?? "",
    skillSequence: overview?.skillSequence ?? [],
  });

  let pages = (runes.pages || []).map(enrich);
  // If pick and win pages are identical, collapse them.
  if (pages.length === 2 && pageKey(pages[0]) === pageKey(pages[1])) {
    pages = [{
      ...pages[0],
      label: "Most played · Highest winrate",
      n: Math.max(pages[0].n ?? 0, pages[1].n ?? 0),
    }];
  }

  return { source: id, pages };
}
