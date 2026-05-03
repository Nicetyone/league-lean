// In-app update checker. Compares the installed commit SHA (baked into
// version.js by install-league-lean.{bat,sh} or by the in-app updater
// against the latest commit on the configured update branch (main / dev) via
// the GitHub REST API.
//
// Doesn't actually self-update — that's lib/self-update.js. The UI in the
// settings tab calls both: this for "Check for updates", that for the
// download + write + reload flow.

import { VERSION } from "../version.js";
import * as store from "./store.js";

const REPO = "Nicetyone/league-lean";

export function installedVersion() {
  return VERSION;
}

export function activeBranch() {
  return store.load().updateBranch || "main";
}

export async function checkForUpdate() {
  const branch = activeBranch();
  const url = `https://api.github.com/repos/${REPO}/commits/${branch}`;
  let res;
  try {
    res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" } });
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
  const installedBranch = VERSION.branch || "main";
  const isDev           = !installedSha || installedSha === "dev";
  // "behind" includes branch mismatch — switching branches is also a "needs update".
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
