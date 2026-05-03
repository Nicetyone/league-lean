// league-lean — entry point. Pengu calls init(context) at startup, then load()
// after the LCU is ready and Riot's frontend has mounted.

import "./styles/lean.css";

import * as store from "./lib/store.js";
import * as gameflow from "./lib/gameflow.js";
import * as registry from "./lib/registry.js";

import * as postGameOpgg from "./features/post-game-opgg.js";
import * as autoAccept from "./features/auto-accept.js";
import * as autoChampSelect from "./features/auto-champ-select.js";
import * as homeCleanup from "./features/home-cleanup.js";
import * as performanceMode from "./features/performance-mode.js";
import * as sidebar from "./features/sidebar.js";

const log = (...a) => console.log("[league-lean]", ...a);

let pluginCtx = null;

export function init(context) {
  pluginCtx = context;
  log("init — context keys:", Object.keys(context ?? {}));
}

export async function load() {
  log("loading…");

  gameflow.start();

  registry.register("homeCleanup",     ()    => homeCleanup.start());
  registry.register("performanceMode", ()    => performanceMode.start());
  registry.register("autoAccept",      ()    => autoAccept.start());
  registry.register("postGameOpgg",    ()    => postGameOpgg.start());
  // autoChampSelect handles BOTH autoLockIn and autoApplyRunes — one socket
  // subscription drives both. We bind it to a synthetic "autoChampSelect" key
  // and treat it as enabled if either underlying toggle is on.
  registry.register("autoChampSelect", () => autoChampSelect.start({ socket: pluginCtx?.socket }));

  const settings = store.load();
  log("settings:", settings);

  for (const key of ["homeCleanup", "performanceMode", "autoAccept", "postGameOpgg"]) {
    await registry.applyFeature(key, !!settings[key]);
  }
  await registry.applyFeature("autoChampSelect", !!(settings.autoLockIn || settings.autoApplyRunes));

  // Sidebar replaces the old gear icon + champ-select panel.
  sidebar.start({
    socket: pluginCtx?.socket,
    onSettingChange: async (key, value) => {
      log("setting changed:", key, "→", value);
      if (typeof value === "boolean" && registry.isRunning(key) !== value) {
        await registry.applyFeature(key, value);
      }
      // Auto-cs feature listens to autoLockIn / autoApplyRunes; (re)start
      // whenever either changes.
      if (key === "autoLockIn" || key === "autoApplyRunes") {
        const s = store.load();
        const wantOn = !!(s.autoLockIn || s.autoApplyRunes);
        if (registry.isRunning("autoChampSelect") !== wantOn) {
          await registry.applyFeature("autoChampSelect", wantOn);
        }
      }
    },
  });

  log("ready");
}

export function unload() {
  registry.shutdown();
}
