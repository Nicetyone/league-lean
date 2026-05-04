// Lolalytics data layer.
//
// Lolalytics exposes a single mega-endpoint:
//   https://a1.lolalytics.com/mega/?ep=<endpoint>&...
//
// Endpoints we use:
//   ep=rune        — two rune pages (most-played + highest-WR) per
//                    (champion, lane, tier).
//   ep=build-itemset — itemSet1..5 (single, 2-, 3-, 4-, 5-item builds)
//                      and itemBootSet1..3 (boot-related groupings).
//   ep=tier        — full tier-list per lane.
//   ep=counter     — per-champion matchup data.
//
// All paths use the champion's *slug* (e.g. "aatrox", "drmundo"), not its
// numeric id. Slug formatting lives in lib/util/champion.js.

import { LOLALYTICS_BASE } from "../endpoints.js";
import { ALT_BUILDS_MAX, ALT_BUILD_MIN_ITEMS, COUNTER_MIN_GAMES, DEFAULT_TIER, SITUATIONAL_ITEMS_MAX } from "../config.js";
import { isBoot } from "../data/boots.js";
import { loggerFor } from "../log.js";
import { formatChampionSlug, getChampionMap, lcuPositionToLane } from "../util/champion.js";
import { currentPatch } from "../util/patch.js";
import { resolveTreeFromPerks } from "../runes/tree-resolver.js";

const log = loggerFor("lolalytics").log;

// Common parameter helper — every endpoint needs the same base set.
async function commonParams({ slug, position, tier, ep, queue = "ranked", region = "all" }) {
  const params = new URLSearchParams({
    ep, v: "1",
    patch: await currentPatch(),
    c: slug,
    tier: tier || DEFAULT_TIER,
    queue, region,
  });
  const lane = lcuPositionToLane(position);
  if (lane) params.append("lane", lane);
  return params;
}

async function getJson(params, label) {
  const url = `${LOLALYTICS_BASE}?${params.toString()}`;
  log(`${label} GET`, url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lolalytics ${label} ${res.status}`);
  return res.json();
}

async function championSlug(championId) {
  const champions = await getChampionMap();
  const champion = champions.get(championId);
  if (!champion) throw new Error(`unknown championId ${championId}`);
  return formatChampionSlug(champion.name);
}

// ---------- Runes ----------

/**
 * Build a normalized rune-page object from lolalytics' `set` + `page` shape.
 * `set` is the perk list itself (pri[]/sec[]/mod[]); `page` is the
 * style-letter index pair (0-4).
 */
function pageFromSet(set, pageMeta) {
  if (!set) return null;
  const pri  = (set.pri || []).map(Number).filter(Number.isFinite);
  const sec  = (set.sec || []).map(Number).filter(Number.isFinite);
  const mods = (set.mod || []).map(Number).filter(Number.isFinite);
  return {
    primaryStyleId: resolveTreeFromPerks(pri, pageMeta?.pri ?? 0),
    subStyleId:     resolveTreeFromPerks(sec, pageMeta?.sec ?? 1),
    selectedPerkIds: [...pri, ...sec, ...mods],
  };
}

/**
 * Fetch the two rune-page variants for a champion+lane+tier.
 * Returns: { source, pages: [{label, wr, n, primaryStyleId, subStyleId, selectedPerkIds}] }
 *
 * The endpoint also embeds champion-strength stats; we expose them as
 * `summary` on the result so callers can avoid a second fetch.
 */
export async function fetchRunes({ championId, position, tier }) {
  const slug = await championSlug(championId);
  const params = await commonParams({ slug, position, tier, ep: "rune" });
  const data = await getJson(params, "rune");

  const pick = data?.summary?.runes?.pick;
  const win  = data?.summary?.runes?.win;
  if (!pick?.set) throw new Error("lolalytics: missing summary.runes.pick");

  return {
    source: "lolalytics",
    pages: [
      pick && {
        label: "Most played",
        wr: pick.wr, n: pick.n,
        ...pageFromSet(pick.set, pick.page),
      },
      win && win !== pick && {
        label: "Highest winrate",
        wr: win.wr, n: win.n,
        ...pageFromSet(win.set, win.page),
      },
    ].filter(Boolean),
    summary: {
      analysed: data?.analysed,
      avgWr: data?.avgWinRate,
      defaultLane: data?.header?.defaultLane,
      lane: data?.header?.lane,
      laneDist: data?.nav?.lanes,
    },
  };
}

// ---------- Item build ----------

/** Each itemSet entry is `["id" | "id1_id2_...", picks, wins]`. */
const itemIds = (entry) => String(entry[0]).split("_").map((s) => parseInt(s, 10)).filter(Number.isFinite);
const dedup = (arr) => [...new Set(arr)];

/**
 * Fetch the full build payload: starters, boots, ordered 5-item core,
 * situational swap-ins, and up to ALT_BUILDS_MAX alternate full paths
 * (for the "Browse all builds" UI).
 *
 * Returns:
 *   {
 *     source, starters[3], boot, firstThree[3], coreBuild[6], situational[6],
 *     allBuilds: [{items[5], picks, wins, wr}, ...]
 *   }
 *
 * Boots are inserted at slot 2 of coreBuild (after the first legendary), which
 * matches the statistical mode for League build pacing.
 */
export async function fetchItemBuild({ championId, position, tier }) {
  const slug = await championSlug(championId);
  const params = await commonParams({ slug, position, tier, ep: "build-itemset" });
  const data = await getJson(params, "build");
  const sets = data?.itemSets ?? {};

  const startCandidates = (sets.itemSet1 ?? []).slice(0, 5).map(itemIds).flat();

  // itemBootSet1 contains items most-played alongside boots — not just boots.
  // Filter against BOOT_IDS so things like Yommu's don't slip into the boots block.
  const bootCandidates = (sets.itemBootSet1 ?? []).slice(0, 8).map(itemIds).flat();
  const boot = dedup(bootCandidates).filter(isBoot)[0];

  // itemSet5[0] is the most-played 5-item end-game build, in build order.
  // Doesn't include boots.
  const top5 = (sets.itemSet5 ?? [])[0] ? itemIds(sets.itemSet5[0]) : [];
  const orderedCore = top5.length
    ? [top5[0], ...(boot ? [boot] : []), ...top5.slice(1)]
    : (boot ? [boot] : []);
  const firstThree = orderedCore.slice(0, 3);

  // Situational swap-ins — items appearing in alt 5-item builds but not the
  // core path. Weighted by sample size.
  const altFreq = new Map();
  (sets.itemSet5 ?? []).slice(1, 8).forEach((entry) => {
    const ids = itemIds(entry);
    const weight = entry?.[1] ?? 1;
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

  // All 5-item alt paths with stats — for "Browse all builds".
  const allBuilds = (sets.itemSet5 ?? []).slice(0, ALT_BUILDS_MAX).map((entry) => {
    const items = itemIds(entry);
    const picks = Number(entry?.[1]) || 0;
    const wins  = Number(entry?.[2]) || 0;
    return { items, picks, wins, wr: picks > 0 ? (wins / picks) * 100 : 0 };
  }).filter((b) => b.items.length >= ALT_BUILD_MIN_ITEMS);

  return {
    source: "lolalytics",
    starters: dedup(startCandidates).slice(0, 3),
    boot,
    firstThree,
    coreBuild: orderedCore,
    situational,
    allBuilds,
  };
}

// ---------- Tier list ----------

/**
 * Fetch the per-lane tier list. Returns `{ avgWr, analysed, champions: [...] }`
 * where each champion has a percentile-bucketed letter `tier` (S+ .. D).
 */
export async function fetchTierList({ lane, tier }) {
  const patch = await currentPatch();
  const params = new URLSearchParams({
    ep: "tier", v: "1",
    patch, lane, tier: tier || DEFAULT_TIER,
    queue: "ranked", region: "all",
  });
  const data = await getJson(params, "tier");

  const tierBuckets = data?.tier ?? {};
  const flat = [];
  for (const tierKey of Object.keys(tierBuckets)) {
    const cidMap = tierBuckets[tierKey]?.lane?.[lane]?.cid ?? {};
    for (const cidStr of Object.keys(cidMap)) {
      const c = cidMap[cidStr];
      flat.push({
        championId: parseInt(cidStr, 10),
        rank: c.rank, wr: c.wr, pr: c.pr, br: c.br, games: c.games,
        topRank: c.topRank, topWr: parseFloat(c.topWr), topElo: c.topElo,
        pctLane: c.pctLane, defaultLane: c.defaultLane,
        bucketKey: parseInt(tierKey, 10),
      });
    }
  }
  flat.sort((a, b) => a.rank - b.rank);
  const total = flat.length || 1;
  for (const c of flat) {
    const pct = c.rank / total;
    c.tier = pct <= 0.05 ? "S+"
           : pct <= 0.15 ? "S"
           : pct <= 0.30 ? "A+"
           : pct <= 0.50 ? "A"
           : pct <= 0.70 ? "B"
           : pct <= 0.85 ? "C"
           : "D";
  }
  return {
    avgWr: data?.avgWr,
    analysed: data?.analysed,
    champions: flat,
  };
}

// ---------- Counters ----------

/**
 * Fetch matchup data for a champion+lane. Returns `{ stats, strongAgainst, weakAgainst }`
 * where strong/weak are arrays of `{cid, vsWr, n}` filtered to ≥COUNTER_MIN_GAMES.
 */
export async function fetchCounters({ championId, position, tier }) {
  const slug = await championSlug(championId);
  const params = await commonParams({ slug, position, tier, ep: "counter" });
  let data;
  try { data = await getJson(params, "counter"); }
  catch (e) { log("counter fetch failed", e?.message); return null; }

  const arr = Array.isArray(data?.counters) ? data.counters : [];
  const filtered = arr.filter((c) => Number.isFinite(c.vsWr) && (c.n ?? 0) >= COUNTER_MIN_GAMES);
  const byVsWr = [...filtered].sort((a, b) => a.vsWr - b.vsWr);

  return {
    stats: {
      wr: data?.stats?.wr,
      pr: parseFloat(data?.stats?.pr),
      br: data?.stats?.br,
      analysed: data?.stats?.analysed,
    },
    strongAgainst: byVsWr.slice(0, 5),
    weakAgainst:   byVsWr.slice(-5).reverse(),
  };
}
