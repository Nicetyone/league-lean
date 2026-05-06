// Meta tab — global tier list per lane, with starring and click-through to the
// Champion tab.
//
// Stars are sourced from the LCU's per-position favorites list (see
// lib/favorites.js); flipping a star here optimistically updates the
// in-memory map and pushes the change to the LCU in the background.

import * as store from "../../../lib/store.js";
import * as meta from "../../../lib/meta.js";
import * as icons from "../../../lib/icons.js";
import * as favorites from "../../../lib/favorites.js";
import { LANES, LANE_TO_POSITION, TIER_COLOR } from "../constants.js";
import { getChampions } from "../util.js";

const log = (...a) => console.log("[league-lean][sidebar:meta]", ...a);

let activeLane = "middle";
let activeQuery = "";
let cachedPayload = null;
let cachedKey = "";

function buildRows(payload, query, champions, favoritesByChamp) {
  const lanePosition = LANE_TO_POSITION[activeLane] || "";
  const isStarred = (cid) =>
    Array.isArray(favoritesByChamp?.[cid]) &&
    favoritesByChamp[cid].includes(lanePosition);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? payload.champions.filter((c) => {
        const ch = champions.get(c.championId);
        return ch && ch.name.toLowerCase().includes(q);
      })
    : payload.champions;
  const ordered = [...filtered].sort((a, b) => {
    const sa = isStarred(a.championId) ? 0 : 1;
    const sb = isStarred(b.championId) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.rank - b.rank;
  });

  return ordered.map((c) => {
    const champ = champions.get(c.championId);
    if (!champ) return "";
    const tierLabel = c.tier;
    const color = TIER_COLOR[tierLabel] ?? "#888";
    const portrait = icons.championPortraitUrl(c.championId);
    const starred = isStarred(c.championId);
    return `
      <tr class="ll-tier-row ${starred ? "ll-starred-row" : ""}" data-champ="${c.championId}" data-lane="${c.defaultLane || activeLane}">
        <td class="ll-star-cell">
          <button class="ll-star ${starred ? "ll-on" : ""}" data-star="${c.championId}" title="${starred ? "Unstar" : "Star"} ${champ.name}">${starred ? "★" : "☆"}</button>
        </td>
        <td class="ll-tier-name-cell">
          <span class="ll-rank-num">${c.rank}</span>
          <span class="ll-tier-cell" style="color:${color};border:1px solid ${color};">${tierLabel}</span>
          <img class="ll-portrait" src="${portrait}" alt="${champ.name}">
          <span class="ll-name">${champ.name}</span>
        </td>
        <td>${(+c.wr).toFixed(1)}%</td>
        <td>${(+c.pr).toFixed(1)}%</td>
        <td>${(+c.br).toFixed(1)}%</td>
      </tr>
    `;
  }).join("");
}

export async function render(container, { onChampionClick } = {}) {
  container.innerHTML = `
    <div class="ll-meta-search">
      <input type="search" class="ll-search-input" placeholder="Search champion…" value="${activeQuery.replace(/"/g, "&quot;")}">
    </div>
    <div class="ll-lane-tabs">
      ${LANES.map((l) => `
        <button class="ll-lane-tab ${l.key === activeLane ? "ll-active" : ""}" data-lane="${l.key}">
          <span class="ll-lane-icon">${icons.positionSvg(l.key)}</span>
          <span>${l.label}</span>
        </button>
      `).join("")}
    </div>
    <div class="ll-tier-host"><div class="ll-loading">fetching tier list…</div></div>
  `;

  const searchInput = container.querySelector(".ll-search-input");
  container.querySelector(".ll-lane-tabs").addEventListener("click", (e) => {
    const t = e.target.closest("[data-lane]");
    if (!t) return;
    activeLane = t.dataset.lane;
    render(container, { onChampionClick });
  });

  const settings = store.load();
  const tier = settings.metaTier || "platinum_plus";
  const host = container.querySelector(".ll-tier-host");
  // metaSource feeds the cache key so swapping providers triggers a re-fetch.
  const metaSource = settings.metaSource || "lolalytics";
  const fetchKey = `${activeLane}|${tier}|${metaSource}`;

  let payload = cachedKey === fetchKey ? cachedPayload : null;
  if (!payload) {
    try {
      payload = await meta.fetchTierList({ lane: activeLane, tier });
      cachedPayload = payload;
      cachedKey = fetchKey;
    } catch (e) {
      host.innerHTML = `<div class="ll-empty">tier list unavailable: ${e?.message ?? e}</div>`;
      return;
    }
  }

  const champions = await getChampions();
  let favoritesByChamp = await favorites.load();

  function paint() {
    const rows = buildRows(payload, activeQuery, champions, favoritesByChamp);
    host.innerHTML = `
      <table class="ll-tier-table">
        <thead><tr><th></th><th>Champion</th><th>WR</th><th>PR</th><th>BR</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="ll-empty" style="text-align:center;">no champions match "${activeQuery}"</td></tr>`}</tbody>
      </table>
      <div class="ll-tier-meta">${(payload.analysed || 0).toLocaleString()} games · avg ${(+payload.avgWr).toFixed(2)}% WR</div>
    `;
  }
  paint();

  let searchTimer = null;
  searchInput?.addEventListener("input", () => {
    activeQuery = searchInput.value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(paint, 80); // mini-debounce so typing stays smooth
  });

  host.addEventListener("click", async (e) => {
    const starBtn = e.target.closest("[data-star]");
    if (starBtn) {
      const id = parseInt(starBtn.dataset.star, 10);
      if (Number.isFinite(id)) {
        const position = LANE_TO_POSITION[activeLane];
        if (!position) return;
        // Optimistic UI: flip the in-memory map and repaint immediately,
        // then sync to LCU in the background (or queue if offline).
        const cur = favoritesByChamp[id] || [];
        const idx = cur.indexOf(position);
        const next = idx >= 0 ? cur.filter((p) => p !== position) : [...cur, position];
        favoritesByChamp = { ...favoritesByChamp };
        if (next.length) favoritesByChamp[id] = next;
        else             delete favoritesByChamp[id];
        paint();
        favorites.toggle(id, position).catch((err) => log("toggle err", err));
      }
      return;
    }
    const row = e.target.closest("[data-champ]");
    if (!row || !onChampionClick) return;
    const cid = parseInt(row.dataset.champ, 10);
    const lane = row.dataset.lane || activeLane;
    if (!Number.isFinite(cid)) return;
    const ch = champions.get(cid);
    if (!ch) return;
    onChampionClick({ champion: ch, position: LANE_TO_POSITION[lane] || "" });
  });
}
