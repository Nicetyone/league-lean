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

// ---------- U.GG: full overview (perks + spells + items + skill order) ----------
//
// One fetch returns everything we need to build a complete champion card.
// Schema (verified live on patch 16.9):
//   data[regionId][tierId][positionId][0] = positionData[]
//     pd[0] = perks      [wins, games, primaryStyle, subStyle, [perks 6]]
//     pd[1] = spells     [wins, games, [spell1Id, spell2Id]]
//     pd[2] = startItems [wins, games, [item1, item2, ...]]
//     pd[3] = coreBuild  [wins, games, [item1, item2, item3]]   3-item core
//     pd[4] = skillOrder [wins, games, [Q,E,W,Q,...], "QEW" priority]
//     pd[5] = itemTree   nested by build phase (boots / mythic / late)
//     pd[8] = statShards [wins, games, [shard, shard, shard]]

// U.GG overview is used ONLY for the bits Lolalytics doesn't expose:
//   - summoner spells (pd[1])
//   - starter items   (pd[2])    — the literal first-buy items (doran's + pots)
//   - skill priority  (pd[4])    — Q/E/W max-order string + full sequence
// Lolalytics drives boots + 5-item core via fetchItemBuild — its data is
// cleaner (separate itemBootSet/itemSet5 tables, not the noisy aggregations
// in u.gg's pd[5] which mix wards and elixirs into the build).

async function fetchUggOverview({ championId, position }) {
  const patch = await currentPatch();
  const uggVersion = patch.replace(".", "_");
  const url = `${UGG.baseUrl}/${UGG.statsVersion}/overview/${uggVersion}/${UGG.gameMode}/${championId}/${UGG.overviewVersion}.json`;
  log("u.gg overview GET", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`u.gg ${res.status}`);
  const data = await res.json();
  const tierData = data?.[UGG.server]?.[UGG.tier];
  if (!tierData) throw new Error("u.gg: tier bucket missing");

  const reqPos = UGG.positionMapping[lcuPositionToLolalytics(position)] ?? 6;
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

  const safeArr = (x) => Array.isArray(x) ? x : [];
  const spells   = safeArr(pd[1]?.[2]).map(Number).filter(Number.isFinite);
  const starters = safeArr(pd[2]?.[2]).map(Number).filter(Number.isFinite);
  const skillSeq = safeArr(pd[4]?.[2]);
  const skillPrio = typeof pd[4]?.[3] === "string" ? pd[4][3] : skillSeq.slice(0, 3).join("");

  return { spells, starters, skillOrder: skillPrio, skillSequence: skillSeq };
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

// ---------- Combined fetcher: pages + spells + builds, with dedup ----------
//
// Returns:
// {
//   source: "lolalytics" | "ugg",
//   pages: [{
//     label, primaryStyleId, subStyleId, selectedPerkIds, wr, n,
//     spells: [s1, s2],
//     build: { starters, boots, core, mythic, completed, lateGame },
//     skillOrder: "QEW", skillSequence: [...]
//   }]
// }
//
// If the lolalytics 'pick' (most played) and 'win' (highest WR) rune pages are
// identical, we collapse them into a single card with a combined label.

function pageKey(p) {
  return JSON.stringify([p.primaryStyleId, p.subStyleId, ...p.selectedPerkIds]);
}

export async function fetchChampionBundle({ championId, position, tier, source = "lolalytics" }) {
  // Three parallel fetches:
  //   - Lolalytics runes (the user's preferred source)
  //   - U.GG overview     (for summoner spells + starter items + skill order)
  //   - Lolalytics build   (for boots + clean 5-item core path)
  const [runesR, uggR, buildR] = await Promise.allSettled([
    fetchRunes({ championId, position, tier, source }),
    fetchUggOverview({ championId, position }),
    fetchItemBuild({ championId, position, tier }),
  ]);

  if (runesR.status !== "fulfilled") throw runesR.reason;
  const runes = runesR.value;
  const ugg   = uggR.status   === "fulfilled" ? uggR.value   : null;
  const build = buildR.status === "fulfilled" ? buildR.value : null;

  // Compose the per-page build:
  //   starters from u.gg pd[2]     (literal Doran's / health-pot start)
  //   boots    from lolalytics itemBootSet1[0]
  //   core     from lolalytics itemSet5[0] (5-item full build)
  // Lolalytics' itemSet5 typically excludes boots, so we render boots
  // explicitly between starters and core.
  // composedBuild has two shapes mixed in:
  //   - the *display* slice (starters, boots[0], coreBuild) for the linear
  //     icon row inside the champion card.
  //   - the *full* slice (allBoots, alternates) used by applyItemSet to
  //     populate the in-game shop with multiple options per slot.
  // composedBuild's coreBuild is now the FULL ordered sequence with boots
  // embedded (first item → boots → 2nd → 3rd → 4th → 5th), so the visual
  // icon row in the card renders the build as a single continuous path.
  // applyItemSet uses both firstThree (early-game block) and coreBuild
  // (full block) so the in-game shop reflects build order.
  const composedBuild = {
    starters:    ugg?.starters ?? [],
    firstThree:  Array.isArray(build?.firstThree) ? build.firstThree : [],
    coreBuild:   Array.isArray(build?.coreBuild) ? build.coreBuild : [],
    situational: Array.isArray(build?.situational) ? build.situational : [],
    boots:       build?.boot ? [build.boot] : [],
    // Full library of 5-item paths for the in-card "Browse all builds" panel.
    // Each entry: { items, picks, wins, wr }. Caller may apply any of them
    // via applyAltBuild(items, ...).
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

// ---------- Lolalytics: item build (with U.GG fallback) ----------

// Build a slim build-payload from u.gg's overview JSON when lolalytics is
// unreachable. We get starters + a 3-item core (which includes boots in
// lolalytics-equivalent positioning) but no 5-item core or browse-all-builds.
async function fetchItemBuildFromUgg({ championId, position }) {
  const overview = await fetchUggOverview({ championId, position });
  // u.gg pd[3] gives a 3-item core that already includes boots typically.
  // We need to split boots out so the rest of the pipeline (which expects
  // boots separate + N-item non-boot core) still works.
  const patch = await currentPatch();
  const uggVersion = patch.replace(".", "_");
  const url = `${UGG.baseUrl}/${UGG.statsVersion}/overview/${uggVersion}/${UGG.gameMode}/${championId}/${UGG.overviewVersion}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`u.gg overview fallback ${res.status}`);
  const data = await res.json();
  const tierData = data?.[UGG.server]?.[UGG.tier];
  const reqPos = UGG.positionMapping[lcuPositionToLolalytics(position)] ?? 6;
  let pd = tierData?.[reqPos]?.[0];
  if (!pd) {
    let bestPos = null, maxGames = 0;
    for (let p = 1; p <= 5; p++) {
      const games = tierData?.[p]?.[0]?.[0]?.[0];
      if (games && games > maxGames) { maxGames = games; bestPos = p; }
    }
    pd = tierData?.[bestPos]?.[0];
  }
  if (!pd) throw new Error("u.gg fallback: no position data");

  const safeArr = (x) => Array.isArray(x) ? x : [];
  const core3   = safeArr(pd[3]?.[2]).map(Number).filter(Number.isFinite);
  const boot    = core3.find((id) => BOOT_IDS.has(id));
  const nonBoot = core3.filter((id) => !BOOT_IDS.has(id));
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
    allBuilds: [], // u.gg doesn't expose alt full builds
  };
}

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
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    log("lolalytics fetch threw, falling back to u.gg:", e?.message);
    return fetchItemBuildFromUgg({ championId, position });
  }
  if (!res.ok) {
    log(`lolalytics build ${res.status}, falling back to u.gg`);
    return fetchItemBuildFromUgg({ championId, position });
  }
  const data = await res.json();

  // Each entry is `[itemId or "id1_id2", picks, wins]`. Already sorted by popularity.
  const sets = data?.itemSets ?? {};
  const firstIds = (entry) => String(entry[0]).split("_").map((s) => parseInt(s, 10)).filter(Number.isFinite);

  const startCandidates = (sets.itemSet1 ?? []).slice(0, 5).map(firstIds).flat();

  // itemBootSet1 contains items most-played alongside boots — not just boots.
  // Filter against the real boot list so things like Yommu's or Shojin don't
  // slip into the boots block.
  const bootCandidates = (sets.itemBootSet1 ?? []).slice(0, 8).map(firstIds).flat();
  const bootsArr = dedup(bootCandidates).filter((id) => BOOT_IDS.has(id)).slice(0, 1);
  const boot = bootsArr[0];

  // itemSet5[0] is the most-played full 5-item end-game build, in build order
  // (lolalytics preserves the order players actually completed items in).
  // Doesn't include boots — those are tracked separately.
  const items5 = (sets.itemSet5 ?? [])[0] ? firstIds(sets.itemSet5[0]) : [];

  // Synthesise a single ordered sequence with boots inserted in their typical
  // slot (after the first completed legendary, around the 8-10min mark — the
  // statistical mode for League pacing). Result: [first, BOOTS, 2nd, 3rd, 4th, 5th].
  const orderedCore = items5.length
    ? [items5[0], ...(boot ? [boot] : []), ...items5.slice(1)]
    : (boot ? [boot] : []);

  // First 3 items of that sequence — handy for the early-game shopping block.
  const firstThree = orderedCore.slice(0, 3);

  // Situational / swap-in items — single items that appear frequently in
  // alternate 5-item builds but aren't in the core path. Weighted by sample
  // size across alts; boots and core items excluded.
  const altFreq = new Map();
  (sets.itemSet5 ?? []).slice(1, 8).forEach((entry) => {
    const ids = firstIds(entry);
    const weight = entry?.[1] ?? 1;
    for (const id of ids) {
      if (BOOT_IDS.has(id)) continue;
      altFreq.set(id, (altFreq.get(id) || 0) + weight);
    }
  });
  const coreSet = new Set(orderedCore);
  const situational = [...altFreq.entries()]
    .filter(([id]) => !coreSet.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, 6);

  // All 5-item builds with stats — for the "Browse all builds" UI. Each
  // entry: { items: [5 itemIds], picks, wins, wr }. Sorted by lolalytics'
  // own ordering (most-played first). Cap at 25 paths so the dropdown
  // doesn't get stupid long.
  const allBuilds = (sets.itemSet5 ?? []).slice(0, 25).map((entry) => {
    const items = firstIds(entry);
    const picks = Number(entry?.[1]) || 0;
    const wins  = Number(entry?.[2]) || 0;
    return {
      items,
      picks,
      wins,
      wr: picks > 0 ? (wins / picks) * 100 : 0,
    };
  }).filter((b) => b.items.length >= 3);

  return {
    source: "lolalytics",
    starters: dedup(startCandidates).slice(0, 3),
    boot,                       // single item id (or undefined)
    firstThree,                 // [first, boot, 2nd]
    coreBuild: orderedCore,     // [first, boot, 2nd, 3rd, 4th, 5th]
    situational,
    allBuilds,
  };
}

// Boot item IDs (current ranked SR pool, including S15 upgraded boots).
// Verified against CDragon items.json by filtering items with a "Boots"
// category or that build from the basic Boots (1001).
const BOOT_IDS = new Set([
  3005, 3006, 3008, 3009, 3010, 3013, 3020, 3047, 3111, 3117,
  3158, 3168, 3170, 3171, 3173, 3174, 3175, 3176,
]);

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

  // 3. Build the blocks. Item IDs MUST be strings per the LCU schema.
  // Block titles kept ASCII-only — Riot's in-game shop parser has historically
  // dropped blocks whose `type` string contains em-dashes / smart quotes.
  const idStr = (n) => String(n);
  // Health pots typically come 2x in the starter block.
  const itemEntry = (id) => ({
    id: idStr(id),
    count: id === 2003 ? 2 : 1,   // 2003 = Health Potion
  });
  const positionLabel = position ? ` ${position.toLowerCase()}` : "";
  const blocks = [];

  // Render one block per step in the build path, so the in-game shop reads
  // top-to-bottom as the user's actual buying sequence.
  if (build.starters?.length) {
    blocks.push({
      type: "1. Starting items",
      items: build.starters.map(itemEntry),
    });
  }

  // build.coreBuild is the ordered sequence: [1st, boots, 2nd, 3rd, 4th, 5th].
  // Split into one block per step. Items in-engine show in horizontal rows
  // with the block title above — giving "Step 2: First item / Step 3: Boots
  // / Step 4: Second item" reading order.
  const ordered = build.coreBuild || [];
  let stepN = 1;          // user-facing step counter (1. Starting was step 1)
  let nonBootIdx = 0;     // count of non-boot legendaries seen so far
  for (const id of ordered) {
    stepN += 1;
    let label;
    if (BOOT_IDS.has(id)) {
      label = `${stepN}. Boots`;
    } else {
      nonBootIdx += 1;
      const ord = ["First", "Second", "Third", "Fourth", "Fifth"][nonBootIdx - 1] ?? `Item ${nonBootIdx}`;
      label = `${stepN}. ${ord} item`;
    }
    blocks.push({ type: label, items: [itemEntry(id)] });
  }

  if (build.situational?.length) {
    blocks.push({
      type: "Situational / swap items",
      items: build.situational.map(itemEntry),
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

// ---------- Apply summoner spells to current champ-select cell ----------
//
// LCU `PATCH /lol-champ-select/v1/session/my-selection` with `{spell1Id, spell2Id}`.
// flashSide controls which slot Flash binds to. League's convention: spell1 is
// "D" key by default, spell2 is "F". So flashSide="D" puts Flash on spell1.

export const FLASH_SPELL_ID = 4;

export function arrangeSpells([sa, sb], flashSide) {
  if (!Number.isFinite(sa) || !Number.isFinite(sb)) return null;
  const hasFlash = sa === FLASH_SPELL_ID || sb === FLASH_SPELL_ID;
  if (!hasFlash) return { spell1Id: sa, spell2Id: sb };
  const other = sa === FLASH_SPELL_ID ? sb : sa;
  return flashSide === "F"
    ? { spell1Id: other, spell2Id: FLASH_SPELL_ID }
    : { spell1Id: FLASH_SPELL_ID, spell2Id: other };
}

export async function applySummonerSpells(spells, { flashSide = "D" } = {}) {
  if (!Array.isArray(spells) || spells.length < 2) {
    throw new Error(`spells must be [spell1Id, spell2Id], got ${JSON.stringify(spells)}`);
  }
  const arranged = arrangeSpells(spells, flashSide);
  if (!arranged) throw new Error("invalid spell ids");
  // Verified via the LCU swagger: this endpoint is PATCH (not PUT or POST).
  // Body shape: { spell1Id: int64, spell2Id: int64 }.
  // Endpoint only responds during champ-select; throws if you've already
  // locked in (Riot makes my-selection immutable post-lock).
  await lcu.patch("/lol-champ-select/v1/session/my-selection", {
    spell1Id: arranged.spell1Id,
    spell2Id: arranged.spell2Id,
  });
  log("applied spells", arranged);
  return arranged;
}

// ---------- One-shot: runes + spells + items ----------

export async function applyComplete(page, ctx = {}) {
  const { championId, championName, position, flashSide = "D",
          alsoSpells = true, alsoItems = true } = ctx;
  const errors = [];

  try {
    await applyRunePage(page, { label: page.label });
  } catch (e) { errors.push(`runes: ${e?.message ?? e}`); }

  if (alsoSpells && Array.isArray(page.spells) && page.spells.length >= 2) {
    try { await applySummonerSpells(page.spells, { flashSide }); }
    catch (e) { errors.push(`spells: ${e?.message ?? e}`); }
  }

  if (alsoItems && page.build && championId) {
    try {
      // Use the full slices (allBoots + alternates) so the in-game shop is
      // populated with the rich multi-block set, not just the visual row.
      const buildToApply = {
        starters:    page.build.starters    || [],
        firstThree:  page.build.firstThree  || [],
        coreBuild:   page.build.coreBuild   || [],
        situational: page.build.situational || [],
      };
      if (buildToApply.coreBuild.length >= 3) {
        await applyItemSet(buildToApply, { championId, championName, position });
      }
    } catch (e) { errors.push(`items: ${e?.message ?? e}`); }
  }

  if (errors.length) throw new Error(errors.join(" | "));
}

// Apply a specific alternate 5-item build path. Reuses the user's current
// starters, boots, and situational items — only the core sequence changes.
// Used by the "Browse all builds" UI when the user clicks Apply on a row.
export async function applyAltBuild(altItems, baseBuild, ctx = {}) {
  if (!Array.isArray(altItems) || altItems.length < 3) {
    throw new Error("alt build needs at least 3 items");
  }
  const boot = baseBuild?.boots?.[0];
  // Same convention as fetchItemBuild: insert boot in slot 2 so the in-game
  // sequence reads first → boots → second → third → ...
  const ordered = [altItems[0], ...(boot ? [boot] : []), ...altItems.slice(1)];
  const buildToApply = {
    starters:    baseBuild?.starters    || [],
    firstThree:  ordered.slice(0, 3),
    coreBuild:   ordered,
    situational: baseBuild?.situational || [],
  };
  return applyItemSet(buildToApply, ctx);
}

// Wipe EVERY item set (league-lean managed AND user-authored) for the current
// summoner. PUTs an empty itemSets array — destructive nuclear option for
// users whose shop has gotten cluttered. Returns the count of sets removed.
export async function clearAllItemSets() {
  let summoner;
  try {
    summoner = await lcu.get("/lol-summoner/v1/current-summoner");
  } catch (e) {
    throw new Error(`couldn't read current summoner: ${e?.message ?? e}`);
  }
  const summonerId = summoner?.summonerId;
  if (!summonerId) throw new Error("no summonerId in current-summoner response");

  let wrapper;
  try {
    wrapper = await lcu.get(`/lol-item-sets/v1/item-sets/${summonerId}/sets`);
  } catch (e) {
    throw new Error(`couldn't read item sets: ${e?.message ?? e}`);
  }
  const before = Array.isArray(wrapper?.itemSets) ? wrapper.itemSets.length : 0;
  if (!before) return 0;

  await lcu.put(`/lol-item-sets/v1/item-sets/${summonerId}/sets`, {
    accountId: wrapper?.accountId ?? 0,
    itemSets: [],
    timestamp: Date.now(),
  });
  log("cleared all item sets, removed", before);
  return before;
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
