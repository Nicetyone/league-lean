// Post-game player overlay + always-available match history viewer.
//
// Two entry points:
//   1. Auto-pop overlay when gameflow enters WaitingForStats /
//      PreEndOfGame / EndOfGame — uses /lol-end-of-game/v1/eog-stats-block.
//   2. Sidebar "Match history" button (always available) — pulls
//      /lol-match-history/v1/products/lol/current-summoner/matches and shows
//      the last 20 games with per-match expansion of all 10 players.
//
// Both surfaces share the same player-row renderer with op.gg buttons.

import * as lcu from "../lcu.js";
import { onPhaseChange } from "../lib/gameflow.js";
import { summonerUrlFromRiotId } from "../lib/opgg.js";
import * as icons from "../lib/icons.js";
import { getChampionMap } from "../lib/meta.js";

const log = (...a) => console.log("[league-lean][post-game]", ...a);

const OVERLAY_ID = "league-lean-postgame";
const STYLE_ID = "league-lean-postgame-style";

const CSS = `
#${OVERLAY_ID} {
  position: fixed !important;
  top: 60px !important;
  left: 50% !important;
  transform: translateX(-50%);
  z-index: 2147483646 !important;
  width: 760px;
  max-width: 92vw;
  max-height: 80vh;
  overflow-y: auto;
  background: rgba(10,18,26,0.97);
  color: var(--ll-accent-hot, #f0e6d2);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.5));
  border-radius: 4px;
  padding: 14px 16px;
  font-family: "Beaufort for LOL", "Spiegel", system-ui, sans-serif;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  pointer-events: auto !important;
}
#${OVERLAY_ID} .ll-pg-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;
}
#${OVERLAY_ID} .ll-pg-title {
  font-size: 12px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ll-accent, #c8aa6e);
}
#${OVERLAY_ID} .ll-pg-close {
  background: transparent; border: 0; cursor: pointer;
  color: var(--ll-accent, #c8aa6e);
  font-size: 18px; line-height: 1;
  padding: 2px 6px;
}
#${OVERLAY_ID} .ll-pg-close:hover { color: var(--ll-accent-hot, #f0e6d2); }

#${OVERLAY_ID} .ll-pg-teams {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
}
#${OVERLAY_ID} .ll-pg-team-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 6px;
  color: var(--ll-accent, #c8aa6e);
  display: flex; justify-content: space-between;
}
#${OVERLAY_ID} .ll-pg-team[data-side="blue"] .ll-pg-team-label .ll-side { color: #6cb6ff; }
#${OVERLAY_ID} .ll-pg-team[data-side="red"]  .ll-pg-team-label .ll-side { color: #ff6b6b; }
#${OVERLAY_ID} .ll-pg-team[data-win="true"]  .ll-pg-result { color: #80e07f; }
#${OVERLAY_ID} .ll-pg-team[data-win="false"] .ll-pg-result { color: #ff6b6b; }

#${OVERLAY_ID} .ll-pg-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto auto;
  gap: 8px; align-items: center;
  padding: 5px 4px;
  border-bottom: 1px solid rgba(200,170,110,0.08);
}
#${OVERLAY_ID} .ll-pg-row:last-child { border-bottom: 0; }
#${OVERLAY_ID} .ll-pg-portrait {
  width: 32px; height: 32px;
  border-radius: 4px;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.3));
  object-fit: cover;
}
#${OVERLAY_ID} .ll-pg-row.ll-pg-me .ll-pg-portrait {
  border-color: var(--ll-accent, #c8aa6e);
  box-shadow: 0 0 0 1px var(--ll-accent, #c8aa6e);
}
#${OVERLAY_ID} .ll-pg-name { display: flex; flex-direction: column; min-width: 0; }
#${OVERLAY_ID} .ll-pg-rid {
  font-size: 12px; font-weight: 600;
  color: var(--ll-accent-hot, #f0e6d2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#${OVERLAY_ID} .ll-pg-row.ll-pg-me .ll-pg-rid { color: #ffe9a8; }
#${OVERLAY_ID} .ll-pg-tag { font-size: 10px; opacity: 0.55; }
#${OVERLAY_ID} .ll-pg-kda {
  font-size: 11px; font-variant-numeric: tabular-nums;
  color: var(--ll-accent, #c8aa6e);
  white-space: nowrap;
}
#${OVERLAY_ID} .ll-pg-opgg {
  background: transparent;
  color: var(--ll-accent-hot, #f0e6d2);
  border: 1px solid var(--ll-accent, #c8aa6e);
  border-radius: 2px;
  padding: 3px 8px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer; text-decoration: none;
}
#${OVERLAY_ID} .ll-pg-opgg:hover { background: rgba(200,170,110,0.15); }
#${OVERLAY_ID} .ll-pg-empty {
  padding: 24px 0; text-align: center;
  color: var(--ll-accent, #c8aa6e); opacity: 0.6;
  font-size: 12px;
}
#${OVERLAY_ID} .ll-pg-tabs {
  display: flex; gap: 4px; margin-bottom: 10px;
  border-bottom: 1px solid var(--ll-border, rgba(200,170,110,0.3));
}
#${OVERLAY_ID} .ll-pg-tab {
  background: transparent; color: var(--ll-accent, #c8aa6e);
  border: 0; padding: 6px 12px; cursor: pointer;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
}
#${OVERLAY_ID} .ll-pg-tab:hover { opacity: 1; }
#${OVERLAY_ID} .ll-pg-tab.ll-active {
  opacity: 1; color: var(--ll-accent-hot, #f0e6d2);
  border-bottom: 2px solid var(--ll-accent, #c8aa6e);
}
#${OVERLAY_ID} .ll-mh-list { display: flex; flex-direction: column; gap: 6px; }
#${OVERLAY_ID} .ll-mh-row {
  display: grid;
  grid-template-columns: 4px 32px minmax(0, 1fr) auto auto;
  gap: 10px; align-items: center;
  padding: 6px 8px;
  background: rgba(0,0,0,0.25);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.18));
  border-radius: 2px;
  cursor: pointer;
}
#${OVERLAY_ID} .ll-mh-row:hover { border-color: var(--ll-accent, #c8aa6e); }
#${OVERLAY_ID} .ll-mh-strip { width: 4px; height: 32px; border-radius: 1px; }
#${OVERLAY_ID} .ll-mh-row[data-win="true"]  .ll-mh-strip { background: #80e07f; }
#${OVERLAY_ID} .ll-mh-row[data-win="false"] .ll-mh-strip { background: #ff6b6b; }
#${OVERLAY_ID} .ll-mh-meta { font-size: 11px; }
#${OVERLAY_ID} .ll-mh-queue {
  font-size: 10px; opacity: 0.6;
  text-transform: uppercase; letter-spacing: 0.05em;
}
#${OVERLAY_ID} .ll-mh-kda {
  font-size: 11px; font-variant-numeric: tabular-nums;
  color: var(--ll-accent, #c8aa6e);
  white-space: nowrap;
}
#${OVERLAY_ID} .ll-mh-when { font-size: 10px; opacity: 0.55; }
#${OVERLAY_ID} .ll-mh-detail { margin: 6px 0 14px; }
`;

const POSTGAME_PHASES = new Set(["WaitingForStats", "PreEndOfGame", "EndOfGame"]);

let cachedRegion = null;
async function getRegion() {
  if (cachedRegion) return cachedRegion;
  cachedRegion = await lcu.region();
  return cachedRegion;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function removeOverlay() { document.getElementById(OVERLAY_ID)?.remove(); }

function renderTeam(teamId, list, region, champions) {
  const win = list[0]?.win;
  const side = teamId === 100 ? "blue" : "red";
  const sideLabel = side === "blue" ? "Blue side" : "Red side";
  const rowsHtml = list.map((p) => {
    const champ = champions.get(p.championId);
    const champName = champ?.name ?? `#${p.championId}`;
    const portrait = icons.championPortraitUrl(p.championId);
    const riotId = p.tagLine ? `${p.gameName}#${p.tagLine}` : (p.gameName || p.summonerName);
    const url = summonerUrlFromRiotId(region, riotId);
    const kda = `${p.kills}/${p.deaths}/${p.assists}`;
    return `
      <div class="ll-pg-row ${p.isMe ? "ll-pg-me" : ""}">
        <img class="ll-pg-portrait" src="${portrait}" alt="${champName}" title="${champName}">
        <div class="ll-pg-name">
          <div class="ll-pg-rid">${riotId || "(unknown)"}</div>
          <div class="ll-pg-tag">${champName}</div>
        </div>
        <div class="ll-pg-kda">${kda}</div>
        <a class="ll-pg-opgg" href="${url}" target="_blank">op.gg</a>
      </div>
    `;
  }).join("");
  return `
    <div class="ll-pg-team" data-side="${side}" data-win="${!!win}">
      <div class="ll-pg-team-label">
        <span class="ll-side">${sideLabel}</span>
        <span class="ll-pg-result">${win ? "Victory" : "Defeat"}</span>
      </div>
      ${rowsHtml}
    </div>
  `;
}

async function fetchEogPlayers() {
  const data = await lcu.get("/lol-end-of-game/v1/eog-stats-block");
  const teams = data?.teams ?? [];
  const out = [];
  let myPuuid = null;
  try { myPuuid = (await lcu.get("/lol-summoner/v1/current-summoner"))?.puuid; } catch {}
  for (const team of teams) {
    const win = !!(team?.isWinningTeam ?? team?.win);
    for (const p of team?.players ?? []) {
      out.push({
        puuid: p.puuid,
        gameName: p.gameName ?? p.riotIdGameName ?? p.summonerName ?? "",
        tagLine: p.tagLine ?? p.riotIdTagLine ?? "",
        summonerName: p.summonerName ?? "",
        championId: p.championId,
        kills: p.stats?.CHAMPIONS_KILLED ?? p.kills ?? p.stats?.kills ?? 0,
        deaths: p.stats?.NUM_DEATHS ?? p.deaths ?? p.stats?.deaths ?? 0,
        assists: p.stats?.ASSISTS ?? p.assists ?? p.stats?.assists ?? 0,
        teamId: team.teamId, win,
        isMe: myPuuid && p.puuid === myPuuid,
      });
    }
  }
  return out;
}

async function fetchMatchHistory({ count = 20 } = {}) {
  // Returns recent games for the current summoner. Endpoint shape: a `games`
  // wrapper with `gameId`, `participants`, `participantIdentities`, etc.
  const path = `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count - 1}`;
  const data = await lcu.get(path);
  const games = data?.games?.games ?? [];
  let myPuuid = null;
  try { myPuuid = (await lcu.get("/lol-summoner/v1/current-summoner"))?.puuid; } catch {}

  return games.map((g) => normalizeMatch(g, myPuuid));
}

function normalizeMatch(game, myPuuid) {
  // Find me by puuid in participantIdentities, then map to participantId.
  const identities = game?.participantIdentities ?? [];
  let myParticipantId = null;
  for (const idn of identities) {
    if (idn?.player?.puuid && idn.player.puuid === myPuuid) {
      myParticipantId = idn.participantId;
      break;
    }
  }
  const players = (game?.participants ?? []).map((p) => {
    const idn = identities.find((i) => i.participantId === p.participantId)?.player ?? {};
    return {
      puuid: idn.puuid,
      gameName: idn.gameName ?? idn.summonerName ?? "",
      tagLine: idn.tagLine ?? "",
      summonerName: idn.summonerName ?? "",
      championId: p.championId,
      kills: p.stats?.kills ?? 0,
      deaths: p.stats?.deaths ?? 0,
      assists: p.stats?.assists ?? 0,
      teamId: p.teamId,
      win: !!p.stats?.win,
      isMe: myParticipantId != null && p.participantId === myParticipantId,
    };
  });
  const me = players.find((p) => p.isMe);
  return {
    gameId: game.gameId,
    queueId: game.queueId,
    gameMode: game.gameMode,
    gameType: game.gameType,
    when: game.gameCreation, // ms epoch
    players,
    me,
    win: !!me?.win,
  };
}

function relativeTime(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 60)        return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24)        return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30)        return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

const QUEUE_LABEL = {
  420: "Ranked Solo", 440: "Ranked Flex", 430: "Normal Blind", 400: "Normal Draft",
  450: "ARAM", 700: "Clash", 720: "ARAM Clash", 1700: "Arena", 1900: "URF",
};

async function ensureOverlay() {
  ensureStyle();
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  document.documentElement.appendChild(overlay);
  return overlay;
}

let activePane = "current"; // "current" | "history"
let cachedHistory = null;

async function paintOverlay() {
  const overlay = await ensureOverlay();
  const region = await getRegion();
  const champions = await getChampionMap();

  overlay.innerHTML = `
    <div class="ll-pg-head">
      <div class="ll-pg-title">league-lean</div>
      <button class="ll-pg-close" title="Close">×</button>
    </div>
    <div class="ll-pg-tabs">
      <button class="ll-pg-tab ${activePane === "current" ? "ll-active" : ""}" data-pane="current">Current match</button>
      <button class="ll-pg-tab ${activePane === "history" ? "ll-active" : ""}" data-pane="history">Match history</button>
    </div>
    <div class="ll-pg-body"></div>
  `;
  overlay.querySelector(".ll-pg-close").addEventListener("click", removeOverlay);
  overlay.querySelector(".ll-pg-tabs").addEventListener("click", (e) => {
    const t = e.target.closest("[data-pane]");
    if (!t) return;
    activePane = t.dataset.pane;
    paintOverlay();
  });

  const body = overlay.querySelector(".ll-pg-body");
  if (activePane === "current") {
    body.innerHTML = `<div class="ll-pg-empty">Loading current match…</div>`;
    let players = [];
    try { players = await fetchEogPlayers(); } catch {}
    if (!players.length) {
      body.innerHTML = `<div class="ll-pg-empty">No active post-game data right now. Try the Match history tab.</div>`;
      return;
    }
    const teams = new Map();
    for (const p of players) {
      if (!teams.has(p.teamId)) teams.set(p.teamId, []);
      teams.get(p.teamId).push(p);
    }
    body.innerHTML = `
      <div class="ll-pg-teams">
        ${[...teams.entries()].sort(([a], [b]) => a - b).map(([tid, list]) => renderTeam(tid, list, region, champions)).join("")}
      </div>
    `;
  } else {
    body.innerHTML = `<div class="ll-pg-empty">Loading match history…</div>`;
    if (!cachedHistory) {
      try { cachedHistory = await fetchMatchHistory({ count: 20 }); }
      catch (e) {
        body.innerHTML = `<div class="ll-pg-empty">match history unavailable: ${e?.message ?? e}</div>`;
        return;
      }
    }
    if (!cachedHistory.length) {
      body.innerHTML = `<div class="ll-pg-empty">No recent matches.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="ll-mh-list">
        ${cachedHistory.map((m, i) => {
          const myChamp = champions.get(m.me?.championId);
          const portrait = icons.championPortraitUrl(m.me?.championId);
          const kda = m.me ? `${m.me.kills}/${m.me.deaths}/${m.me.assists}` : "—";
          const queue = QUEUE_LABEL[m.queueId] || m.gameMode || "Match";
          return `
            <div class="ll-mh-row" data-win="${m.win}" data-idx="${i}">
              <div class="ll-mh-strip"></div>
              <img class="ll-pg-portrait" src="${portrait}" alt="${myChamp?.name || ""}">
              <div class="ll-mh-meta">
                <div>${myChamp?.name || "—"}</div>
                <div class="ll-mh-queue">${queue}</div>
              </div>
              <div class="ll-mh-kda">${kda}</div>
              <div class="ll-mh-when">${relativeTime(m.when)}</div>
            </div>
            <div class="ll-mh-detail" data-detail-for="${i}" hidden></div>
          `;
        }).join("")}
      </div>
    `;
    body.addEventListener("click", (e) => {
      const row = e.target.closest("[data-idx]");
      if (!row) return;
      const i = parseInt(row.dataset.idx, 10);
      const detail = body.querySelector(`[data-detail-for="${i}"]`);
      if (!detail) return;
      if (!detail.hasAttribute("hidden")) {
        detail.setAttribute("hidden", "");
        detail.innerHTML = "";
        return;
      }
      // Collapse any other open detail.
      for (const d of body.querySelectorAll(".ll-mh-detail")) {
        d.setAttribute("hidden", "");
        d.innerHTML = "";
      }
      const m = cachedHistory[i];
      const teams = new Map();
      for (const p of m.players) {
        if (!teams.has(p.teamId)) teams.set(p.teamId, []);
        teams.get(p.teamId).push(p);
      }
      detail.innerHTML = `
        <div class="ll-pg-teams">
          ${[...teams.entries()].sort(([a], [b]) => a - b).map(([tid, list]) => renderTeam(tid, list, region, champions)).join("")}
        </div>
      `;
      detail.removeAttribute("hidden");
    });
  }
}

export async function start() {
  log("active");
  let lastPhase = null;
  let inflight = false;

  const stopPhase = onPhaseChange(async (phase) => {
    if (phase === lastPhase) return;
    const wasPostGame = POSTGAME_PHASES.has(lastPhase);
    lastPhase = phase;
    if (POSTGAME_PHASES.has(phase)) {
      if (inflight) return;
      inflight = true;
      try {
        await new Promise((r) => setTimeout(r, 1500));
        activePane = "current";
        await paintOverlay();
      } catch (e) { log("paint failed", e?.message); }
      finally { inflight = false; }
    } else if (wasPostGame) {
      removeOverlay();
    }
  });

  return () => {
    stopPhase?.();
    removeOverlay();
  };
}

// Public — opened from the sidebar's "Match history" button.
export async function openMatchHistory() {
  cachedHistory = null; // refresh on each manual open
  activePane = "history";
  await paintOverlay();
}
