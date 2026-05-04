// LCU item-set management.
//
// Item sets are persisted per-summoner via PUT on the wrapper:
//   /lol-item-sets/v1/item-sets/{summonerId}/sets
//
// The wrapper is { accountId, itemSets: [...], timestamp }. Every PUT
// replaces the entire array, so to ADD a set we read-modify-write: filter
// out our own previous sets (title starts with ITEM_SET_TITLE_PREFIX),
// append the new one, PUT back. User-authored sets are preserved.
//
// Block layout for the in-game shop:
//   1. Starting items
//   2..N: per-step blocks (First item / Boots / Second item / ...)
//   N+1: Situational / swap items
// One item per "build step" block produces a clean top-to-bottom build
// guide in Riot's custom item-set UI.

import * as lcu from "../../lcu.js";
import { lcuItemSets, LCU_CURRENT_SUMMONER } from "../endpoints.js";
import { HEALTH_POTION_ID, ITEM_SET_TITLE_PREFIX } from "../config.js";
import { isBoot } from "../data/boots.js";
import { loggerFor } from "../log.js";

const log = loggerFor("lcu-items").log;

const ID = (n) => String(n);
const itemEntry = (id) => ({
  id: ID(id),
  count: id === HEALTH_POTION_ID ? 2 : 1,
});

function uuid() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

function readSummonerId(s) {
  return s?.summonerId;
}

/** Read the current summoner's item-set wrapper. */
async function readWrapper() {
  const summoner = await lcu.get(LCU_CURRENT_SUMMONER);
  const summonerId = readSummonerId(summoner);
  if (!summonerId) throw new Error("no summonerId in current-summoner response");
  const wrapper = await lcu.get(lcuItemSets(summonerId));
  return { summonerId, wrapper };
}

function buildBlocks({ starters, coreBuild, situational }) {
  const blocks = [];

  if (starters?.length) {
    blocks.push({
      type: "1. Starting items",
      items: starters.map(itemEntry),
    });
  }

  // One block per step in the ordered core, labelled by build position.
  let stepN = 1;
  let nonBootIdx = 0;
  for (const id of coreBuild || []) {
    stepN += 1;
    let label;
    if (isBoot(id)) {
      label = `${stepN}. Boots`;
    } else {
      nonBootIdx += 1;
      const ord = ["First", "Second", "Third", "Fourth", "Fifth"][nonBootIdx - 1] ?? `Item ${nonBootIdx}`;
      label = `${stepN}. ${ord} item`;
    }
    blocks.push({ type: label, items: [itemEntry(id)] });
  }

  if (situational?.length) {
    blocks.push({
      type: "Situational / swap items",
      items: situational.map(itemEntry),
    });
  }

  return blocks;
}

/**
 * Apply a build to the in-game shop as a custom item set.
 *
 * @param {{starters?:number[], coreBuild?:number[], situational?:number[]}} build
 * @param {{championId:number, championName?:string, position?:string}} ctx
 */
export async function applyItemSet(build, { championId, championName, position }) {
  if (!Array.isArray(build?.coreBuild) || build.coreBuild.length < 3) {
    throw new Error(`core build looks incomplete (${build?.coreBuild?.length ?? 0} items)`);
  }

  const { summonerId, wrapper } = await readWrapper();
  const itemSets = Array.isArray(wrapper?.itemSets) ? wrapper.itemSets : [];

  // Filter out previously-managed sets (title prefix match).
  const cleaned = itemSets.filter((s) =>
    !(typeof s?.title === "string" && s.title.startsWith(ITEM_SET_TITLE_PREFIX))
  );

  const positionLabel = position ? ` ${position.toLowerCase()}` : "";
  const newSet = {
    uid: uuid(),
    title: `${ITEM_SET_TITLE_PREFIX}${championName || `champ ${championId}`}${positionLabel}`,
    type: "custom",
    mode: "any",
    map: "any",
    associatedChampions: [championId],
    associatedMaps: [11, 12], // Summoner's Rift + Howling Abyss
    blocks: buildBlocks(build),
    preferredItemSlots: [],
    sortrank: 0,
    startedFrom: "blank",
  };

  await lcu.put(lcuItemSets(summonerId), {
    accountId: wrapper?.accountId ?? 0,
    itemSets: [...cleaned, newSet],
    timestamp: Date.now(),
  });
  log("applied item set", newSet.title, "blocks:", newSet.blocks.length);
  return newSet;
}

/**
 * Wipe every item set (managed AND user-authored). Returns the count
 * deleted. PUT-replaces with an empty array.
 */
export async function clearAllItemSets() {
  const { summonerId, wrapper } = await readWrapper();
  const before = Array.isArray(wrapper?.itemSets) ? wrapper.itemSets.length : 0;
  if (!before) return 0;

  await lcu.put(lcuItemSets(summonerId), {
    accountId: wrapper?.accountId ?? 0,
    itemSets: [],
    timestamp: Date.now(),
  });
  log("cleared all item sets, removed", before);
  return before;
}
