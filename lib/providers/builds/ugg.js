// U.GG builds provider.
//
// Single-source provider using u.gg's overview JSON for everything: runes
// (one page only — u.gg's plat+ recommended), items (slim core build),
// spells, and skill order.

import { fetchOverview, fetchRunesFallback, fetchItemBuildFallback } from "../../sources/ugg.js";

export const id = "ugg";
export const label = "U.GG";

export async function fetchBundle({ championId, position }) {
  const [runes, build, overview] = await Promise.all([
    fetchRunesFallback({ championId, position }),
    fetchItemBuildFallback({ championId, position }).catch(() => null),
    fetchOverview({ championId, position }).catch(() => null),
  ]);

  const composedBuild = {
    starters:    overview?.starters ?? build?.starters ?? [],
    firstThree:  Array.isArray(build?.firstThree)  ? build.firstThree  : [],
    coreBuild:   Array.isArray(build?.coreBuild)   ? build.coreBuild   : [],
    situational: Array.isArray(build?.situational) ? build.situational : [],
    boots:       build?.boot ? [build.boot] : [],
    allBuilds:   Array.isArray(build?.allBuilds)   ? build.allBuilds   : [],
  };

  const pages = (runes.pages || []).map((page) => ({
    ...page,
    spells:        overview?.spells ?? [],
    build:         composedBuild,
    skillOrder:    overview?.skillOrder ?? "",
    skillSequence: overview?.skillSequence ?? [],
  }));

  return { source: id, pages };
}
