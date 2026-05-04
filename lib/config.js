// Single source of truth for tunable constants — timing, limits, defaults.
// Anything that's a "magic number" elsewhere in the codebase should land here
// so reviewers can scan it in one place.

// ---- Champ-select automation timing ----
/** ms to wait for a stable champion intent before firing auto-apply. */
export const APPLY_DEBOUNCE_MS = 1200;
/** ms to wait between apply finishing and auto-lock-in firing. */
export const LOCK_IN_AFTER_APPLY_MS = 250;
/** ms after entering post-game phase before reading the honor ballot. */
export const HONOR_DELAY_MS = 4000;
/** ms after entering a post-game phase before fetching EOG stats. */
export const POST_GAME_OVERLAY_DELAY_MS = 1500;

// ---- Polling / observers ----
/** /lol-gameflow/v1/gameflow-phase poll interval. */
export const GAMEFLOW_POLL_MS = 1500;
/** Champ-select session existence poll (used to detect leaving). */
export const CHAMP_SELECT_EXIT_POLL_MS = 5000;

// ---- Build / meta limits ----
/** How many alt 5-item builds to expose in the "Browse all builds" panel. */
export const ALT_BUILDS_MAX = 25;
/** Cap on situational/swap items shown per champion. */
export const SITUATIONAL_ITEMS_MAX = 6;
/** Minimum sample size for an alt build to appear in browse. */
export const ALT_BUILD_MIN_ITEMS = 3;
/** Minimum game count before a counter row is trustworthy. */
export const COUNTER_MIN_GAMES = 200;

// ---- UI sizing ----
export const SIDEBAR_DEFAULT_WIDTH = 380;
export const SIDEBAR_MIN_WIDTH = 320;
export const POPUP_DEFAULT_W = 420;
export const POPUP_DEFAULT_H = 920;

// ---- Defaults read from settings on first use ----
export const DEFAULT_TIER = "platinum_plus";
export const DEFAULT_META_SOURCE = "lolalytics";
export const DEFAULT_HONOR_TYPE = "HEART";
export const DEFAULT_FLASH_SIDE = "D";
/** Update channel pulled by the in-app updater. */
export const DEFAULT_UPDATE_BRANCH = "main";

// ---- External / repo identity ----
export const REPO = "Nicetyone/league-lean";

// ---- u.gg shape constants ----
// These are bumped by u.gg every few patches. If overview fetches start
// 404'ing, look at the network tab on https://u.gg/lol/champions/X/build
// for the new numbers and update here.
export const UGG_STATS_VERSION = "1.5";
export const UGG_OVERVIEW_VERSION = "1.5.0";
export const UGG_GAME_MODE = "ranked_solo_5x5";
/** server: 12 = world. tier: 10 = platinum_plus (validated). */
export const UGG_SERVER_ID = 12;
export const UGG_TIER_ID = 10;

// ---- Riot ranked season for u.gg's fetchProfileRanks ----
export const CURRENT_SEASON_ID = 31;

// ---- Miscellaneous ----
/** Item id for Health Potion — gets count: 2 in starter blocks. */
export const HEALTH_POTION_ID = 2003;
/** Summoner spell id for Flash — anchored to the user's flashSide setting. */
export const FLASH_SPELL_ID = 4;
/** Item-set title prefix used to identify our managed sets for cleanup. */
export const ITEM_SET_TITLE_PREFIX = "league-lean ";
/** Rune-page name prefix — same idea. */
export const RUNE_PAGE_NAME_PREFIX = "league-lean ";
