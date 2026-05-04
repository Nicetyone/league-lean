// Backwards-compatibility facade. The real code now lives under:
//   - lib/sources/lolalytics.js       (rune/build/tier/counter fetches)
//   - lib/sources/ugg.js              (overview + GraphQL ranks)
//   - lib/lcu/runes.js                (rune-page apply)
//   - lib/lcu/items.js                (item-set apply, clear-all)
//   - lib/lcu/spells.js               (summoner-spell PATCH + arrangeFlash)
//   - lib/champion-bundle.js          (the composer + applyComplete + applyAltBuild)
//   - lib/util/champion.js            (slug, position-to-lane, getChampionMap)
//   - lib/util/patch.js               (currentPatch)
//
// This file just re-exports the same names so older callers keep working.
// New code should import from the specific module that owns the function.

export {
  fetchRunes,
  fetchItemBuild,
  fetchTierList,
  fetchCounters,
} from "./sources/lolalytics.js";

export {
  fetchOverview as fetchUggOverview,
  fetchPlayerProfile as fetchPlayer,
  fetchManyPlayerProfiles as fetchMany,
} from "./sources/ugg.js";

export { applyRunePage } from "./lcu/runes.js";
export { applyItemSet, clearAllItemSets } from "./lcu/items.js";
export { applySummonerSpells, arrangeFlash as arrangeSpells, FLASH_SPELL_ID } from "./lcu/spells.js";

export {
  fetchChampionBundle,
  applyComplete,
  applyAltBuild,
} from "./champion-bundle.js";

export {
  formatChampionSlug,
  lcuPositionToLane as lcuPositionToLolalytics,
  getChampionMap,
} from "./util/champion.js";

export { currentPatch } from "./util/patch.js";

// Convenience deeplinks (used by the Champion tab's "Browse" buttons).
import { lcuPositionToLane } from "./util/champion.js";
import { formatChampionSlug } from "./util/champion.js";

export function deeplinks({ championKey, position }) {
  const lane = lcuPositionToLane(position);
  const slug = formatChampionSlug(championKey || "");
  return {
    lolalytics: `https://lolalytics.com/lol/${slug}/build/${lane ? `?lane=${lane}` : ""}`,
    ugg: `https://u.gg/lol/champions/${slug}/build${lane ? `?role=${lane}` : ""}`,
    metasrc: `https://www.metasrc.com/lol/build/${slug}`,
    mobalytics: `https://mobalytics.gg/lol/champions/${slug}/build${position ? `?role=${position.toLowerCase()}` : ""}`,
    opgg: `https://op.gg/lol/champions/${slug}/build`,
    probuilds: `https://probuilds.net/champions/details/${slug}`,
  };
}
