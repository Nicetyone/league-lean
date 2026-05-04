// In-app updater — action layer.
//
// Pengu's renderer can't write files (no public PluginFS in any released
// version) and can't spawn processes (sandboxed CEF). The only renderer-
// side capabilities Pengu gives us are window.openPluginsFolder() and
// window.reloadClient().
//
// So "update" is a 3-step user flow gated by the install bat:
//   1. We open the plugins folder for the user.
//   2. They run install-league-lean.bat (or .sh on macOS).
//   3. They click "Reload client" — we call window.reloadClient() to
//      hard-refresh with the new code on disk.
//
// The bat reads `league-lean.branch` (sibling file) to know which channel
// to pull from; defaults to main when absent.

import * as store from "./store.js";
import { installerDownloadUrl as buildInstallerUrl } from "./endpoints.js";
import { DEFAULT_UPDATE_BRANCH } from "./config.js";

/** True iff Pengu exposes the renderer helpers we depend on. */
export function isAvailable() {
  return typeof window !== "undefined" &&
    typeof window.openPluginsFolder === "function" &&
    typeof window.reloadClient === "function";
}

/** Open the plugins folder in Explorer / Finder. Returns true on success. */
export function openPluginsFolder() {
  try {
    if (typeof window?.openPluginsFolder === "function") {
      window.openPluginsFolder();
      return true;
    }
  } catch (e) {
    console.warn("[league-lean][self-update] openPluginsFolder failed", e);
  }
  return false;
}

/** Direct download URL for the installer bat on the active branch. */
export function installerDownloadUrl(branch) {
  return buildInstallerUrl(branch || store.load().updateBranch || DEFAULT_UPDATE_BRANCH);
}

/** Hard refresh — clears CEF's cache and re-imports every plugin. */
export function reload() {
  if (typeof window?.reloadClient === "function") {
    window.reloadClient();
  } else if (typeof window !== "undefined") {
    window.location.reload();
  }
}
