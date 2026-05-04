// CSS bundle for the sidebar shell + popup window. Kept as a single template
// string so the same source feeds both the in-client `<style>` element and the
// popup window stylesheet (see shell.popOut()).

import { SHELL_ID, STYLE_ID } from "./constants.js";

export const CSS = `
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
#${SHELL_ID} .ll-build-browser summary {
  cursor: pointer;
  font-size: 10.5px; opacity: 0.75;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 0;
}
#${SHELL_ID} .ll-build-browser summary:hover { opacity: 1; }
#${SHELL_ID} .ll-build-browser[open] summary { margin-bottom: 6px; }
#${SHELL_ID} .ll-build-list {
  display: flex; flex-direction: column;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
}
#${SHELL_ID} .ll-build-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 6px; align-items: center;
  padding: 4px 6px;
  background: rgba(0,0,0,0.2);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.18));
  border-radius: 2px;
}
#${SHELL_ID} .ll-build-row:hover { border-color: var(--ll-accent, #c8aa6e); }
#${SHELL_ID} .ll-build-row-items {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 1px;
}
#${SHELL_ID} .ll-build-row-items .ll-build-item {
  width: 20px; height: 20px;
  border-radius: 2px;
}
#${SHELL_ID} .ll-build-row-items .ll-arrow {
  font-size: 10px; opacity: 0.4;
}
#${SHELL_ID} .ll-build-row-stats {
  display: flex; flex-direction: column;
  font-size: 9.5px; line-height: 1.2;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
#${SHELL_ID} .ll-build-row-wr  { color: var(--ll-accent-hot, #f0e6d2); font-weight: 700; }
#${SHELL_ID} .ll-build-row-n   { opacity: 0.55; }
#${SHELL_ID} .ll-build-row-apply {
  background: transparent;
  color: var(--ll-accent, #c8aa6e);
  border: 1px solid var(--ll-border, rgba(200,170,110,0.4));
  border-radius: 2px;
  padding: 2px 6px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
}
#${SHELL_ID} .ll-build-row-apply:hover {
  color: var(--ll-accent-hot, #f0e6d2);
  border-color: var(--ll-accent, #c8aa6e);
}
#${SHELL_ID} .ll-build-row-apply:disabled { opacity: 0.5; cursor: not-allowed; }
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
#${SHELL_ID} .ll-danger-btn {
  color: #ff8a4c;
  border-color: rgba(255,138,76,0.5);
}
#${SHELL_ID} .ll-danger-btn:hover {
  background: rgba(255,138,76,0.12);
  color: #ffb38a;
  border-color: #ff8a4c;
}
#${SHELL_ID} .ll-action-detail {
  font-size: 10px; opacity: 0.6;
  margin: 4px 2px 0;
  line-height: 1.4;
}
#${SHELL_ID} .ll-action-status {
  font-size: 10.5px;
  font-style: italic;
  color: var(--ll-accent, #c8aa6e);
  margin-top: 4px;
  min-height: 13px;
}
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

export function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}
