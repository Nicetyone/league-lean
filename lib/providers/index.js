// Provider registry — the translation layer between user-selected sources
// and the rest of the plugin.
//
// Two categories:
//   - BUILDS_PROVIDERS — runes + items + spells + skill order. Drives the
//     Champion tab and auto-champ-select.
//   - META_PROVIDERS   — tier list + counters. Drives the Meta tab.
//
// Every provider implements the same contract so the consumer doesn't know
// or care which API answered. See lib/providers/builds/<name>.js for the
// BuildsProvider shape and lib/providers/meta/<name>.js for MetaProvider.
//
// When the user-selected provider fails, we cascade silently through the
// remaining providers in a fixed order. The served-by id is stamped on
// every response so the UI can show "served by X" badges.

import * as buildsLol  from "./builds/lolalytics.js";
import * as buildsUgg  from "./builds/ugg.js";
import * as buildsOpgg from "./builds/opgg.js";

import * as metaLol  from "./meta/lolalytics.js";
import * as metaOpgg from "./meta/opgg.js";

import * as store from "../store.js";
import { loggerFor } from "../log.js";

const log = loggerFor("providers");

export const BUILDS_PROVIDERS = Object.freeze({
  lolalytics: { id: "lolalytics", label: "Lolalytics", impl: buildsLol  },
  opgg:       { id: "opgg",       label: "OP.GG",      impl: buildsOpgg },
  ugg:        { id: "ugg",        label: "U.GG",       impl: buildsUgg  },
});

export const META_PROVIDERS = Object.freeze({
  lolalytics: { id: "lolalytics", label: "Lolalytics", impl: metaLol  },
  opgg:       { id: "opgg",       label: "OP.GG",      impl: metaOpgg },
});

// Fixed cascade order when the selected provider fails. The selected
// provider always runs first; we only iterate this list for fallbacks.
const BUILDS_CASCADE = ["lolalytics", "opgg", "ugg"];
const META_CASCADE   = ["lolalytics", "opgg"];

function selectedBuildsId() {
  return store.load().buildsSource || "lolalytics";
}
function selectedMetaId() {
  return store.load().metaSource || "lolalytics";
}

async function runWithCascade(registry, cascade, selectedId, method, args) {
  const order = [selectedId, ...cascade.filter((k) => k !== selectedId)];
  let firstError;
  for (const providerId of order) {
    const provider = registry[providerId];
    if (!provider || typeof provider.impl[method] !== "function") continue;
    try {
      const result = await provider.impl[method](args);
      if (providerId !== selectedId) {
        log.log(`fallback: ${selectedId}.${method} failed → served by ${providerId}`);
      }
      // Always stamp the actual serving provider.
      return { ...result, source: providerId };
    } catch (e) {
      log.log(`${providerId}.${method} failed:`, e?.message ?? e);
      if (!firstError) firstError = e;
    }
  }
  throw firstError || new Error(`all providers failed for ${method}`);
}

// ---------- Builds ----------

/**
 * Fetch the per-champion build bundle using the user-selected builds
 * provider, cascading silently on failure.
 */
export function fetchBuildBundle(args) {
  return runWithCascade(BUILDS_PROVIDERS, BUILDS_CASCADE, selectedBuildsId(), "fetchBundle", args);
}

// ---------- Meta ----------

export function fetchTierList(args) {
  return runWithCascade(META_PROVIDERS, META_CASCADE, selectedMetaId(), "fetchTierList", args);
}

export function fetchCounters(args) {
  return runWithCascade(META_PROVIDERS, META_CASCADE, selectedMetaId(), "fetchCounters", args);
}
