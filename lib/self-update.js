// Update flow.
//
// Updates run through the install bat. The plugin's job here is just:
//   - check GitHub for a newer commit on the configured update branch,
//   - if behind, surface a message + an "Open plugins folder" shortcut so
//     the user can find and run install-league-lean.bat.
//
// The bat itself reads `league-lean.branch` (sibling file) to know which
// channel to pull from; defaults to main when absent.

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

export function reload() {
  if (typeof window?.reloadClient === "function") {
    window.reloadClient();
  } else if (typeof window !== "undefined") {
    window.location.reload();
  }
}
