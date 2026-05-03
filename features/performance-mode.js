// Performance mode. CSS-only — disables Riot's heaviest visual effects.
// Selectors are based on commonly-shipped Riot class names; some may need
// adjustment as patches ship.

import { injectCss } from "../lib/dom.js";

const STYLE_ID = "league-lean-performance-mode";

const CSS = `
/* Disable animated splash + parallax on Home / champion masthead. */
.parties-background,
.lol-home-page-background-video,
.lol-loot-background,
.lol-store-background,
video.lol-static-video,
.lol-rcp-fe-common-background-music {
  display: none !important;
}

/* Kill animated borders, glow effects, particle layers. */
.uikit-floating-particle,
.uikit-decorative-frame,
.lol-uikit-flat-button-glow,
.parties-decoration-particles,
[class*="particle"][class*="layer"] {
  display: none !important;
}

/* Snap transitions to instant. */
*, *::before, *::after {
  transition-duration: 0ms !important;
  animation-duration: 0ms !important;
  animation-delay: 0ms !important;
}
`;

export function start() {
  console.log("[league-lean][performance-mode] active");
  return injectCss(STYLE_ID, CSS);
}
