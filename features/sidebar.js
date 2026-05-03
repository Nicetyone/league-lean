// Collapsible sidebar with three tabs: Champion / Meta / Settings.
//
// - Pinned to the right edge of the screen.
// - Collapsed = thin tab strip (24px). Click handle to expand to ~380px.
// - Champion tab is only enabled during champ select; otherwise greyed out.
// - Meta tab shows the tier list per lane (Top / Jungle / Mid / ADC / Support),
//   color-coded letter tiers (S+ → D), sortable rows.
// - Settings tab carries the existing toggles + meta source / tier dropdowns.

import * as lcu from "../lcu.js";
import * as meta from "../lib/meta.js";
import * as store from "../lib/store.js";
import * as icons from "../lib/icons.js";
import * as favorites from "../lib/favorites.js";
import * as updater from "../lib/updater.js";
import * as selfUpdate from "../lib/self-update.js";
import * as postGame from "./post-game-opgg.js";

const log = (...a) => console.log("[league-lean][sidebar]", ...a);

const SHELL_ID = "league-lean-sidebar";
const STYLE_ID = "league-lean-sidebar-style";

// Inline SVG icons for the main tabs — kept inline so they inherit currentColor
// and don't depend on any external asset.
const TAB_ICONS = {
  champion: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M21 3l-3 3"/><path d="M21 6l-6 6"/><path d="M16 10l-3-3"/></svg>`,
  meta: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  toggle_open: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  toggle_close: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  pop_out: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
  pop_in: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H3v-6"/><path d="M14 10L3 21"/><path d="M21 5v11a2 2 0 0 1-2 2h-7"/></svg>`,
};

const TABS = [
  { key: "champion", label: "Champion" },
  { key: "meta",     label: "Meta" },
  { key: "settings", label: "Settings" },
];

const LANES = [
  { key: "top",     label: "Top" },
  { key: "jungle",  label: "Jungle" },
  { key: "middle",  label: "Mid" },
  { key: "bottom",  label: "ADC" },
  { key: "support", label: "Support" },
];

const TIER_COLOR = {
  "S+": "#ff5e5e", "S": "#ff8a4c",
  "A+": "#ffc24d", "A": "#ffd97c",
  "B": "#c8aa6e",
  "C": "#888",    "D": "#666",
};

const CSS = `
/* Floating toggle button — bottom-right of the screen. */
#${SHELL_ID}-toggle {
  position: fixed !important;
  bottom: 14px !important; right: 14px !important;
  z-index: 2147483647 !important;
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(10,18,26,0.96);
  color: var(--ll-accent, #c8aa6e);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.5));
  border-radius: 50%;
  cursor: pointer; user-select: none;
  box-shadow: 0 2px 8px rgba(0,0,0,0.5);
  transition: color 120ms, transform 120ms;
  pointer-events: auto !important;
  font-family: "Beaufort for LOL", "Spiegel", system-ui, sans-serif;
}
#${SHELL_ID}-toggle:hover {
  color: var(--ll-accent-hot, #f0e6d2);
  transform: scale(1.05);
}
#${SHELL_ID}-toggle.ll-open {
  right: 394px !important; /* sit on the edge of the open panel */
}

/* Sidebar shell — slides in from right when open. */
#${SHELL_ID} {
  position: fixed !important;
  top: 0 !important; right: 0 !important; bottom: 0 !important;
  z-index: 2147483646 !important;
  width: 380px;
  transform: translateX(100%);
  transition: transform 200ms ease-out;
  background: rgba(10,18,26,0.97);
  color: var(--ll-accent-hot, #f0e6d2);
  border-left: 1px solid var(--ll-border, rgba(200,170,110,0.4));
  display: flex; flex-direction: column;
  font-family: "Beaufort for LOL", "Spiegel", system-ui, sans-serif;
  pointer-events: auto !important;
  box-shadow: -4px 0 14px rgba(0,0,0,0.4);
}
#${SHELL_ID}.ll-open { transform: translateX(0); }

/* Popped-out mode — shell fills the entire detached window. */
#${SHELL_ID}.ll-popup-host {
  position: relative !important;
  top: auto !important; right: auto !important; bottom: auto !important;
  width: 100vw !important; height: 100vh !important;
  transform: none !important;
  border: 0 !important;
  box-shadow: none !important;
  z-index: 0 !important;
}
#${SHELL_ID} .ll-popout-btn {
  background: transparent; border: 0;
  color: var(--ll-accent, #c8aa6e);
  cursor: pointer;
  padding: 0 12px;
  display: inline-flex; align-items: center; justify-content: center;
  border-left: 1px solid var(--ll-border, rgba(200,170,110,0.3));
}
#${SHELL_ID} .ll-popout-btn:hover { color: var(--ll-accent-hot, #f0e6d2); }
/* Resize grip in the popped-out window's bottom-right corner. */
#${SHELL_ID} .ll-popup-resizer {
  display: none;
  position: fixed;
  right: 0; bottom: 0;
  width: 18px; height: 18px;
  cursor: nwse-resize;
  z-index: 99;
  background:
    linear-gradient(135deg, transparent 55%,
      var(--ll-accent, #c8aa6e) 55%, var(--ll-accent, #c8aa6e) 70%,
      transparent 70%, transparent 80%,
      var(--ll-accent, #c8aa6e) 80%, var(--ll-accent, #c8aa6e) 95%,
      transparent 95%);
  opacity: 0.55;
}
#${SHELL_ID}.ll-popup-host .ll-popup-resizer { display: block; }
#${SHELL_ID} .ll-popup-resizer:hover { opacity: 1; }

#${SHELL_ID} .ll-tabs {
  display: flex;
  border-bottom: 1px solid var(--ll-border, rgba(200,170,110,0.3));
}
#${SHELL_ID} .ll-tab {
  flex: 1; padding: 10px 0;
  display: inline-flex; align-items: center; justify-content: center;
  gap: 6px;
  text-align: center; cursor: pointer;
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ll-accent, #c8aa6e); opacity: 0.6;
  background: transparent; border: 0;
}
#${SHELL_ID} .ll-tab svg { display: block; }
#${SHELL_ID} .ll-tab:hover { opacity: 1; }
#${SHELL_ID} .ll-tab.ll-active {
  opacity: 1; color: var(--ll-accent-hot, #f0e6d2);
  border-bottom: 2px solid var(--ll-accent, #c8aa6e);
}
#${SHELL_ID} .ll-tab[disabled] { opacity: 0.25; cursor: not-allowed; }

#${SHELL_ID} .ll-content {
  flex: 1; overflow-y: auto;
  padding: 12px 14px;
  font-size: 12px;
}
#${SHELL_ID} .ll-content::-webkit-scrollbar { width: 6px; }
#${SHELL_ID} .ll-content::-webkit-scrollbar-thumb {
  background: rgba(200,170,110,0.4);
}

/* ===== Champion tab ===== */
#${SHELL_ID} .ll-section { margin-bottom: 14px; }
#${SHELL_ID} .ll-section h4 {
  margin: 0 0 6px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ll-accent, #c8aa6e); opacity: 0.85;
}
#${SHELL_ID} .ll-row {
  display: flex; justify-content: space-between;
  padding: 2px 0;
}
#${SHELL_ID} .ll-stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
#${SHELL_ID} .ll-stat {
  display: flex; flex-direction: column; align-items: center;
  padding: 6px 0;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.3));
  border-radius: 2px;
}
#${SHELL_ID} .ll-stat-label {
  font-size: 9px; opacity: 0.6; letter-spacing: 0.1em;
}
#${SHELL_ID} .ll-stat-val {
  font-size: 14px; font-weight: 700; color: var(--ll-accent-hot, #f0e6d2);
}
#${SHELL_ID} .ll-tier-letter[data-tier^="S"] { color: #ff6b6b; }
#${SHELL_ID} .ll-tier-letter[data-tier^="A"] { color: #ffc24d; }
#${SHELL_ID} .ll-tier-letter[data-tier^="B"] { color: #c8aa6e; }
#${SHELL_ID} .ll-tier-letter[data-tier^="C"] { color: #999; }
#${SHELL_ID} .ll-tier-letter[data-tier^="D"] { color: #777; }

#${SHELL_ID} .ll-rune-card {
  margin: 6px 0;
  padding: 8px 10px;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.3));
  border-radius: 2px;
}
#${SHELL_ID} .ll-rune-card-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}
#${SHELL_ID} .ll-rune-card-title {
  font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ll-accent-hot, #f0e6d2);
}
#${SHELL_ID} .ll-rune-card-meta {
  font-size: 10px; opacity: 0.7;
}
#${SHELL_ID} .ll-rune-perks {
  display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0;
}
#${SHELL_ID} .ll-rune-perk {
  width: 26px; height: 26px;
  border-radius: 50%;
  background-color: rgba(0,0,0,0.5);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.3));
  object-fit: cover;
  display: inline-flex; align-items: center; justify-content: center;
}
#${SHELL_ID} .ll-rune-perk.ll-shard {
  width: 22px; height: 22px;
}
#${SHELL_ID} .ll-rune-perk-missing {
  font-size: 8px; color: var(--ll-accent, #c8aa6e); opacity: 0.6;
}
#${SHELL_ID} .ll-rune-toggle {
  display: flex;
  margin-bottom: 6px;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.35));
  border-radius: 2px;
  overflow: hidden;
}
#${SHELL_ID} .ll-rune-toggle-btn {
  flex: 1;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--ll-border, rgba(200,170,110,0.2));
  color: var(--ll-accent, #c8aa6e);
  cursor: pointer;
  padding: 5px 8px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.6;
}
#${SHELL_ID} .ll-rune-toggle-btn:last-child { border-right: 0; }
#${SHELL_ID} .ll-rune-toggle-btn:hover { opacity: 1; }
#${SHELL_ID} .ll-rune-toggle-btn.ll-active {
  background: rgba(200,170,110,0.18);
  color: var(--ll-accent-hot, #f0e6d2);
  opacity: 1;
}
#${SHELL_ID} .ll-card-section {
  margin: 6px 0;
  padding-top: 6px;
  border-top: 1px solid var(--ll-border, rgba(200,170,110,0.15));
}
#${SHELL_ID} .ll-spells {
  display: flex; gap: 8px; align-items: center;
}
#${SHELL_ID} .ll-spell {
  position: relative;
}
#${SHELL_ID} .ll-spell img {
  width: 26px; height: 26px;
  border-radius: 4px;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.3));
  background: rgba(0,0,0,0.4);
}
#${SHELL_ID} .ll-spell-key {
  position: absolute; bottom: -4px; right: -4px;
  background: rgba(10,18,26,0.95);
  color: var(--ll-accent-hot, #f0e6d2);
  font-size: 9px; font-weight: 700;
  padding: 1px 4px;
  border-radius: 2px;
  border: 1px solid var(--ll-accent, #c8aa6e);
}
#${SHELL_ID} .ll-build-seq {
  display: flex; flex-wrap: wrap; align-items: center; gap: 3px;
}
#${SHELL_ID} .ll-build-item {
  width: 24px; height: 24px;
  border-radius: 3px;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.25));
  background: rgba(0,0,0,0.4);
}
#${SHELL_ID} .ll-arrow {
  color: var(--ll-accent, #c8aa6e); opacity: 0.5;
  font-size: 12px;
}
#${SHELL_ID} .ll-skill {
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px;
}
#${SHELL_ID} .ll-skill-label {
  opacity: 0.7;
  text-transform: uppercase; letter-spacing: 0.06em;
  font-size: 9.5px;
}
#${SHELL_ID} .ll-skill-key {
  display: inline-block;
  width: 18px; height: 18px;
  text-align: center; line-height: 18px;
  font-weight: 700; font-size: 11px;
  color: var(--ll-accent-hot, #f0e6d2);
  background: rgba(200,170,110,0.15);
  border: 1px solid var(--ll-accent, #c8aa6e);
  border-radius: 3px;
}
#${SHELL_ID} .ll-apply {
  width: 100%;
  margin-top: 6px;
  padding: 6px 0;
  background: transparent;
  color: var(--ll-accent-hot, #f0e6d2);
  border: 1px solid var(--ll-accent, #c8aa6e);
  border-radius: 2px;
  font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  cursor: pointer; font-size: 11px;
}
#${SHELL_ID} .ll-apply:hover { background: rgba(200,170,110,0.15); }
#${SHELL_ID} .ll-apply:disabled { opacity: 0.5; cursor: not-allowed; }

#${SHELL_ID} .ll-counter-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
#${SHELL_ID} .ll-counter-list { font-size: 11px; line-height: 1.5; }
#${SHELL_ID} .ll-counter-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 3px 0;
}
#${SHELL_ID} .ll-counter-champ {
  display: inline-flex; align-items: center; gap: 6px; min-width: 0;
}
#${SHELL_ID} .ll-counter-name {
  color: var(--ll-accent-hot, #f0e6d2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#${SHELL_ID} .ll-counter-wr { opacity: 0.7; font-variant-numeric: tabular-nums; }
#${SHELL_ID} .ll-portrait {
  width: 22px; height: 22px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.3));
  flex: 0 0 auto;
}
#${SHELL_ID} .ll-tier-name-cell {
  display: flex; align-items: center; gap: 6px;
}
#${SHELL_ID} .ll-tier-table .ll-portrait { width: 20px; height: 20px; }
#${SHELL_ID} .ll-champ-header {
  display: flex; align-items: center; gap: 12px;
  padding: 4px 0;
}
#${SHELL_ID} .ll-champ-portrait {
  width: 48px; height: 48px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid var(--ll-accent, #c8aa6e);
  flex: 0 0 auto;
}
#${SHELL_ID} .ll-champ-meta { min-width: 0; flex: 1; }
#${SHELL_ID} .ll-champ-name {
  font-size: 14px; font-weight: 700;
  color: var(--ll-accent-hot, #f0e6d2);
  letter-spacing: 0.04em;
}
#${SHELL_ID} .ll-champ-sub {
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px;
  color: var(--ll-accent, #c8aa6e); opacity: 0.85;
  margin-top: 2px;
  text-transform: uppercase; letter-spacing: 0.06em;
}
#${SHELL_ID} .ll-champ-sub .ll-dot { opacity: 0.5; }
#${SHELL_ID} .ll-champ-sub .ll-lane-mini {
  display: inline-block; width: 14px; height: 14px;
  color: var(--ll-accent, #c8aa6e);
  line-height: 0;
}
#${SHELL_ID} .ll-champ-sub .ll-lane-mini svg { width: 100%; height: 100%; display: block; }
#${SHELL_ID} .ll-champ-sub .ll-source-badge {
  margin-left: auto;
  padding: 1px 5px;
  font-size: 9px;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.4));
  border-radius: 2px;
}

#${SHELL_ID} .ll-deeplinks {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 4px; margin-top: 6px;
}
#${SHELL_ID} .ll-deeplinks a {
  display: block; text-align: center; padding: 4px 0;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  color: var(--ll-accent, #c8aa6e); text-decoration: none;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.3));
  border-radius: 2px;
}
#${SHELL_ID} .ll-deeplinks a:hover {
  color: var(--ll-accent-hot, #f0e6d2); border-color: var(--ll-accent, #c8aa6e);
}

/* ===== Meta tab ===== */
#${SHELL_ID} .ll-meta-search {
  margin-bottom: 8px;
}
#${SHELL_ID} .ll-search-input {
  width: 100%;
  background: rgba(0,0,0,0.4);
  color: var(--ll-accent-hot, #f0e6d2);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.4));
  border-radius: 2px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
}
#${SHELL_ID} .ll-search-input:focus {
  border-color: var(--ll-accent, #c8aa6e);
}
#${SHELL_ID} .ll-search-input::placeholder {
  color: var(--ll-accent, #c8aa6e); opacity: 0.5;
}
#${SHELL_ID} .ll-lane-tabs {
  display: flex; gap: 4px; margin-bottom: 8px;
}
#${SHELL_ID} .ll-lane-tab {
  flex: 1; padding: 5px 0;
  display: inline-flex; flex-direction: column; align-items: center;
  gap: 2px;
  background: transparent;
  color: var(--ll-accent, #c8aa6e);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.3));
  border-radius: 2px;
  cursor: pointer;
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase;
}
#${SHELL_ID} .ll-lane-icon {
  display: inline-block; width: 16px; height: 16px;
  color: var(--ll-accent, #c8aa6e);
  line-height: 0;
}
#${SHELL_ID} .ll-lane-tab.ll-active .ll-lane-icon {
  color: var(--ll-accent-hot, #f0e6d2);
}
#${SHELL_ID} .ll-lane-icon svg { width: 100%; height: 100%; display: block; }
#${SHELL_ID} .ll-lane-tab.ll-active {
  background: rgba(200,170,110,0.15);
  color: var(--ll-accent-hot, #f0e6d2);
  border-color: var(--ll-accent, #c8aa6e);
}
#${SHELL_ID} .ll-tier-table {
  width: 100%; border-collapse: collapse;
  font-size: 11px;
}
#${SHELL_ID} .ll-tier-table th, #${SHELL_ID} .ll-tier-table td {
  padding: 4px 4px; text-align: right;
  border-bottom: 1px solid rgba(200,170,110,0.1);
}
#${SHELL_ID} .ll-tier-table th {
  font-size: 9px; opacity: 0.6; letter-spacing: 0.05em;
  text-transform: uppercase; text-align: right;
  position: sticky; top: 0;
  background: rgba(10,18,26,0.96);
}
#${SHELL_ID} .ll-tier-table td:first-child,
#${SHELL_ID} .ll-tier-table th:first-child {
  text-align: left;
}
#${SHELL_ID} .ll-tier-cell {
  display: inline-block;
  width: 24px; padding: 1px 0; text-align: center;
  font-weight: 800; font-size: 10px;
  border-radius: 2px;
}
#${SHELL_ID} .ll-star {
  background: transparent; border: 0; cursor: pointer;
  font-size: 14px; line-height: 1;
  color: rgba(200,170,110,0.35);
  padding: 2px 4px;
}
#${SHELL_ID} .ll-star:hover { color: var(--ll-accent, #c8aa6e); }
#${SHELL_ID} .ll-star.ll-on { color: #ffd166; }
#${SHELL_ID} .ll-tier-table tr.ll-starred-row td {
  background: rgba(255,209,102,0.06);
}
#${SHELL_ID} .ll-tier-table tr.ll-starred-row .ll-name {
  color: #ffe9a8;
}
#${SHELL_ID} .ll-star-cell { width: 24px; padding-left: 0 !important; padding-right: 0 !important; }
#${SHELL_ID} .ll-tier-table tr.ll-tier-row { cursor: pointer; }
#${SHELL_ID} .ll-tier-table tr.ll-tier-row:hover td {
  background: rgba(200,170,110,0.08);
}
#${SHELL_ID} .ll-back-bar {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
  padding: 6px 8px;
  background: rgba(200,170,110,0.08);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.3));
  border-radius: 2px;
}
#${SHELL_ID} .ll-back-btn {
  background: transparent;
  color: var(--ll-accent-hot, #f0e6d2);
  border: 0;
  cursor: pointer;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 4px;
}
#${SHELL_ID} .ll-back-btn:hover { color: #fff; }
#${SHELL_ID} .ll-browse-label {
  font-size: 9px; opacity: 0.6;
  letter-spacing: 0.15em; text-transform: uppercase;
}
#${SHELL_ID} .ll-rank-num { opacity: 0.5; width: 22px; display: inline-block; }
#${SHELL_ID} .ll-tier-table .ll-name { color: var(--ll-accent-hot, #f0e6d2); }
#${SHELL_ID} .ll-tier-meta {
  font-size: 10px; opacity: 0.6; margin-top: 6px; text-align: right;
}

/* ===== Settings tab ===== */
#${SHELL_ID} .ll-settings label {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0; cursor: pointer; gap: 12px;
}
#${SHELL_ID} .ll-settings input[type="checkbox"] {
  accent-color: var(--ll-accent, #c8aa6e);
  width: 16px; height: 16px;
}
#${SHELL_ID} .ll-settings select {
  background: rgba(0,0,0,0.4);
  color: var(--ll-accent-hot, #f0e6d2);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.4));
  font-size: 11px; padding: 3px 6px;
  flex: 0 0 auto;
}
#${SHELL_ID} .ll-settings hr {
  border: 0; border-top: 1px solid rgba(200,170,110,0.2);
  margin: 10px 0;
}
#${SHELL_ID} .ll-action-btn {
  width: 100%;
  background: transparent;
  color: var(--ll-accent-hot, #f0e6d2);
  border: 1px solid var(--ll-accent, #c8aa6e);
  border-radius: 2px;
  padding: 6px 0;
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  margin: 4px 0;
}
#${SHELL_ID} .ll-action-btn:hover { background: rgba(200,170,110,0.15); }
#${SHELL_ID} .ll-version-row {
  display: flex; justify-content: space-between;
  font-size: 11px;
  padding: 2px 0;
}
#${SHELL_ID} .ll-version-installed,
#${SHELL_ID} .ll-version-latest {
  color: var(--ll-accent, #c8aa6e);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
}
#${SHELL_ID} .ll-update-status {
  font-size: 10.5px; opacity: 0.8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-top: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#${SHELL_ID} .ll-update-btn {
  background: rgba(200,170,110,0.15);
  color: #ffe9a8;
  border-color: #ffd166;
}
#${SHELL_ID} .ll-update-steps {
  margin-top: 8px;
  border: 1px solid var(--ll-border, rgba(200,170,110,0.25));
  border-radius: 2px;
  padding: 10px;
  background: rgba(0,0,0,0.2);
}
#${SHELL_ID} .ll-step-detail {
  font-size: 10.5px; line-height: 1.5;
  opacity: 0.85;
}
#${SHELL_ID} .ll-step-detail code {
  background: rgba(0,0,0,0.4); padding: 1px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: #ffd166;
}

#${SHELL_ID} .ll-empty {
  padding: 40px 14px;
  text-align: center;
  color: var(--ll-accent, #c8aa6e); opacity: 0.6;
  font-size: 12px;
}
#${SHELL_ID} .ll-loading { opacity: 0.6; font-size: 11px; padding: 6px 0; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ----- shared champion data resolver -----

let _champCache = null;
async function getChampions() {
  if (_champCache) return _champCache;
  _champCache = await meta.getChampionMap();
  return _champCache;
}

// (icon URLs live in lib/icons.js — perks lazy-loaded from CDragon perks.json)

// ===== Champion tab =====

const championTab = (() => {
  let lastChampId = 0;
  let lastPos = "";
  let lastFetchKey = "";
  let runesPayload = null;

  async function render(container, { champion, position, isBrowse, hasChampSelect, onBackToChampSelect }) {
    if (!champion) {
      container.innerHTML = `<div class="ll-empty">Pick a champion in champ select, or click any row in the Meta tab to view its build.</div>`;
      return;
    }
    const settings = store.load();
    const tier = settings.metaTier || "platinum_plus";
    const source = settings.metaSource || "lolalytics";
    const fetchKey = `${champion.id}|${position}|${tier}|${source}`;
    const portrait = icons.championPortraitUrl(champion.id);
    const laneSvg = position ? icons.positionSvg(position.toLowerCase()) : "";

    container.innerHTML = `
      ${isBrowse && hasChampSelect ? `
        <div class="ll-back-bar">
          <button class="ll-back-btn">← Back to my pick</button>
          <span class="ll-browse-label">browsing</span>
        </div>` : ""}
      <div class="ll-section">
        <div class="ll-champ-header">
          <img class="ll-champ-portrait" src="${portrait}" alt="${champion.name}">
          <div class="ll-champ-meta">
            <div class="ll-champ-name">${champion.name}</div>
            <div class="ll-champ-sub">
              ${laneSvg ? `<span class="ll-lane-mini">${laneSvg}</span>` : ""}
              <span>${(position || "default").toLowerCase()}</span>
              <span class="ll-dot">·</span>
              <span>${tier}</span>
              <span class="ll-source-badge">…</span>
            </div>
          </div>
        </div>
      </div>

      <div class="ll-section">
        <h4>Champion strength</h4>
        <div class="ll-stat-grid">
          <div class="ll-stat"><span class="ll-stat-label">TIER</span><span class="ll-stat-val ll-tier-letter">—</span></div>
          <div class="ll-stat"><span class="ll-stat-label">WR</span><span class="ll-stat-val ll-wr">—</span></div>
          <div class="ll-stat"><span class="ll-stat-label">PR</span><span class="ll-stat-val ll-pr">—</span></div>
          <div class="ll-stat"><span class="ll-stat-label">BR</span><span class="ll-stat-val ll-br">—</span></div>
        </div>
      </div>

      <div class="ll-section">
        <h4>Rune pages</h4>
        <div class="ll-rune-pages"><div class="ll-loading">fetching…</div></div>
      </div>

      <div class="ll-section">
        <h4>Matchups</h4>
        <div class="ll-counter-grid">
          <div>
            <div class="ll-stat-label" style="margin-bottom:4px;">STRONG vs</div>
            <div class="ll-counter-list ll-strong"><div class="ll-loading">fetching…</div></div>
          </div>
          <div>
            <div class="ll-stat-label" style="margin-bottom:4px;">WEAK vs</div>
            <div class="ll-counter-list ll-weak"><div class="ll-loading">fetching…</div></div>
          </div>
        </div>
      </div>

      <div class="ll-section">
        <h4>Browse</h4>
        <div class="ll-deeplinks"></div>
      </div>
    `;

    const backBtn = container.querySelector(".ll-back-btn");
    if (backBtn && onBackToChampSelect) {
      backBtn.addEventListener("click", () => onBackToChampSelect());
    }

    const dl = meta.deeplinks({ championKey: champion.alias || champion.name, position });
    container.querySelector(".ll-deeplinks").innerHTML = `
      <a href="${dl.lolalytics}" target="_blank">lolalytics</a>
      <a href="${dl.ugg}" target="_blank">u.gg</a>
      <a href="${dl.metasrc}" target="_blank">metasrc</a>
      <a href="${dl.mobalytics}" target="_blank">mobalytics</a>
      <a href="${dl.opgg}" target="_blank">op.gg</a>
      <a href="${dl.probuilds}" target="_blank">probuilds</a>
    `;

    if (fetchKey === lastFetchKey && runesPayload) {
      // Use cached, redraw.
      await paintRunes(container, runesPayload);
    }

    if (fetchKey === lastFetchKey) return;
    lastFetchKey = fetchKey;

    const [runesR, countersR] = await Promise.allSettled([
      meta.fetchChampionBundle({ championId: champion.id, position, tier, source })
        .then((b) => ({ ...b, championId: champion.id, championName: champion.name, position })),
      meta.fetchCounters({ championId: champion.id, position, tier }),
    ]);

    if (runesR.status === "fulfilled") {
      runesPayload = runesR.value;
      container.querySelector(".ll-source-badge").textContent = runesPayload.source;
      await paintRunes(container, runesPayload);
    } else {
      container.querySelector(".ll-rune-pages").innerHTML =
        `<div class="ll-empty">runes unavailable: ${runesR.reason?.message ?? runesR.reason}</div>`;
      container.querySelector(".ll-source-badge").textContent = "n/a";
    }

    if (countersR.status === "fulfilled" && countersR.value) {
      paintCounters(container, countersR.value);
    } else {
      container.querySelector(".ll-strong").innerHTML = `<div class="ll-empty">no data</div>`;
      container.querySelector(".ll-weak").innerHTML = `<div class="ll-empty">no data</div>`;
    }
  }

  async function paintRunes(container, payload) {
    // Ensure the perks.json icon map is loaded before we build URLs.
    // Without this, the very first render after sidebar open returns "" for
    // every perkIconUrl() and we get empty circles.
    await icons.preload();

    const host = container.querySelector(".ll-rune-pages");
    if (!host) return;
    if (!payload?.pages?.length) {
      host.innerHTML = `<div class="ll-empty">no rune pages</div>`;
      return;
    }

    // Map labels → indices so we can pick the user's preferred page first.
    const labelOf = (p) => String(p.label || "").toLowerCase();
    const idxFor = (kind) => {
      const want = kind === "win" ? "highest winrate" : "most played";
      const direct = payload.pages.findIndex((p) => labelOf(p).startsWith(want));
      return direct >= 0 ? direct : 0;
    };

    function paintActive() {
      const settings = store.load();
      const preferred = settings.autoApplyRunePage === "win" ? "win" : "pick";
      const activeIdx = payload.pages.length === 1 ? 0 : idxFor(preferred);

      const tabsHtml = payload.pages.length <= 1 ? "" : `
        <div class="ll-rune-toggle">
          ${payload.pages.map((p, i) => {
            // Map page label → setting value, used to persist toggle clicks.
            const kind = labelOf(p).startsWith("highest") ? "win" : "pick";
            const short = kind === "win" ? "Highest winrate" : "Most played";
            return `<button class="ll-rune-toggle-btn ${i === activeIdx ? "ll-active" : ""}" data-toggle-kind="${kind}">${short}</button>`;
          }).join("")}
        </div>
      `;

      host.innerHTML = tabsHtml + renderPageCard(payload.pages[activeIdx], activeIdx);
    }

    paintActive();

    host.addEventListener("click", async (e) => {
      const tab = e.target.closest("[data-toggle-kind]");
      if (tab) {
        const kind = tab.dataset.toggleKind;
        store.save({ autoApplyRunePage: kind });
        paintActive();
        return;
      }
      const btn = e.target.closest("[data-apply-idx]");
      if (!btn) return;
      const idx = parseInt(btn.dataset.applyIdx, 10);
      const page = payload.pages[idx];
      if (!page) return;
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = "applying…";
      try {
        const settings = store.load();
        await meta.applyComplete(page, {
          championId: payload.championId,
          championName: payload.championName,
          position: payload.position,
          flashSide: settings.flashSide || "D",
          alsoSpells: true,
          alsoItems: true,
        });
        btn.textContent = "applied ✓";
        try { globalThis.Toast?.success?.("league-lean: page + spells + build applied"); } catch {}
      } catch (err) {
        btn.textContent = `failed: ${err?.message ?? err}`;
        log("apply failed", err);
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = orig;
        }, 1800);
      }
    }, { once: false });
  }

  function renderPageCard(page, i) {
    const perks  = page.selectedPerkIds || [];
    const runes  = perks.slice(0, 6);
    const shards = perks.slice(6);
    const styleIco = icons.styleIconUrl(page.primaryStyleId);

    // Summoner spells — arrange Flash on user's preferred slot.
    const settings = store.load();
    const flashSide = settings.flashSide || "D";
    const arranged  = page.spells?.length >= 2
      ? meta.arrangeSpells(page.spells, flashSide)
      : null;
    const spellsHtml = arranged ? `
      <div class="ll-card-section ll-spells">
        ${[arranged.spell1Id, arranged.spell2Id].map((id, idx) => `
          <div class="ll-spell">
            <img src="${icons.summonerSpellIconUrl(id)}" alt="${id}" title="spell ${id}">
            <span class="ll-spell-key">${idx === 0 ? flashSide : (flashSide === "D" ? "F" : "D")}</span>
          </div>
        `).join("")}
      </div>
    ` : "";

    // Build sequence: starters → boots → core → completed → late
    const b = page.build || {};
    const buildSeq = [
      ...((b.starters || []).slice(0, 2)),
      ...(b.boots || []),
      ...(b.core || []),
      ...(b.completed || []),
      ...(b.lateGame || []),
    ];
    const dedupedSeq = [...new Set(buildSeq)];
    const buildHtml = dedupedSeq.length ? `
      <div class="ll-card-section ll-build-seq">
        ${dedupedSeq.map((id, idx) => `
          ${idx > 0 ? `<span class="ll-arrow">›</span>` : ""}
          <img class="ll-build-item" src="${icons.itemIconUrl(id)}" title="item ${id}" alt="${id}">
        `).join("")}
      </div>
    ` : "";

    // Skill order — short string like "QEW" gives priority order.
    const skillHtml = page.skillOrder ? `
      <div class="ll-card-section ll-skill">
        <span class="ll-skill-label">Skill priority</span>
        ${page.skillOrder.split("").map((s) => `<span class="ll-skill-key">${s}</span>`).join("")}
      </div>
    ` : "";

    return `
      <div class="ll-rune-card" data-page-idx="${i}">
        <div class="ll-rune-card-head">
          <div class="ll-rune-card-title">
            ${styleIco ? `<img src="${styleIco}" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;">` : ""}
            ${page.label}
          </div>
          <div class="ll-rune-card-meta">
            ${page.wr != null ? `${(+page.wr).toFixed(2)}% WR` : ""}
            ${page.n != null ? ` · ${(+page.n).toLocaleString()} games` : ""}
          </div>
        </div>
        <div class="ll-rune-perks">
          ${runes.map((id) => {
            const url = icons.perkIconUrl(id);
            return url
              ? `<img class="ll-rune-perk" title="perk ${id}" src="${url}" alt="${id}">`
              : `<div class="ll-rune-perk ll-rune-perk-missing" title="perk ${id} (no icon)">${id}</div>`;
          }).join("")}
        </div>
        <div class="ll-rune-perks">
          ${shards.map((id) => {
            const url = icons.shardIconUrl(id);
            return url
              ? `<img class="ll-rune-perk ll-shard" title="shard ${id}" src="${url}" alt="${id}">`
              : `<div class="ll-rune-perk ll-shard ll-rune-perk-missing" title="shard ${id}">${id}</div>`;
          }).join("")}
        </div>
        ${spellsHtml}
        ${buildHtml}
        ${skillHtml}
        <button class="ll-apply" data-apply-idx="${i}">Apply runes + spells + build</button>
      </div>
    `;
  }

  async function paintCounters(container, counters) {
    const champions = await getChampions();
    const fmtRow = async (c) => {
      const champ = champions.get(c.cid);
      const name = champ?.name ?? `#${c.cid}`;
      const portrait = icons.championPortraitUrl(c.cid);
      const wr = c.vsWr != null ? `${(+c.vsWr).toFixed(1)}%` : "—";
      return `
        <div class="ll-counter-row">
          <span class="ll-counter-champ">
            <img class="ll-portrait" src="${portrait}" alt="${name}">
            <span class="ll-counter-name">${name}</span>
          </span>
          <span class="ll-counter-wr">${wr}</span>
        </div>
      `;
    };

    container.querySelector(".ll-strong").innerHTML =
      (await Promise.all(counters.strongAgainst.slice(0, 5).map(fmtRow))).join("") || "—";
    container.querySelector(".ll-weak").innerHTML =
      (await Promise.all(counters.weakAgainst.slice(0, 5).map(fmtRow))).join("") || "—";

    const wr = container.querySelector(".ll-wr");
    const pr = container.querySelector(".ll-pr");
    const br = container.querySelector(".ll-br");
    const tl = container.querySelector(".ll-tier-letter");
    const s = counters.stats || {};
    if (wr) wr.textContent = s.wr != null ? `${(+s.wr).toFixed(1)}%` : "—";
    if (pr) pr.textContent = s.pr != null ? `${(+s.pr).toFixed(1)}%` : "—";
    if (br) br.textContent = s.br != null ? `${(+s.br).toFixed(1)}%` : "—";
    if (tl) {
      const letter = derivedTier(s.wr, s.pr);
      tl.textContent = letter ?? "—";
      if (letter) tl.setAttribute("data-tier", letter);
    }
  }

  return {
    setSelection(champ, pos) {
      lastChampId = champ?.id ?? 0;
      lastPos = pos ?? "";
      lastFetchKey = ""; // force re-fetch on render
    },
    render,
  };
})();

function derivedTier(wr, pr) {
  if (wr == null || pr == null) return null;
  if (wr >= 53 && pr >= 5) return "S+";
  if (wr >= 52)            return "S";
  if (wr >= 51)            return "A+";
  if (wr >= 50)            return "A";
  if (wr >= 49)            return "B";
  if (wr >= 48)            return "C";
  return "D";
}

// ===== Meta tab =====

const metaTab = (() => {
  let activeLane = "middle";
  let activeQuery = "";
  let cachedPayload = null;
  let cachedKey = "";

  function buildRows(payload, query, champions, favoritesByChamp) {
    const lanePosition = favorites.LANE_TO_POSITION[activeLane] || "";
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

  async function render(container, { onChampionClick } = {}) {
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
    const fetchKey = `${activeLane}|${tier}`;

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
          const position = favorites.LANE_TO_POSITION[activeLane];
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
      const champions = await getChampions();
      const ch = champions.get(cid);
      if (!ch) return;
      const POS = {
        top: "TOP", jungle: "JUNGLE", middle: "MIDDLE",
        bottom: "BOTTOM", support: "UTILITY", utility: "UTILITY",
      };
      onChampionClick({ champion: ch, position: POS[lane] || "" });
    });
  }

  return { render };
})();

// ===== Settings tab =====

const settingsTab = (() => {
  const FIELDS = [
    { key: "autoAccept",      label: "Auto-accept queue" },
    { key: "autoLockIn",      label: "Auto lock-in champion" },
    { key: "autoApplyRunes",  label: "Auto-apply runes on pick" },
    { key: "autoApplyItems",  label: "Auto-apply build (item set)" },
    { key: "autoApplySpells", label: "Auto-apply summoner spells" },
    { key: "postGameOpgg",    label: "Post-game op.gg buttons" },
    { key: "homeCleanup",     label: "Home cleanup" },
    { key: "performanceMode", label: "Performance mode" },
  ];
  const SELECTS = [
    {
      key: "autoApplyRunePage", label: "Auto-apply page",
      options: [
        ["pick", "Most played"],
        ["win",  "Highest winrate"],
      ],
    },
    {
      key: "flashSide", label: "Flash key",
      options: [
        ["D", "D (left slot)"],
        ["F", "F (right slot)"],
      ],
    },
    {
      key: "metaSource", label: "Meta source",
      options: [
        ["lolalytics", "Lolalytics"],
        ["ugg",        "U.GG"],
      ],
    },
    {
      key: "metaTier", label: "Meta tier",
      options: [
        ["all",            "All ranks"],
        ["platinum_plus",  "Plat+"],
        ["emerald_plus",   "Emerald+"],
        ["diamond_plus",   "Diamond+"],
        ["master_plus",    "Master+"],
        ["challenger",     "Challenger"],
      ],
    },
    {
      key: "updateBranch", label: "Update channel",
      options: [
        ["main", "Stable (main)"],
        ["dev",  "Experimental (dev)"],
      ],
    },
  ];

  function render(container, onChange) {
    const s = store.load();
    const v = updater.installedVersion();
    container.innerHTML = `
      <div class="ll-settings">
        ${FIELDS.map((f) => `
          <label>
            <span>${f.label}</span>
            <input type="checkbox" data-key="${f.key}" ${s[f.key] ? "checked" : ""}>
          </label>
        `).join("")}
        <hr/>
        ${SELECTS.map((sel) => `
          <label>
            <span>${sel.label}</span>
            <select data-key="${sel.key}">
              ${sel.options.map(([v, lbl]) =>
                `<option value="${v}" ${s[sel.key] === v ? "selected" : ""}>${lbl}</option>`
              ).join("")}
            </select>
          </label>
        `).join("")}
        <hr/>
        <div class="ll-settings-actions">
          <button class="ll-action-btn" data-action="match-history">Open match history</button>
        </div>
        <hr/>
        <div class="ll-version">
          <div class="ll-version-row">
            <span>Installed</span>
            <span class="ll-version-installed">${v.shortSha || "dev"}${v.branch && v.branch !== "main" ? ` · <span style="color:#ffd166;">${v.branch}</span>` : ""}${v.date ? ` · ${v.date.slice(0,10)}` : ""}</span>
          </div>
          <div class="ll-version-row">
            <span>Latest</span>
            <span class="ll-version-latest">click "Check for updates"</span>
          </div>
          <button class="ll-action-btn" data-action="check-update">Check for updates</button>
          <div class="ll-update-steps" style="display:none;">
            <div class="ll-step-detail" style="margin-top:6px;">
              Run <code>install-league-lean.bat</code> in your plugins folder, then press <code>Alt+Shift+R</code> in the League client.
            </div>
            <button class="ll-action-btn" data-action="open-folder" style="margin-top:8px;">Open plugins folder</button>
          </div>
          <div class="ll-update-status"></div>
        </div>
      </div>
    `;

    container.addEventListener("change", async (e) => {
      const t = e.target;
      if (!t?.dataset?.key) return;
      const value = t instanceof HTMLInputElement && t.type === "checkbox"
        ? t.checked
        : t.value;
      store.save({ [t.dataset.key]: value });
      await onChange?.(t.dataset.key, value);
    });

    container.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "match-history") {
        await postGame.openMatchHistory();
      }
      if (btn.dataset.action === "check-update") {
        const latestEl = container.querySelector(".ll-version-latest");
        const stepsEl  = container.querySelector(".ll-update-steps");
        latestEl.textContent = "checking…";
        if (stepsEl) stepsEl.style.display = "none";
        const res = await updater.checkForUpdate();
        const showSteps = () => { if (stepsEl) stepsEl.style.display = ""; };

        if (res.error) {
          latestEl.textContent = `error: ${res.error}`;
        } else if (res.isDev) {
          latestEl.textContent = `${res.latest.shortSha} on ${res.branch} (dev install)`;
          showSteps();
        } else if (res.upToDate) {
          latestEl.innerHTML = `${res.latest.shortSha} on <strong>${res.branch}</strong> — up to date ✓`;
        } else if (res.branchChanged) {
          latestEl.innerHTML = `${res.latest.shortSha} on <strong style="color:#ffd166;">${res.branch}</strong> — <strong style="color:#ffd166;">switch branches</strong>`;
          showSteps();
        } else if (res.behind) {
          latestEl.innerHTML = `${res.latest.shortSha} on <strong>${res.branch}</strong> — <strong style="color:#ffd166;">update available</strong>`;
          showSteps();
        }
      }
      if (btn.dataset.action === "open-folder") {
        selfUpdate.openPluginsFolder();
      }
    });
  }

  return { render };
})();

// ===== Sidebar shell =====

export function start({ socket, onSettingChange } = {}) {
  ensureStyle();

  let activeTab = "champion";
  let isOpen = false;
  let csSession = null; // current /lol-champ-select/v1/session payload, or null
  let mySelection = null; // { champion, position } when in champ select
  let browseSelection = null; // override when user clicks a champ from Meta

  const shell = document.createElement("div");
  shell.id = SHELL_ID;
  shell.innerHTML = `
    <div class="ll-tabs">
      ${TABS.map((t) => `
        <button class="ll-tab ${t.key === activeTab ? "ll-active" : ""}" data-tab="${t.key}">
          ${TAB_ICONS[t.key] || ""}<span>${t.label}</span>
        </button>
      `).join("")}
      <button class="ll-popout-btn" data-action="pop-out" title="Open in a separate window">${TAB_ICONS.pop_out}</button>
    </div>
    <div class="ll-content"></div>
    <div class="ll-popup-resizer" title="Drag to resize"></div>
  `;

  const toggleBtn = document.createElement("div");
  toggleBtn.id = `${SHELL_ID}-toggle`;
  toggleBtn.title = "league-lean";
  toggleBtn.innerHTML = TAB_ICONS.toggle_open;

  document.documentElement.appendChild(shell);
  document.documentElement.appendChild(toggleBtn);
  icons.preload(); // warm the perks.json cache

  // ---- pop-out window mode -----
  // Pengu's CEF lets us spawn a detached OS-level window via window.open.
  // We adopt the shell DOM into the popup's document (preserving event
  // listeners and state) so all the running JS in the main window keeps
  // driving it. Closing the popup snaps the shell back into the in-client.
  let popupRef = null;
  let popupSize = { w: 420, h: 920 };

  function popOut() {
    if (popupRef && !popupRef.closed) { try { popupRef.focus(); } catch {} return; }
    let popup;
    try {
      popup = window.open("about:blank", "leagueLeanPopup",
        `width=${popupSize.w},height=${popupSize.h},left=80,top=80,resizable=yes`);
    } catch (e) { log("popup open threw", e); return; }
    if (!popup) { log("popup blocked"); return; }
    popupRef = popup;

    try {
      const invoke = (name, params = []) => popup.riotInvoke?.({
        request: JSON.stringify({ name, params }),
      });
      invoke("Window.ResizeTo", [popupSize.w, popupSize.h]);
      invoke("Window.CenterToScreen");
      invoke("Window.Show");
    } catch {}

    popup.document.open();
    popup.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<title>league-lean</title><style>${CSS}</style></head>` +
      `<body style="margin:0;padding:0;background:rgba(10,18,26,0.97);color:#f0e6d2;"></body></html>`
    );
    popup.document.close();

    try {
      const adopted = popup.document.adoptNode(shell);
      shell.classList.add("ll-popup-host", "ll-open");
      popup.document.body.appendChild(adopted);
    } catch (e) {
      log("adoptNode failed", e); popup.close(); popupRef = null; return;
    }

    toggleBtn.style.display = "none";
    setPopOutBtn(true);
    attachPopupResizeHandlers(popup);

    popup.addEventListener("beforeunload", () => popIn());
    log("popped out");
  }

  function popIn() {
    if (!popupRef) return;
    try {
      const adopted = document.adoptNode(shell);
      document.documentElement.appendChild(adopted);
    } catch (e) { log("adopt back failed", e); }
    shell.classList.remove("ll-popup-host");
    toggleBtn.style.display = "";
    setPopOutBtn(false);
    try { if (popupRef && !popupRef.closed) popupRef.close(); } catch {}
    popupRef = null;
    log("popped in");
  }

  function setPopOutBtn(poppedOut) {
    const btn = shell.querySelector(".ll-popout-btn");
    if (!btn) return;
    btn.innerHTML = poppedOut ? TAB_ICONS.pop_in : TAB_ICONS.pop_out;
    btn.dataset.action = poppedOut ? "pop-in" : "pop-out";
    btn.title = poppedOut ? "Return to in-client sidebar" : "Open in a separate window";
  }

  // ----- Resizable popup -----
  // CEF popups inherit borderless window chrome, so OS-level resize handles
  // aren't there. We add a corner grip in the bottom-right that drives
  // riotInvoke('Window.ResizeTo') as the cursor moves. screenX/screenY
  // give us screen-space coords that survive the window being moved around.
  function attachPopupResizeHandlers(popup) {
    const grip = popup.document.querySelector(".ll-popup-resizer");
    if (!grip) return;
    let dragging = false, sX = 0, sY = 0, sW = 0, sH = 0;
    const invokeResize = (w, h) => {
      try {
        popup.riotInvoke?.({ request: JSON.stringify({
          name: "Window.ResizeTo", params: [Math.round(w), Math.round(h)],
        })});
      } catch {}
    };
    grip.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      sX = e.screenX; sY = e.screenY;
      sW = popupSize.w; sH = popupSize.h;
      e.preventDefault(); e.stopPropagation();
    });
    popup.document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const w = Math.max(320, sW + (e.screenX - sX));
      const h = Math.max(400, sH + (e.screenY - sY));
      popupSize = { w, h };
      invokeResize(w, h);
    });
    popup.document.addEventListener("mouseup", () => { dragging = false; });
    popup.addEventListener("blur",  () => { dragging = false; });
  }

  const tabBar = shell.querySelector(".ll-tabs");
  const content = shell.querySelector(".ll-content");

  function setOpen(v) {
    isOpen = v;
    shell.classList.toggle("ll-open", v);
    toggleBtn.classList.toggle("ll-open", v);
    toggleBtn.innerHTML = v ? TAB_ICONS.toggle_close : TAB_ICONS.toggle_open;
    if (v) renderActive();
  }

  toggleBtn.addEventListener("click", () => setOpen(!isOpen));

  tabBar.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]");
    if (action) {
      if (action.dataset.action === "pop-out") popOut();
      else if (action.dataset.action === "pop-in") popIn();
      return;
    }
    const t = e.target.closest("[data-tab]");
    if (!t || t.disabled) return;
    activeTab = t.dataset.tab;
    if (activeTab === "champion") browseSelection = null;
    for (const el of tabBar.querySelectorAll(".ll-tab")) {
      el.classList.toggle("ll-active", el.dataset.tab === activeTab);
    }
    renderActive();
  });

  function effectiveSelection() {
    return browseSelection || mySelection;
  }

  function updateChampTabAvailability() {
    const champTab = tabBar.querySelector('[data-tab="champion"]');
    if (!champTab) return;
    if (effectiveSelection()?.champion) {
      champTab.removeAttribute("disabled");
    } else {
      champTab.setAttribute("disabled", "");
      if (activeTab === "champion") {
        activeTab = "meta";
        for (const el of tabBar.querySelectorAll(".ll-tab")) {
          el.classList.toggle("ll-active", el.dataset.tab === activeTab);
        }
      }
    }
  }

  function browseChampion(sel) {
    browseSelection = sel;
    activeTab = "champion";
    for (const el of tabBar.querySelectorAll(".ll-tab")) {
      el.classList.toggle("ll-active", el.dataset.tab === activeTab);
    }
    updateChampTabAvailability();
    renderActive();
  }

  function backToChampSelect() {
    browseSelection = null;
    updateChampTabAvailability();
    renderActive();
  }

  async function renderActive() {
    if (!isOpen) return;
    if (activeTab === "champion") {
      const sel = effectiveSelection();
      const isBrowse = !!browseSelection;
      championTab.setSelection(sel?.champion, sel?.position);
      await championTab.render(content, {
        ...(sel || {}),
        isBrowse,
        hasChampSelect: !!mySelection,
        onBackToChampSelect: backToChampSelect,
      });
    } else if (activeTab === "meta") {
      await metaTab.render(content, { onChampionClick: browseChampion });
    } else if (activeTab === "settings") {
      settingsTab.render(content, async (key, value) => {
        await onSettingChange?.(key, value);
      });
    }
  }

  // Champ select session subscriber.
  let lastLockedId = 0;
  async function syncSelection(session) {
    csSession = session;
    if (!session) {
      mySelection = null;
      lastLockedId = 0;
      updateChampTabAvailability();
      return;
    }
    const cellId = session.localPlayerCellId;
    const me = (session.myTeam ?? []).find((p) => p?.cellId === cellId);
    const lockedId = me?.championId || 0;
    const intentId = me?.championPickIntent || 0;
    const champId  = lockedId || intentId;
    if (!champId) {
      mySelection = null;
      lastLockedId = 0;
      updateChampTabAvailability();
      return;
    }
    const champions = await getChampions();
    const champion = champions.get(champId);
    const newSel = { champion, position: me?.assignedPosition || "" };
    const changed = !mySelection
      || mySelection.champion?.id !== newSel.champion?.id
      || mySelection.position !== newSel.position;
    mySelection = newSel;
    // When champ select fires a fresh pick, drop the browse override so the
    // user sees their actual matchup.
    if (changed) browseSelection = null;
    updateChampTabAvailability();

    // ----- Auto-focus on lock-in -----
    // When `championId` (the locked-in id, distinct from `championPickIntent`)
    // transitions from 0 → set, we yank the user to the Champion tab so they
    // immediately see their actual matchup. Hover-only intent changes do NOT
    // trigger an auto-switch — the user keeps whatever tab they're on.
    const justLockedIn = lockedId !== 0 && lockedId !== lastLockedId;
    lastLockedId = lockedId;
    if (justLockedIn) {
      activeTab = "champion";
      for (const el of tabBar.querySelectorAll(".ll-tab")) {
        el.classList.toggle("ll-active", el.dataset.tab === activeTab);
      }
      if (isOpen) renderActive();
    } else if (changed && isOpen && activeTab === "champion") {
      renderActive();
    }
  }

  let unsub = null;
  if (socket) {
    unsub = lcu.subscribe(socket, "/lol-champ-select/v1/session", (msg) => {
      const data = msg?.data ?? msg;
      if (data) syncSelection(data);
    });
  }
  // Also poll once on start to catch already-in-champ-select case.
  (async () => {
    try {
      const session = await lcu.get("/lol-champ-select/v1/session");
      syncSelection(session);
    } catch {
      // not in champ select — that's fine.
      mySelection = null;
      updateChampTabAvailability();
    }
  })();

  // When champ select ends, the session GET 404s.
  const exitPoller = setInterval(async () => {
    if (!csSession) return;
    try {
      await lcu.get("/lol-champ-select/v1/session");
    } catch {
      syncSelection(null);
    }
  }, 5000);

  // Reattach on Riot view-router wipes. While popped out, the shell lives in
  // the popup's document — don't fight that.
  const reattachObserver = new MutationObserver(() => {
    if (popupRef && !popupRef.closed) return;
    if (!document.contains(shell)) {
      document.documentElement.appendChild(shell);
    }
    if (!document.contains(toggleBtn)) {
      document.documentElement.appendChild(toggleBtn);
    }
  });
  reattachObserver.observe(document.documentElement, { childList: true, subtree: false });

  log("active");

  return () => {
    unsub?.();
    clearInterval(exitPoller);
    reattachObserver.disconnect();
    if (popupRef && !popupRef.closed) { try { popupRef.close(); } catch {} }
    popupRef = null;
    shell.remove();
    toggleBtn.remove();
  };
}
