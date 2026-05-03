// Meta data fetcher — all endpoints validated by hitting them live before
// shipping. Three families:
//
//   - Lolalytics rune endpoint   ep=rune    (returns BOTH pick + win pages)
//   - Lolalytics counter endpoint ep=counter (71+ matchups, vsWr per champ)
//   - Lolalytics tierlist        ep=tier    (full champ list per lane)
//   - U.GG fallback              for runes only
//
// All shapes verified with curl + python3 against patch 16.9, queue=ranked,
// region=all, tier=platinum_plus.

import * as lcu from "../lcu.js";

const log = (...a) => console.log("[league-lean][meta]", ...a);

const LOLALYTICS_BASE = "https://a1.lolalytics.com/mega/";
const UGG = {
  baseUrl: "https://stats2.u.gg/lol",
  statsVersion: "1.5",
  overviewVersion: "1.5.0",
  server: 12, tier: 10,
  gameMode: "ranked_solo_5x5",
  positionMapping: {
    top: 4, jungle: 1, middle: 5, bottom: 3,
    support: 2, utility: 2, "": 6,
  },
};

// Authoritative perk → tree map, generated from CDragon's iconPath data.
// Keep this as the single source of truth for which tree a perk belongs to —
// integer division (Math.floor(id/100)*100) is unreliable because Riot ships
// keystones outside their tree's id range (e.g. Deathfire Touch 8992 lives in
// the Sorcery tree 8200, not the non-existent 8900).
import { PERK_TREE } from "./perk-data.js";

function runeTreeOf(runeId) {
  const explicit = PERK_TREE[runeId];
  if (explicit) return explicit;
  // Fallback: integer-division guess. Logged below where used so we can spot
  // perks that need to be added to the bundled map.
  return Math.floor(runeId / 100) * 100;
}

export function lcuPositionToLolalytics(p) {
  const lower = String(p || "").toLowerCase();
  return lower === "utility" ? "support" : lower;
}

export function formatChampionSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/['\s]/g, "")
    .replace(/\./g, "")
    .replace(/&/g, "and");
}

let cachedPatch = null;
export async function currentPatch() {
  if (cachedPatch) return cachedPatch;
  try {
    const versions = await fetch(
      "https://ddragon.leagueoflegends.com/api/versions.json"
    ).then((r) => r.json());
    const [maj, min] = versions[0].split(".");
    cachedPatch = `${maj}.${min}`;
  } catch {
    cachedPatch = "";
  }
  return cachedPatch;
}

let cachedChampMap = null;
export async function getChampionMap() {
  if (cachedChampMap) return cachedChampMap;
  try {
    const list = await lcu.get("/lol-game-data/assets/v1/champion-summary.json");
    const m = new Map();
    for (const c of list) {
      if (c.id < 0) continue; // -1 entry (None)
      m.set(c.id, c);
    }
    cachedChampMap = m;
  } catch {
    cachedChampMap = new Map();
  }
  return cachedChampMap;
}

// ---------- Lolalytics: runes (returns BOTH pick + win pages) ----------

function resolveTree(runes, fallbackIdx) {
  // Walk the perk list and return the first tree we can identify. This is more
  // robust than just `runes[0]` because Lolalytics occasionally ships perks
  // out-of-tree-order or in ways our static map doesn't cover.
  for (const r of runes || []) {
    const t = PERK_TREE[r];
    if (t) return t;
  }
  if (runes?.length) {
    const guess = Math.floor(runes[0] / 100) * 100;
    if (guess >= 8000 && guess <= 8400) return guess;
  }
  return 8000 + ((fallbackIdx ?? 0) * 100);
}

function pageFromSet(set, pageMeta) {
  if (!set) return null;
  const primaryRunes   = (set.pri || []).map(Number).filter(Number.isFinite);
  const secondaryRunes = (set.sec || []).map(Number).filter(Number.isFinite);
  const statShards     = (set.mod || []).map(Number).filter(Number.isFinite);

  const primaryStyleId = resolveTree(primaryRunes,   pageMeta?.pri ?? 0);
  const subStyleId     = resolveTree(secondaryRunes, pageMeta?.sec ?? 1);

  return {
    primaryStyleId,
    subStyleId,
    selectedPerkIds: [...primaryRunes, ...secondaryRunes, ...statShards],
  };
}

export async function fetchLolalyticsRunes({ championId, position, tier }) {
  const champions = await getChampionMap();
  const champion = champions.get(championId);
  if (!champion) throw new Error(`unknown championId ${championId}`);

  const slug = formatChampionSlug(champion.name);
  const patch = await currentPatch();
  const lane = lcuPositionToLolalytics(position);

  const params = new URLSearchParams({
    ep: "rune", v: "1",
    patch, c: slug,
    tier: tier || "platinum_plus",
    queue: "ranked", region: "all",
  });
  if (lane) params.append("lane", lane);

  const url = `${LOLALYTICS_BASE}?${params.toString()}`;
  log("lolalytics rune GET", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lolalytics ${res.status}`);
  const data = await res.json();

  const pick = data?.summary?.runes?.pick;
  const win  = data?.summary?.runes?.win;
  if (!pick?.set) throw new Error("lolalytics: missing summary.runes.pick");

  return {
    source: "lolalytics",
    pages: [
      pick && {
        label: "Most played",
        wr: pick.wr,
        n: pick.n,
        ...pageFromSet(pick.set, pick.page),
      },
      win && win !== pick && {
        label: "Highest winrate",
        wr: win.wr,
        n: win.n,
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

// ---------- U.GG: runes (single page) ----------

export async function fetchUggRunes({ championId, position }) {
  const patch = await currentPatch();
  const uggVersion = patch.replace(".", "_");
  const url = `${UGG.baseUrl}/${UGG.statsVersion}/overview/${uggVersion}/${UGG.gameMode}/${championId}/${UGG.overviewVersion}.json`;
  log("u.gg GET", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`u.gg ${res.status}`);
  const data = await res.json();

  const tierData = data?.[UGG.server]?.[UGG.tier];
  if (!tierData) throw new Error("u.gg: tier bucket missing");

  const reqPos = UGG.positionMapping[lcuPositionToLolalytics(position)] ?? 6;
  let positionData = tierData[reqPos]?.[0];
  if (!positionData) {
    let bestPos = null, maxGames = 0;
    for (let p = 1; p <= 5; p++) {
      const games = tierData[p]?.[0]?.[0]?.[0];
      if (games && games > maxGames) { maxGames = games; bestPos = p; }
    }
    if (!bestPos) throw new Error("u.gg: no position has data");
    positionData = tierData[bestPos][0];
  }

  const perks = positionData[0];
  if (!Array.isArray(perks) || perks.length < 5) {
    throw new Error("u.gg: malformed perks");
  }
  const statShards = (positionData[8]?.[2] ?? [])
    .map((s) => parseInt(s, 10))
    .filter(Number.isFinite);
  const flat = perks[4].map((p) => Array.isArray(p) ? p[0] : p);

  return {
    source: "u.gg",
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

// ---------- Public dispatcher ----------

export async function fetchRunes({ championId, position, tier, source = "lolalytics" }) {
  const order = source === "ugg"
    ? ["ugg", "lolalytics"]
    : ["lolalytics", "ugg"];
  let lastErr = null;
  for (const s of order) {
    const fn = s === "lolalytics" ? fetchLolalyticsRunes : fetchUggRunes;
    try {
      const result = await fn({ championId, position, tier });
      log("runes ok via", s);
      return result;
    } catch (e) {
      log("runes fail", s, e?.message);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("no rune source available");
}

// ---------- Lolalytics: counters / matchups ----------

export async function fetchCounters({ championId, position, tier = "platinum_plus" }) {
  const champions = await getChampionMap();
  const champion = champions.get(championId);
  if (!champion) return null;

  const slug = formatChampionSlug(champion.name);
  const patch = await currentPatch();
  const lane = lcuPositionToLolalytics(position);

  const params = new URLSearchParams({
    ep: "counter", v: "1",
    patch, c: slug,
    tier, queue: "ranked", region: "all",
  });
  if (lane) params.append("lane", lane);

  const url = `${LOLALYTICS_BASE}?${params.toString()}`;
  log("lolalytics counter GET", url);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`lolalytics counter ${res.status}`);
    const data = await res.json();
    const arr = Array.isArray(data?.counters) ? data.counters : [];

    // vsWr is enemy's WR vs us. Filter for sample size.
    const filtered = arr.filter((c) => Number.isFinite(c.vsWr) && (c.n ?? 0) >= 200);
    const byVsWr = [...filtered].sort((a, b) => a.vsWr - b.vsWr);

    return {
      stats: {
        wr: data?.stats?.wr,
        pr: parseFloat(data?.stats?.pr),
        br: data?.stats?.br,
        analysed: data?.stats?.analysed,
      },
      strongAgainst: byVsWr.slice(0, 5),       // we win — lowest enemy WR
      weakAgainst:   byVsWr.slice(-5).reverse(), // they win — highest enemy WR
    };
  } catch (e) {
    log("counter fetch failed", e?.message);
    return null;
  }
}

// ---------- Lolalytics: tier list per lane ----------

export async function fetchTierList({ lane, tier = "platinum_plus" }) {
  const patch = await currentPatch();
  const params = new URLSearchParams({
    ep: "tier", v: "1",
    patch, lane, tier, queue: "ranked", region: "all",
  });
  const url = `${LOLALYTICS_BASE}?${params.toString()}`;
  log("lolalytics tier GET", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`lolalytics tier ${res.status}`);
  const data = await res.json();

  const tierBuckets = data?.tier ?? {};
  const flat = [];
  for (const tierKey of Object.keys(tierBuckets)) {
    const cidMap = tierBuckets[tierKey]?.lane?.[lane]?.cid ?? {};
    for (const cidStr of Object.keys(cidMap)) {
      const c = cidMap[cidStr];
      flat.push({
        championId: parseInt(cidStr, 10),
        rank: c.rank,
        wr: c.wr,
        pr: c.pr,
        br: c.br,
        games: c.games,
        topRank: c.topRank,
        topWr: parseFloat(c.topWr),
        topElo: c.topElo,
        pctLane: c.pctLane,
        defaultLane: c.defaultLane,
        bucketKey: parseInt(tierKey, 10),
      });
    }
  }
  flat.sort((a, b) => a.rank - b.rank);
  // Bucketize into letter tiers based on percentile of rank.
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

// ---------- Lolalytics: item build ----------

export async function fetchItemBuild({ championId, position, tier = "platinum_plus" }) {
  const champions = await getChampionMap();
  const champion = champions.get(championId);
  if (!champion) throw new Error(`unknown championId ${championId}`);

  const slug = formatChampionSlug(champion.name);
  const patch = await currentPatch();
  const lane = lcuPositionToLolalytics(position);

  const params = new URLSearchParams({
    ep: "build-itemset", v: "1",
    patch, c: slug,
    tier, queue: "ranked", region: "all",
  });
  if (lane) params.append("lane", lane);

  const url = `${LOLALYTICS_BASE}?${params.toString()}`;
  log("lolalytics build GET", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lolalytics build ${res.status}`);
  const data = await res.json();

  // Each entry is `[itemId or "id1_id2", picks, wins]`. Already sorted by popularity.
  const sets = data?.itemSets ?? {};
  const firstIds = (entry) => String(entry[0]).split("_").map((s) => parseInt(s, 10)).filter(Number.isFinite);

  const startCandidates = (sets.itemSet1 ?? []).slice(0, 3).map(firstIds).flat();
  const boots = (sets.itemBootSet1 ?? [])[0] ? firstIds(sets.itemBootSet1[0]) : [];
  const coreBuild = (sets.itemSet5 ?? [])[0] ? firstIds(sets.itemSet5[0]) : [];
  const alternates = (sets.itemSet5 ?? []).slice(1, 4).map(firstIds);

  return {
    source: "lolalytics",
    starters: dedup(startCandidates).slice(0, 3),
    boots,
    coreBuild,
    alternates,
  };
}

function dedup(arr) {
  return [...new Set(arr)];
}

// ---------- Apply item set to LCU ----------

const ITEM_SET_TITLE_PREFIX = "league-lean ";

function uuid() {
  // Lightweight UUID v4 for the item set's `uid` field.
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

export async function applyItemSet(build, { championId, championName, position }) {
  if (!Array.isArray(build?.coreBuild) || build.coreBuild.length < 3) {
    throw new Error(`core build looks incomplete (${build?.coreBuild?.length ?? 0} items)`);
  }

  // 1. Need summoner id for the URL.
  let summoner;
  try {
    summoner = await lcu.get("/lol-summoner/v1/current-summoner");
  } catch (e) {
    throw new Error(`couldn't read current summoner: ${e?.message ?? e}`);
  }
  const summonerId = summoner?.summonerId;
  if (!summonerId) throw new Error("no summonerId in current-summoner response");

  // 2. Read existing item-set wrapper, drop our previous league-lean entries.
  let wrapper;
  try {
    wrapper = await lcu.get(`/lol-item-sets/v1/item-sets/${summonerId}/sets`);
  } catch (e) {
    throw new Error(`couldn't read item sets: ${e?.message ?? e}`);
  }
  const itemSets = Array.isArray(wrapper?.itemSets) ? wrapper.itemSets : [];
  const cleaned = itemSets.filter((s) => !(typeof s?.title === "string" && s.title.startsWith(ITEM_SET_TITLE_PREFIX)));

  // 3. Build our blocks. Items use string ids per the schema.
  const idStr = (n) => String(n);
  const positionLabel = position ? ` ${position.toLowerCase()}` : "";
  const blocks = [];
  if (build.starters?.length) {
    blocks.push({
      type: "Starter — most popular openers",
      items: build.starters.map((id) => ({ id: idStr(id), count: 1 })),
    });
  }
  if (build.boots?.length) {
    blocks.push({
      type: "Boots",
      items: build.boots.map((id) => ({ id: idStr(id), count: 1 })),
    });
  }
  if (build.coreBuild?.length) {
    blocks.push({
      type: `Core build (most-played path)`,
      items: build.coreBuild.map((id) => ({ id: idStr(id), count: 1 })),
    });
  }
  if (Array.isArray(build.alternates) && build.alternates.length) {
    blocks.push({
      type: "Alternate full builds",
      items: build.alternates.flat().map((id) => ({ id: idStr(id), count: 1 })),
    });
  }

  const newSet = {
    uid: uuid(),
    title: `${ITEM_SET_TITLE_PREFIX}${championName || `champ ${championId}`}${positionLabel}`,
    type: "custom",
    mode: "any",
    map: "any",
    associatedChampions: [championId],
    associatedMaps: [11, 12], // SR + HA
    blocks,
    preferredItemSlots: [],
    sortrank: 0,
    startedFrom: "blank",
  };

  const body = {
    accountId: wrapper?.accountId ?? 0,
    itemSets: [...cleaned, newSet],
    timestamp: Date.now(),
  };

  try {
    await lcu.put(`/lol-item-sets/v1/item-sets/${summonerId}/sets`, body);
  } catch (e) {
    throw new Error(`PUT item-sets failed: ${e?.message ?? e}`);
  }
  log("applied item set", newSet.title, "blocks:", blocks.length);
  return newSet;
}

// ---------- Apply rune page to LCU ----------

const PAGE_NAME_PREFIX = "league-lean ";

export async function applyRunePage(page, { label } = {}) {
  // Validate input — incomplete pages get rejected by LCU with cryptic 400s.
  if (!page?.primaryStyleId || !page?.subStyleId) {
    throw new Error("rune page is missing primary/sub style");
  }
  if (!Array.isArray(page.selectedPerkIds) || page.selectedPerkIds.length < 6) {
    throw new Error(`rune page has only ${page.selectedPerkIds?.length ?? 0} perks (need at least 6)`);
  }

  // Coerce all ids to integers — LCU rejects strings or floats here.
  const intIds = page.selectedPerkIds.map(Number).filter(Number.isFinite);

  // Sanity-check that each primary-tree perk actually lives in primaryStyleId,
  // and similarly for sub. If a perk maps to the wrong tree, log it loudly so
  // future "rune apply silently failed" reports are easy to diagnose.
  // We only have to look at the first four (primary slot) and next two (sub).
  const primary = intIds.slice(0, 4);
  const sub     = intIds.slice(4, 6);
  for (const p of primary) {
    const t = PERK_TREE[p];
    if (t && t !== page.primaryStyleId) {
      log(`WARN perk ${p} belongs to tree ${t}, but primaryStyleId=${page.primaryStyleId}`);
    }
  }
  for (const p of sub) {
    const t = PERK_TREE[p];
    if (t && t !== page.subStyleId) {
      log(`WARN perk ${p} belongs to tree ${t}, but subStyleId=${page.subStyleId}`);
    }
  }
  page = { ...page, selectedPerkIds: intIds };

  // 1. List existing pages.
  let pages;
  try {
    pages = await lcu.get("/lol-perks/v1/pages");
    if (!Array.isArray(pages)) pages = [];
  } catch (e) {
    throw new Error(`couldn't list rune pages: ${e?.message ?? e}`);
  }

  // 2. Remove any pages we previously created (only ours — never touch user's).
  for (const p of pages) {
    if (typeof p?.name === "string" && p.name.startsWith(PAGE_NAME_PREFIX) && p.id != null) {
      try { await lcu.del(`/lol-perks/v1/pages/${p.id}`); }
      catch (e) { log("delete league-lean page failed", p.id, e?.message); }
    }
  }

  // 3. After cleanup, see if we have headroom to create a new page. If not,
  //    delete the user's *current* page (matches Yimikami RunePlugin's
  //    behavior — destructive but unavoidable when at the cap).
  let refreshed;
  try {
    refreshed = await lcu.get("/lol-perks/v1/pages");
  } catch (e) {
    throw new Error(`couldn't refresh page list: ${e?.message ?? e}`);
  }

  let inventory = null;
  try { inventory = await lcu.get("/lol-perks/v1/inventory"); } catch {}
  const max = inventory?.ownedPageCount ?? 2;

  if (refreshed.length >= max) {
    log(`at page cap (${refreshed.length}/${max}); freeing the current page`);
    try {
      const current = await lcu.get("/lol-perks/v1/currentpage");
      const victim = current?.id ?? refreshed[0]?.id;
      if (victim != null) await lcu.del(`/lol-perks/v1/pages/${victim}`);
    } catch (e) {
      throw new Error(`page cap reached and cleanup failed: ${e?.message ?? e}`);
    }
  }

  // 4. Create the new page, marked current so it's selected immediately.
  const body = {
    name: `${PAGE_NAME_PREFIX}${label || "auto"}`,
    primaryStyleId: page.primaryStyleId,
    subStyleId: page.subStyleId,
    selectedPerkIds: page.selectedPerkIds,
    current: true,
    order: 0,
  };

  let created;
  try {
    created = await lcu.post("/lol-perks/v1/pages", body);
  } catch (e) {
    // Re-fetch the response body (best-effort) so the user sees Riot's actual
    // complaint rather than just "POST … 400".
    log("create rune page failed; body sent:", JSON.stringify(body));
    throw new Error(`create rune page failed: ${e?.message ?? e}`);
  }
  log("applied rune page id=", created?.id, "name=", body.name,
      "perkCount=", body.selectedPerkIds.length);

  // 5. Belt-and-suspenders: explicitly set as current, in case `current: true`
  //    in the POST body was ignored (some patches do, some don't).
  if (created?.id != null) {
    try {
      await lcu.put("/lol-perks/v1/currentpage", { id: created.id });
    } catch (e) {
      log("set currentpage failed (non-fatal)", e?.message);
    }
  }
  return created;
}

// ---------- Deeplinks ----------

export function deeplinks({ championKey, position }) {
  const lane = lcuPositionToLolalytics(position);
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
