// U.GG data layer.
//
// Two surfaces:
//   - Stats overview at https://stats2.u.gg/lol/<sv>/overview/<patch>/<mode>/<id>/<ov>.json
//     Used for: spells (pd[1]), starter items (pd[2]), 3-item core (pd[3]),
//     skill order (pd[4]), perks (pd[0]) as fallback for runes.
//   - GraphQL at https://u.gg/api — used for cross-region summoner ranks.

import { UGG_BASE, UGG_GRAPHQL } from "../endpoints.js";
import {
  UGG_GAME_MODE, UGG_OVERVIEW_VERSION, UGG_SERVER_ID,
  UGG_STATS_VERSION, UGG_TIER_ID, CURRENT_SEASON_ID,
} from "../config.js";
import { isBoot } from "../data/boots.js";
import { loggerFor } from "../log.js";
import { lcuPositionToLane } from "../util/champion.js";
import { currentPatch } from "../util/patch.js";
import { toPlatform } from "../data/regions.js";

const log = loggerFor("ugg").log;

// LCU lane (top/jungle/middle/bottom/support) → u.gg numeric position id.
// 1=jungle, 2=support, 3=adc, 4=top, 5=mid, 6=none.
const POSITION_BY_LANE = Object.freeze({
  top: 4, jungle: 1, middle: 5, bottom: 3, support: 2, "": 6,
});

const safeArr = (x) => Array.isArray(x) ? x : [];

// ---------- Overview (single fetch, multiple data points) ----------

async function fetchOverviewRaw(championId) {
  const patch = await currentPatch();
  const uggVersion = patch.replace(".", "_");
  const url = `${UGG_BASE}/${UGG_STATS_VERSION}/overview/${uggVersion}/${UGG_GAME_MODE}/${championId}/${UGG_OVERVIEW_VERSION}.json`;
  log("overview GET", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`u.gg ${res.status}`);
  return res.json();
}

/**
 * Drill into the overview blob for a specific position. If the requested
 * position has no data, falls back to the most-played position.
 */
function pickPositionData(overviewData, position) {
  const tierData = overviewData?.[UGG_SERVER_ID]?.[UGG_TIER_ID];
  if (!tierData) throw new Error("u.gg: tier bucket missing");

  const reqPos = POSITION_BY_LANE[lcuPositionToLane(position)] ?? 6;
  let pd = tierData[reqPos]?.[0];
  if (!pd) {
    let bestPos = null, maxGames = 0;
    for (let p = 1; p <= 5; p++) {
      const games = tierData[p]?.[0]?.[0]?.[0];
      if (games && games > maxGames) { maxGames = games; bestPos = p; }
    }
    if (!bestPos) throw new Error("u.gg: no position has data");
    pd = tierData[bestPos][0];
  }
  return pd;
}

/**
 * Lightweight overview: spells, starter items, skill priority. Used to
 * enrich the Lolalytics-driven champion bundle (which lacks spells).
 *
 * Returns `{ spells: [s1, s2], starters: [items], skillOrder: "QEW", skillSequence: [...] }`.
 */
export async function fetchOverview({ championId, position }) {
  const data = await fetchOverviewRaw(championId);
  const pd = pickPositionData(data, position);

  const spells   = safeArr(pd[1]?.[2]).map(Number).filter(Number.isFinite);
  const starters = safeArr(pd[2]?.[2]).map(Number).filter(Number.isFinite);
  const skillSeq = safeArr(pd[4]?.[2]);
  const skillPrio = typeof pd[4]?.[3] === "string" ? pd[4][3] : skillSeq.slice(0, 3).join("");

  return { spells, starters, skillOrder: skillPrio, skillSequence: skillSeq };
}

// ---------- Runes (Lolalytics fallback) ----------

/**
 * Recursively probe the overview blob for a perks signature: a pair of
 * 8000-range style ids followed by an array of perk ids. Robust to
 * lolalytics-style nesting changes.
 */
function probePerks(node, depth = 0, max = 7) {
  if (depth > max || node == null) return null;
  if (Array.isArray(node)) {
    for (let i = 0; i + 2 < node.length; i++) {
      const a = node[i], b = node[i + 1], c = node[i + 2];
      if (
        Number.isInteger(a) && a >= 8000 && a < 9000 &&
        Number.isInteger(b) && b >= 8000 && b < 9000 &&
        Array.isArray(c) && c.length >= 4 && c.every((n) => Number.isInteger(n))
      ) {
        return { primaryStyleId: a, subStyleId: b, selectedPerkIds: c };
      }
    }
    for (const child of node) {
      const r = probePerks(child, depth + 1, max);
      if (r) return r;
    }
  } else if (typeof node === "object") {
    for (const k of Object.keys(node)) {
      const r = probePerks(node[k], depth + 1, max);
      if (r) return r;
    }
  }
  return null;
}

/**
 * Single-rune-page fallback when Lolalytics is unavailable. U.GG's overview
 * gives ONE recommended page (their plat+ default).
 */
export async function fetchRunesFallback({ championId, position }) {
  const data = await fetchOverviewRaw(championId);
  const pd = pickPositionData(data, position);

  const perks = pd[0];
  if (!Array.isArray(perks) || perks.length < 5) {
    throw new Error("u.gg: malformed perks");
  }
  const statShards = (pd[8]?.[2] ?? [])
    .map((s) => parseInt(s, 10))
    .filter(Number.isFinite);
  const flat = perks[4].map((p) => Array.isArray(p) ? p[0] : p);

  return {
    source: "ugg",
    pages: [{
      label: "U.GG plat+ recommended",
      wr: perks[0] && perks[1] ? +(perks[1] / perks[0] * 100).toFixed(2) : null,
      n: perks[0],
      primaryStyleId: perks[2],
      subStyleId: perks[3],
      selectedPerkIds: [...flat, ...statShards],
    }],
    summary: { analysed: null },
  };
}

/** Slim build payload from the overview blob — used when Lolalytics is down. */
export async function fetchItemBuildFallback({ championId, position }) {
  const overview = await fetchOverview({ championId, position });
  const data = await fetchOverviewRaw(championId);
  const pd = pickPositionData(data, position);

  const core3 = safeArr(pd[3]?.[2]).map(Number).filter(Number.isFinite);
  const boot = core3.find(isBoot);
  const nonBoot = core3.filter((id) => !isBoot(id));
  const orderedCore = nonBoot.length
    ? [nonBoot[0], ...(boot ? [boot] : []), ...nonBoot.slice(1)]
    : (boot ? [boot] : []);

  return {
    source: "ugg",
    starters: overview.starters,
    boot,
    firstThree: orderedCore.slice(0, 3),
    coreBuild: orderedCore,
    situational: [],
    allBuilds: [],
  };
}

// ---------- GraphQL: summoner ranks ----------

const Q_RANKS = `query R($r:String!,$u:String!,$t:String!,$s:Int!){
  fetchProfileRanks(regionId:$r, riotUserName:$u, riotTagLine:$t, seasonId:$s){
    rankScores{ tier rank lp wins losses queueType role }
  }
}`;

const Q_INFO = `query I($r:String!,$u:String!,$t:String!){
  profilePlayerInfo(regionId:$r, riotUserName:$u, riotTagLine:$t){
    iconId summonerLevel riotUserName riotTagLine
  }
}`;

async function gql(query, variables) {
  const res = await fetch(UGG_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`u.gg gql ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error("u.gg gql: " + json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

function bestSoloRank(rankScores) {
  if (!Array.isArray(rankScores)) return null;
  const solo = rankScores.find((r) => r?.queueType === "ranked_solo_5x5" && r?.tier);
  if (solo) return solo;
  const flex = rankScores.find((r) => r?.queueType === "ranked_flex_sr" && r?.tier);
  if (flex) return flex;
  return rankScores.find((r) => r?.tier) ?? null;
}

const playerCache = new Map();

/**
 * Fetch a player's level + icon + best solo/flex rank.
 * Region defaults to `na1`; pass an LCU region (e.g. "EUW") and we'll map.
 */
export async function fetchPlayerProfile({ region, gameName, tagLine }) {
  if (!gameName) return null;
  const r = toPlatform(region);
  const key = `${r}|${gameName}|${tagLine || ""}`;
  if (playerCache.has(key)) return playerCache.get(key);

  const promise = (async () => {
    try {
      const [info, ranks] = await Promise.all([
        gql(Q_INFO,  { r, u: gameName, t: tagLine || "" }),
        gql(Q_RANKS, { r, u: gameName, t: tagLine || "", s: CURRENT_SEASON_ID }),
      ]);
      const player = info?.profilePlayerInfo ?? null;
      const best   = bestSoloRank(ranks?.fetchProfileRanks?.rankScores);
      return {
        gameName: player?.riotUserName ?? gameName,
        tagLine:  player?.riotTagLine ?? tagLine ?? "",
        level:    player?.summonerLevel ?? null,
        iconId:   player?.iconId ?? null,
        rank:     best ? {
          tier: best.tier, rank: best.rank, lp: best.lp,
          wins: best.wins, losses: best.losses,
          queue: best.queueType,
          winrate: (best.wins + best.losses)
            ? Math.round((best.wins / (best.wins + best.losses)) * 100)
            : null,
        } : null,
      };
    } catch (e) {
      log("profile fetch failed", gameName, e?.message);
      return null;
    }
  })();
  playerCache.set(key, promise);
  return promise;
}

/** Bulk profile fetch — Map<riotId, profile>. */
export async function fetchManyPlayerProfiles(players, { region } = {}) {
  const out = new Map();
  await Promise.all(players.map(async (p) => {
    const profile = await fetchPlayerProfile({
      region,
      gameName: p.gameName ?? p.riotIdGameName,
      tagLine:  p.tagLine  ?? p.riotIdTagLine,
    });
    const id = `${p.gameName ?? p.riotIdGameName}#${p.tagLine ?? p.riotIdTagLine ?? ""}`;
    out.set(id, profile);
  }));
  return out;
}
