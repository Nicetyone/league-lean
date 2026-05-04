// LCU rune-page management.
//
// Riot caps the number of rune pages per account (read from
// /lol-perks/v1/inventory.ownedPageCount). When at the cap, we delete the
// user's *current* page to make room — matches Yimikami's RunePlugin
// behaviour. We never touch user-named pages otherwise; only pages whose
// title starts with `RUNE_PAGE_NAME_PREFIX` are considered ours.

import * as lcu from "../../lcu.js";
import { LCU_PERK_CURRENT_PAGE, LCU_PERK_INVENTORY, LCU_PERK_PAGES, lcuPerkPage } from "../endpoints.js";
import { RUNE_PAGE_NAME_PREFIX } from "../config.js";
import { PERK_TREE } from "../perk-data.js";
import { loggerFor } from "../log.js";

const log = loggerFor("lcu-runes").log;

/**
 * Apply a rune page object `{primaryStyleId, subStyleId, selectedPerkIds}`
 * to the LCU. Steps:
 *   1. Read existing pages.
 *   2. Delete any league-lean managed pages (title starts with our prefix).
 *   3. If at the inventory cap, also delete the *current* page to free a slot.
 *   4. POST the new page with `current: true`.
 *   5. Belt-and-suspenders PUT the new page id as current (some patches
 *      ignore `current: true` on POST).
 *
 * @param {{primaryStyleId:number, subStyleId:number, selectedPerkIds:number[]}} page
 * @param {{label?:string}} ctx
 */
export async function applyRunePage(page, { label } = {}) {
  if (!page?.primaryStyleId || !page?.subStyleId) {
    throw new Error("rune page is missing primary/sub style");
  }
  if (!Array.isArray(page.selectedPerkIds) || page.selectedPerkIds.length < 6) {
    throw new Error(`rune page has only ${page.selectedPerkIds?.length ?? 0} perks (need at least 6)`);
  }

  // LCU rejects non-integer ids silently; coerce + filter.
  const intIds = page.selectedPerkIds.map(Number).filter(Number.isFinite);

  // Sanity: warn when a perk's tree doesn't match the page's primaryStyleId.
  // Rare but happens when sources ship bad data.
  for (const p of intIds.slice(0, 4)) {
    const t = PERK_TREE[p];
    if (t && t !== page.primaryStyleId) {
      log(`WARN perk ${p} belongs to tree ${t}, but primaryStyleId=${page.primaryStyleId}`);
    }
  }
  for (const p of intIds.slice(4, 6)) {
    const t = PERK_TREE[p];
    if (t && t !== page.subStyleId) {
      log(`WARN perk ${p} belongs to tree ${t}, but subStyleId=${page.subStyleId}`);
    }
  }

  let pages;
  try { pages = await lcu.get(LCU_PERK_PAGES); }
  catch (e) { throw new Error(`couldn't list rune pages: ${e?.message ?? e}`); }
  if (!Array.isArray(pages)) pages = [];

  // Drop any pages we previously created.
  for (const p of pages) {
    if (typeof p?.name === "string" && p.name.startsWith(RUNE_PAGE_NAME_PREFIX) && p.id != null) {
      try { await lcu.del(lcuPerkPage(p.id)); }
      catch (e) { log("delete league-lean page failed", p.id, e?.message); }
    }
  }

  // Refresh + check the cap. If full, delete the user's current page.
  let refreshed;
  try { refreshed = await lcu.get(LCU_PERK_PAGES); }
  catch (e) { throw new Error(`couldn't refresh page list: ${e?.message ?? e}`); }

  let inventory = null;
  try { inventory = await lcu.get(LCU_PERK_INVENTORY); } catch {}
  const max = inventory?.ownedPageCount ?? 2;

  if (refreshed.length >= max) {
    log(`at page cap (${refreshed.length}/${max}); freeing the current page`);
    try {
      const current = await lcu.get(LCU_PERK_CURRENT_PAGE);
      const victim = current?.id ?? refreshed[0]?.id;
      if (victim != null) await lcu.del(lcuPerkPage(victim));
    } catch (e) {
      throw new Error(`page cap reached and cleanup failed: ${e?.message ?? e}`);
    }
  }

  const body = {
    name: `${RUNE_PAGE_NAME_PREFIX}${label || "auto"}`,
    primaryStyleId: page.primaryStyleId,
    subStyleId: page.subStyleId,
    selectedPerkIds: intIds,
    current: true,
    order: 0,
  };

  let created;
  try { created = await lcu.post(LCU_PERK_PAGES, body); }
  catch (e) {
    log("create rune page failed; body sent:", JSON.stringify(body));
    throw new Error(`create rune page failed: ${e?.message ?? e}`);
  }
  log("applied rune page id=", created?.id, "name=", body.name, "perkCount=", body.selectedPerkIds.length);

  if (created?.id != null) {
    try { await lcu.put(LCU_PERK_CURRENT_PAGE, { id: created.id }); }
    catch (e) { log("set currentpage failed (non-fatal)", e?.message); }
  }
  return created;
}
