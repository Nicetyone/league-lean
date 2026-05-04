// In-app update checker.
//
// Pairs with lib/self-update.js (the action layer — open folder, reload).
// This module is read-only: queries GitHub's commits API on the configured
// update branch and reports whether the installed SHA is behind.

import { VERSION } from "../version.js";
import * as store from "./store.js";
import { githubCommitsUrl } from "./endpoints.js";
import { DEFAULT_UPDATE_BRANCH } from "./config.js";

export const installedVersion = () => VERSION;

export const activeBranch = () => store.load().updateBranch || DEFAULT_UPDATE_BRANCH;

/**
 * Check the active update branch for new commits.
 * Returns one of:
 *   { error, branch }
 *   { installed, latest, branch, isDev,        upToDate: true }
 *   { installed, latest, branch, branchChanged: true,    behind: true }
 *   { installed, latest, branch,                          behind: true }
 */
export async function checkForUpdate() {
  const branch = activeBranch();
  let res;
  try {
    res = await fetch(githubCommitsUrl(branch), {
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch (e) {
    return { error: `network: ${e?.message ?? e}`, branch };
  }
  if (res.status === 404) return { error: `branch '${branch}' not found`, branch };
  if (!res.ok)             return { error: `github ${res.status}`,        branch };

  let data;
  try { data = await res.json(); }
  catch { return { error: "bad JSON from GitHub", branch }; }

  const latestSha   = data?.sha ?? "";
  const latestShort = latestSha.slice(0, 7);
  const latestDate  = data?.commit?.committer?.date ?? data?.commit?.author?.date ?? "";
  const latestMsg   = String(data?.commit?.message ?? "").split("\n")[0];

  const installedSha    = VERSION.sha || "";
  const installedBranch = VERSION.branch || DEFAULT_UPDATE_BRANCH;
  const isDev           = !installedSha || installedSha === "dev";
  const branchChanged   = !isDev && installedBranch !== branch;
  const upToDate        = !isDev && !branchChanged && installedSha === latestSha;
  const behind          = !isDev && (branchChanged || installedSha !== latestSha);

  return {
    installed: VERSION,
    branch,
    latest: { sha: latestSha, shortSha: latestShort, date: latestDate, message: latestMsg, branch },
    isDev,
    upToDate,
    behind,
    branchChanged,
  };
}
