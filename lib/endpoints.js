// Single source of truth for every URL the plugin touches — LCU paths,
// external CDN hosts, GraphQL endpoints. Keeping them here lets us:
//   - audit Riot policy compliance from one file (the published list of
//     LCU endpoints used)
//   - swap hosts (e.g. for testing) without grepping every feature
//   - patch when an upstream API changes paths

import { REPO } from "./config.js";

// ============== EXTERNAL HOSTS ==============

export const LOLALYTICS_BASE = "https://a1.lolalytics.com/mega/";
export const UGG_BASE        = "https://stats2.u.gg/lol";
export const UGG_GRAPHQL     = "https://u.gg/api";
export const OPGG_BASE       = "https://lol-api-champion.op.gg/api";
export const CDRAGON_BASE    = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default";
export const DDRAGON_VERSIONS = "https://ddragon.leagueoflegends.com/api/versions.json";

// GitHub
export const GITHUB_API = "https://api.github.com";
export const GITHUB_RAW = "https://raw.githubusercontent.com";
export const GITHUB_REPO_API   = `${GITHUB_API}/repos/${REPO}`;
export const GITHUB_REPO_RAW   = `${GITHUB_RAW}/${REPO}`;
export const installerDownloadUrl = (branch = "main") =>
  `${GITHUB_REPO_RAW}/${branch}/install-league-lean.bat`;
export const githubCommitsUrl = (branch = "main") =>
  `${GITHUB_REPO_API}/commits/${branch}`;
export const githubTreeUrl = (sha) =>
  `${GITHUB_REPO_API}/git/trees/${sha}?recursive=1`;

// LCU local-asset CDN (same-origin in the renderer)
export const LCU_ASSETS = "/lol-game-data/assets/v1";

// ============== LCU PATHS ==============
//
// Every path the plugin reads from or writes to. Builders are functions when
// they need a parameter; constants otherwise.

// — Summoner / region
export const LCU_CURRENT_SUMMONER = "/lol-summoner/v1/current-summoner";
export const LCU_REGION_LOCALE    = "/riotclient/region-locale";

// — Champ select
export const LCU_CHAMP_SELECT_SESSION       = "/lol-champ-select/v1/session";
export const LCU_CHAMP_SELECT_MY_SELECTION  = "/lol-champ-select/v1/session/my-selection";
export const LCU_CHAMP_SELECT_GRID          = "/lol-champ-select/v1/all-grid-champions";
export const lcuActionComplete = (id) => `/lol-champ-select/v1/session/actions/${id}/complete`;
export const lcuToggleFavorite = (championId, position) =>
  `/lol-champ-select/v1/toggle-favorite/${championId}/${position}`;

// — Matchmaking / ready check
export const LCU_READY_CHECK_ACCEPT = "/lol-matchmaking/v1/ready-check/accept";

// — Gameflow
export const LCU_GAMEFLOW_PHASE = "/lol-gameflow/v1/gameflow-phase";

// — Runes
export const LCU_PERK_PAGES        = "/lol-perks/v1/pages";
export const LCU_PERK_CURRENT_PAGE = "/lol-perks/v1/currentpage";
export const LCU_PERK_INVENTORY    = "/lol-perks/v1/inventory";
export const lcuPerkPage = (id) => `/lol-perks/v1/pages/${id}`;

// — Item sets
export const lcuItemSets = (summonerId) =>
  `/lol-item-sets/v1/item-sets/${summonerId}/sets`;

// — Game data assets (icons, manifests)
export const LCU_CHAMPION_SUMMARY = "/lol-game-data/assets/v1/champion-summary.json";
export const lcuChampionPortrait = (championId) =>
  `${LCU_ASSETS}/champion-icons/${championId}.png`;

// — Honor
export const LCU_HONOR_BALLOT = "/lol-honor-v2/v1/ballot";
export const LCU_HONOR_PLAYER = "/lol-honor-v2/v1/honor-player";

// — End-of-game / match history
export const LCU_EOG_STATS_BLOCK = "/lol-end-of-game/v1/eog-stats-block";
export const lcuMatchHistory = (count = 20) =>
  `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count - 1}`;

// — Live client (during in-match — only responds while game is running)
export const LIVE_CLIENT_BASE = "https://127.0.0.1:2999";
export const LIVE_CLIENT_PLAYER_LIST  = `${LIVE_CLIENT_BASE}/liveclientdata/playerlist`;
export const LIVE_CLIENT_GAME_STATS   = `${LIVE_CLIENT_BASE}/liveclientdata/gamestats`;
export const LIVE_CLIENT_ACTIVE       = `${LIVE_CLIENT_BASE}/liveclientdata/activeplayer`;
