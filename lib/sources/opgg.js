// OP.GG data layer.
//
// Two surfaces, both rooted at https://lol-api-champion.op.gg/api/<region>:
//   - /champions/<queue>/<slug>/<position>  per-champion build payload —
//       runes (multi pages), items by category, summoner spells, skill order,
//       counters, summary stats. Single fetch covers everything we need.
//   - /champions/ranked?tier=<tier>          tier list — all champions with
//       per-lane stats and counters embedded.
//
// Endpoint shape was reverse-engineered from public usage. The normalised
// return shapes here match what the adapter at lib/providers/builds/opgg.js
// expects.

import { OPGG_BASE } from "../endpoints.js";
import { loggerFor } from "../log.js";
import { formatChampionSlug, getChampionMap } from "../util/champion.js";

const log = loggerFor("opgg").log;

// LCU positions → op.gg's per-champion URL position segment.
// op.gg uses "mid"/"adc" rather than lolalytics' "middle"/"bottom".
const URL_POSITION_BY_LCU = Object.freeze({
  top: "top", jungle: "jungle", middle: "mid", bottom: "adc",
  utility: "support", support: "support", "": "none",
});

// op.gg's tier-list response labels positions in uppercase; normalise.
const LANE_BY_OPGG_NAME = Object.freeze({
  TOP: "top", JUNGLE: "jungle", MID: "middle", ADC: "bottom", SUPPORT: "support",
});

function urlPosition(lcuPosition) {
  return URL_POSITION_BY_LCU[String(lcuPosition || "").toLowerCase()] ?? "none";
}

async function championSlug(championId) {
  const champions = await getChampionMap();
  const champion = champions.get(championId);
  if (!champion) throw new Error(`unknown championId ${championId}`);
  return formatChampionSlug(champion.name);
}

async function getJson(url, label) {
  log(`${label} GET`, url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`op.gg ${label} ${res.status}`);
  return res.json();
}

// ---------- Per-champion ----------

/**
 * Fetch the per-champion build payload. Returns the raw normalised pieces;
 * the provider adapter shapes them into the unified contract.
 *
 * Returns:
 *   {
 *     runePages:    [{ primaryStyleId, subStyleId, selectedPerkIds, play, win, pick_rate }],
 *     coreItems:    [{ ids, play, win, pick_rate }],
 *     starterItems: [{ ids, play, win, pick_rate }],
 *     boots:        [{ ids, play, win, pick_rate }],
 *     summonerSpells:[{ ids, play, win, pick_rate }],
 *     skillOrder:   [string]   // e.g. ["Q","E","W"]
 *     skillSequence:[string]   // full level-by-level pick sequence
 *     counters:     [{ champion_id, play, win }],
 *     summary:      object,    // win_rate / pick_rate / ban_rate / kda
 *     version:      string,
 *   }
 *
 * `region` is the op.gg region segment (default "global") — not the LCU region.
 * `queue` is "ranked" / "urf" / "aram"; defaults to "ranked".
 */
export async function fetchChampion({ championId, position, region = "global", queue = "ranked" }) {
  const slug = await championSlug(championId);
  const pos  = urlPosition(position);
  const url  = `${OPGG_BASE}/${region}/champions/${queue}/${slug}/${pos}`;
  const json = await getJson(url, "champion");

  const data = json?.data ?? {};
  const meta = json?.meta ?? {};

  const runePages = (data.runes || []).map((r) => ({
    primaryStyleId:  r.primary_page_id,
    subStyleId:      r.secondary_page_id,
    // Stat shards come last to match the convention used elsewhere in the
    // codebase (LCU rune-page apply expects [perks..., shards...]).
    selectedPerkIds: [
      ...(r.primary_rune_ids || []),
      ...(r.secondary_rune_ids || []),
      ...(r.stat_mod_ids || []),
    ],
    play:      r.play,
    win:       r.win,
    pick_rate: r.pick_rate,
  }));

  // skill_masteries[0] tends to be the most-played priority; skills[0].order
  // is the level-by-level sequence (Q/W/E/R for each level).
  const topSkill   = (data.skills || [])[0] ?? null;
  const topMastery = (data.skill_masteries || [])[0] ?? null;
  const skillOrder = Array.isArray(topMastery?.ids)
    ? topMastery.ids
    : (Array.isArray(topSkill?.order) ? topSkill.order.slice(0, 3) : []);
  const skillSequence = Array.isArray(topSkill?.order) ? topSkill.order : [];

  return {
    runePages,
    coreItems:      data.core_items   || [],
    starterItems:   data.starter_items|| [],
    boots:          data.boots        || [],
    summonerSpells: data.summoner_spells || [],
    skillOrder,
    skillSequence,
    counters:       data.counters     || [],
    summary:        data.summary      || {},
    version:        meta.version      || "",
  };
}

// ---------- Tier list ----------

/**
 * Fetch the global ranked tier list, then filter to a specific lane.
 *
 * Returns: { avgWr, analysed, champions: [{championId, wr, pr, br, games, ...}] }
 *
 * op.gg returns one mega-payload of every champion with `positions[]`
 * embedded; we filter that array down to the requested lane on the client.
 */
export async function fetchTierList({ lane, tier, region = "global" }) {
  const params = new URLSearchParams({ tier: tier || "platinum_plus" });
  const url = `${OPGG_BASE}/${region}/champions/ranked?${params.toString()}`;
  const json = await getJson(url, "tier");
  const arr = Array.isArray(json?.data) ? json.data : [];

  const flat = [];
  let totalGames = 0;
  let wrSum = 0;
  let wrCount = 0;

  // op.gg returns rates as fractions (0.53 == 53%). Scale to whole-number
  // percentages so the Meta tab renders them the same as lolalytics' output.
  const pct = (v) => Number.isFinite(Number(v)) ? Number(v) * 100 : 0;

  for (const champ of arr) {
    const pos = (champ.positions || []).find((p) => LANE_BY_OPGG_NAME[p?.name] === lane);
    if (!pos) continue;
    const s = pos.stats || {};
    const wr = pct(s.win_rate);
    if (!Number.isFinite(wr) || wr <= 0) continue;
    const games = Number(s.play) || 0;
    flat.push({
      championId: champ.id,
      wr,
      pr:    pct(s.pick_rate),
      br:    pct(s.ban_rate),
      games,
      pctLane: pct(s.role_rate),
    });
    totalGames += games;
    wrSum   += wr * games;
    wrCount += games;
  }

  // Rank within lane by win-rate desc; assign letter buckets the same way
  // the lolalytics adapter does so the Meta tab renders identically.
  flat.sort((a, b) => b.wr - a.wr);
  const total = flat.length || 1;
  for (let i = 0; i < flat.length; i++) {
    const pct = (i + 1) / total;
    flat[i].rank = i + 1;
    flat[i].tier = pct <= 0.05 ? "S+"
                 : pct <= 0.15 ? "S"
                 : pct <= 0.30 ? "A+"
                 : pct <= 0.50 ? "A"
                 : pct <= 0.70 ? "B"
                 : pct <= 0.85 ? "C"
                 : "D";
  }

  return {
    avgWr:    wrCount > 0 ? wrSum / wrCount : 0,
    analysed: totalGames,
    champions: flat,
  };
}
