// Hide overloaded UI: Loot, Clubs, Events tabs and the news widget on Home.
// CSS-only — no DOM observers needed.

import { injectCss } from "../lib/dom.js";

const STYLE_ID = "league-lean-home-cleanup";

const CSS = `
/* Hide nav tabs we don't want.
   FRAGILE: Riot uses internal class names like .lol-navigation-bar-item
   and a data-id attribute. Adjust selectors after inspecting the real DOM. */
.lol-navigation-bar-item[data-id="loot"],
.lol-navigation-bar-item[data-id="clubs"],
.lol-navigation-bar-item[data-id="event_hub"],
.lol-navigation-bar-item[data-id="store"],
.lol-navigation-bar [data-event-id*="loot"],
.lol-navigation-bar [data-event-id*="clubs"] {
  display: none !important;
}

/* Strip Home news widget + featured carousel. */
.home-page-news-widget,
.home-page-featured-content,
.lol-home-page-rotating-content {
  display: none !important;
}
`;

export function start() {
  const stop = injectCss(STYLE_ID, CSS);
  console.log("[league-lean][home-cleanup] active");
  return stop;
}
