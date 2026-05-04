// Champion tab — the per-champion deep-dive panel.
//
// Renders rune pages, stats, counters, build sequence, skill order, and a
// browse-all-builds dropdown for the active selection (champ-select pick or
// a row click from the Meta tab). Apply buttons drive lib/champion-bundle's
// applyComplete / applyAltBuild against the LCU.

import * as store from "../../../lib/store.js";
import * as meta from "../../../lib/meta.js";
import * as icons from "../../../lib/icons.js";
import { getChampions, derivedTier } from "../util.js";

const log = (...a) => console.log("[league-lean][sidebar:champion]", ...a);

let lastFetchKey = "";
let runesPayload = null;

export function setSelection(_champ, _pos) {
  // Force a re-fetch on next render. We intentionally don't cache by champ
  // here — the fetchKey in render() (champion + position + tier + source)
  // is the authoritative cache key.
  lastFetchKey = "";
}

export async function render(container, { champion, position, isBrowse, hasChampSelect, onBackToChampSelect }) {
  if (!champion) {
    container.innerHTML = `<div class="ll-empty">Pick a champion in champ select, or click any row in the Meta tab to view its build.</div>`;
    return;
  }
  const settings = store.load();
  const tier = settings.metaTier || "platinum_plus";
  const source = settings.metaSource || "lolalytics";
  const fetchKey = `${champion.id}|${position}|${tier}|${source}`;
  const portrait = icons.championPortraitUrl(champion.id);
  const laneSvg = position ? icons.positionSvg(position.toLowerCase()) : "";

  container.innerHTML = `
    ${isBrowse && hasChampSelect ? `
      <div class="ll-back-bar">
        <button class="ll-back-btn">← Back to my pick</button>
        <span class="ll-browse-label">browsing</span>
      </div>` : ""}
    <div class="ll-section">
      <div class="ll-champ-header">
        <img class="ll-champ-portrait" src="${portrait}" alt="${champion.name}">
        <div class="ll-champ-meta">
          <div class="ll-champ-name">${champion.name}</div>
          <div class="ll-champ-sub">
            ${laneSvg ? `<span class="ll-lane-mini">${laneSvg}</span>` : ""}
            <span>${(position || "default").toLowerCase()}</span>
            <span class="ll-dot">·</span>
            <span>${tier}</span>
            <span class="ll-source-badge">…</span>
          </div>
        </div>
      </div>
    </div>

    <div class="ll-section">
      <h4>Champion strength</h4>
      <div class="ll-stat-grid">
        <div class="ll-stat"><span class="ll-stat-label">TIER</span><span class="ll-stat-val ll-tier-letter">—</span></div>
        <div class="ll-stat"><span class="ll-stat-label">WR</span><span class="ll-stat-val ll-wr">—</span></div>
        <div class="ll-stat"><span class="ll-stat-label">PR</span><span class="ll-stat-val ll-pr">—</span></div>
        <div class="ll-stat"><span class="ll-stat-label">BR</span><span class="ll-stat-val ll-br">—</span></div>
      </div>
    </div>

    <div class="ll-section">
      <h4>Rune pages</h4>
      <div class="ll-rune-pages"><div class="ll-loading">fetching…</div></div>
    </div>

    <div class="ll-section">
      <h4>Matchups</h4>
      <div class="ll-counter-grid">
        <div>
          <div class="ll-stat-label" style="margin-bottom:4px;">STRONG vs</div>
          <div class="ll-counter-list ll-strong"><div class="ll-loading">fetching…</div></div>
        </div>
        <div>
          <div class="ll-stat-label" style="margin-bottom:4px;">WEAK vs</div>
          <div class="ll-counter-list ll-weak"><div class="ll-loading">fetching…</div></div>
        </div>
      </div>
    </div>

    <div class="ll-section">
      <h4>Browse</h4>
      <div class="ll-deeplinks"></div>
    </div>
  `;

  const backBtn = container.querySelector(".ll-back-btn");
  if (backBtn && onBackToChampSelect) {
    backBtn.addEventListener("click", () => onBackToChampSelect());
  }

  const dl = meta.deeplinks({ championKey: champion.alias || champion.name, position });
  container.querySelector(".ll-deeplinks").innerHTML = `
    <a href="${dl.lolalytics}" target="_blank">lolalytics</a>
    <a href="${dl.ugg}" target="_blank">u.gg</a>
    <a href="${dl.metasrc}" target="_blank">metasrc</a>
    <a href="${dl.mobalytics}" target="_blank">mobalytics</a>
    <a href="${dl.opgg}" target="_blank">op.gg</a>
    <a href="${dl.probuilds}" target="_blank">probuilds</a>
  `;

  if (fetchKey === lastFetchKey && runesPayload) {
    // Use cached, redraw.
    await paintRunes(container, runesPayload);
  }

  if (fetchKey === lastFetchKey) return;
  lastFetchKey = fetchKey;

  const [runesR, countersR] = await Promise.allSettled([
    meta.fetchChampionBundle({ championId: champion.id, position, tier, source })
      .then((b) => ({ ...b, championId: champion.id, championName: champion.name, position })),
    meta.fetchCounters({ championId: champion.id, position, tier }),
  ]);

  if (runesR.status === "fulfilled") {
    runesPayload = runesR.value;
    container.querySelector(".ll-source-badge").textContent = runesPayload.source;
    await paintRunes(container, runesPayload);
  } else {
    container.querySelector(".ll-rune-pages").innerHTML =
      `<div class="ll-empty">runes unavailable: ${runesR.reason?.message ?? runesR.reason}</div>`;
    container.querySelector(".ll-source-badge").textContent = "n/a";
  }

  if (countersR.status === "fulfilled" && countersR.value) {
    paintCounters(container, countersR.value);
  } else {
    container.querySelector(".ll-strong").innerHTML = `<div class="ll-empty">no data</div>`;
    container.querySelector(".ll-weak").innerHTML = `<div class="ll-empty">no data</div>`;
  }
}

async function paintRunes(container, payload) {
  // Ensure the perks.json icon map is loaded before we build URLs.
  // Without this, the very first render after sidebar open returns "" for
  // every perkIconUrl() and we get empty circles.
  await icons.preload();

  const host = container.querySelector(".ll-rune-pages");
  if (!host) return;
  if (!payload?.pages?.length) {
    host.innerHTML = `<div class="ll-empty">no rune pages</div>`;
    return;
  }

  // Map labels → indices so we can pick the user's preferred page first.
  const labelOf = (p) => String(p.label || "").toLowerCase();
  const idxFor = (kind) => {
    const want = kind === "win" ? "highest winrate" : "most played";
    const direct = payload.pages.findIndex((p) => labelOf(p).startsWith(want));
    return direct >= 0 ? direct : 0;
  };

  function paintActive() {
    const settings = store.load();
    const preferred = settings.autoApplyRunePage === "win" ? "win" : "pick";
    const activeIdx = payload.pages.length === 1 ? 0 : idxFor(preferred);

    const tabsHtml = payload.pages.length <= 1 ? "" : `
      <div class="ll-rune-toggle">
        ${payload.pages.map((p, i) => {
          // Map page label → setting value, used to persist toggle clicks.
          const kind = labelOf(p).startsWith("highest") ? "win" : "pick";
          const short = kind === "win" ? "Highest winrate" : "Most played";
          return `<button class="ll-rune-toggle-btn ${i === activeIdx ? "ll-active" : ""}" data-toggle-kind="${kind}">${short}</button>`;
        }).join("")}
      </div>
    `;

    host.innerHTML = tabsHtml + renderPageCard(payload.pages[activeIdx], activeIdx);
  }

  paintActive();

  host.addEventListener("click", async (e) => {
    const tab = e.target.closest("[data-toggle-kind]");
    if (tab) {
      const kind = tab.dataset.toggleKind;
      store.save({ autoApplyRunePage: kind });
      paintActive();
      return;
    }

    // "Browse all builds" → Apply on a specific alt build row.
    const altBtn = e.target.closest("[data-build-apply]");
    if (altBtn) {
      const idx = parseInt(altBtn.dataset.buildApply, 10);
      const activePage = payload.pages[
        payload.pages.length === 1 ? 0
          : (store.load().autoApplyRunePage === "win" ? 1 : 0)
      ] || payload.pages[0];
      const alt = (activePage?.build?.allBuilds || [])[idx];
      if (!alt) return;
      altBtn.disabled = true;
      const orig = altBtn.textContent;
      altBtn.textContent = "applying…";
      try {
        await meta.applyAltBuild(alt.items, activePage.build, {
          championId: payload.championId,
          championName: payload.championName,
          position: payload.position,
        });
        altBtn.textContent = "applied ✓";
        try { globalThis.Toast?.success?.("league-lean: build applied"); } catch {}
      } catch (err) {
        altBtn.textContent = `failed: ${err?.message ?? err}`;
        log("alt-build apply failed", err);
      } finally {
        setTimeout(() => { altBtn.disabled = false; altBtn.textContent = orig; }, 1500);
      }
      return;
    }

    const btn = e.target.closest("[data-apply-idx]");
    if (!btn) return;
    const idx = parseInt(btn.dataset.applyIdx, 10);
    const page = payload.pages[idx];
    if (!page) return;
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "applying…";
    try {
      const settings = store.load();
      await meta.applyComplete(page, {
        championId: payload.championId,
        championName: payload.championName,
        position: payload.position,
        flashSide: settings.flashSide || "D",
        alsoSpells: true,
        alsoItems: true,
      });
      btn.textContent = "applied ✓";
      try { globalThis.Toast?.success?.("league-lean: page + spells + build applied"); } catch {}
    } catch (err) {
      btn.textContent = `failed: ${err?.message ?? err}`;
      log("apply failed", err);
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = orig;
      }, 1800);
    }
  }, { once: false });
}

function renderPageCard(page, i) {
  const perks  = page.selectedPerkIds || [];
  const runes  = perks.slice(0, 6);
  const shards = perks.slice(6);
  const styleIco = icons.styleIconUrl(page.primaryStyleId);

  // Summoner spells — arrange Flash on user's preferred slot.
  const settings = store.load();
  const flashSide = settings.flashSide || "D";
  const arranged  = page.spells?.length >= 2
    ? meta.arrangeSpells(page.spells, flashSide)
    : null;
  const spellsHtml = arranged ? `
    <div class="ll-card-section ll-spells">
      ${[arranged.spell1Id, arranged.spell2Id].map((id, idx) => `
        <div class="ll-spell">
          <img src="${icons.summonerSpellIconUrl(id)}" alt="${id}" title="spell ${id}">
          <span class="ll-spell-key">${idx === 0 ? flashSide : (flashSide === "D" ? "F" : "D")}</span>
        </div>
      `).join("")}
    </div>
  ` : "";

  // Build sequence: starters → ordered core (first → boots → 2nd → … → 5th).
  // coreBuild already has boots embedded in their typical slot.
  const b = page.build || {};
  const buildSeq = [
    ...((b.starters  || []).slice(0, 2)),
    ...((b.coreBuild || []).slice(0, 6)),
  ];
  const dedupedSeq = [...new Set(buildSeq)];
  const buildHtml = dedupedSeq.length ? `
    <div class="ll-card-section ll-build-seq">
      ${dedupedSeq.map((id, idx) => `
        ${idx > 0 ? `<span class="ll-arrow">›</span>` : ""}
        <img class="ll-build-item" src="${icons.itemIconUrl(id)}" title="item ${id}" alt="${id}">
      `).join("")}
    </div>
  ` : "";

  // Skill order — short string like "QEW" gives priority order.
  const skillHtml = page.skillOrder ? `
    <div class="ll-card-section ll-skill">
      <span class="ll-skill-label">Skill priority</span>
      ${page.skillOrder.split("").map((s) => `<span class="ll-skill-key">${s}</span>`).join("")}
    </div>
  ` : "";

  // Browse-all-builds dropdown. Each row is a 5-item path with WR/games and
  // an Apply button that swaps the in-game item set to that build.
  const all = Array.isArray(b.allBuilds) ? b.allBuilds : [];
  const browseHtml = all.length ? `
    <details class="ll-card-section ll-build-browser">
      <summary>Browse all builds (${all.length})</summary>
      <div class="ll-build-list">
        ${all.map((bld, idx) => `
          <div class="ll-build-row" data-build-idx="${idx}">
            <div class="ll-build-row-items">
              ${bld.items.map((id, i) => `
                ${i > 0 ? `<span class="ll-arrow">›</span>` : ""}
                <img class="ll-build-item" src="${icons.itemIconUrl(id)}" title="item ${id}" alt="${id}">
              `).join("")}
            </div>
            <div class="ll-build-row-stats">
              <span class="ll-build-row-wr">${(+bld.wr).toFixed(1)}%</span>
              <span class="ll-build-row-n">${(+bld.picks).toLocaleString()}g</span>
            </div>
            <button class="ll-build-row-apply" data-build-apply="${idx}">Apply</button>
          </div>
        `).join("")}
      </div>
    </details>
  ` : "";

  return `
    <div class="ll-rune-card" data-page-idx="${i}">
      <div class="ll-rune-card-head">
        <div class="ll-rune-card-title">
          ${styleIco ? `<img src="${styleIco}" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;">` : ""}
          ${page.label}
        </div>
        <div class="ll-rune-card-meta">
          ${page.wr != null ? `${(+page.wr).toFixed(2)}% WR` : ""}
          ${page.n != null ? ` · ${(+page.n).toLocaleString()} games` : ""}
        </div>
      </div>
      <div class="ll-rune-perks">
        ${runes.map((id) => {
          const url = icons.perkIconUrl(id);
          return url
            ? `<img class="ll-rune-perk" title="perk ${id}" src="${url}" alt="${id}">`
            : `<div class="ll-rune-perk ll-rune-perk-missing" title="perk ${id} (no icon)">${id}</div>`;
        }).join("")}
      </div>
      <div class="ll-rune-perks">
        ${shards.map((id) => {
          const url = icons.shardIconUrl(id);
          return url
            ? `<img class="ll-rune-perk ll-shard" title="shard ${id}" src="${url}" alt="${id}">`
            : `<div class="ll-rune-perk ll-shard ll-rune-perk-missing" title="shard ${id}">${id}</div>`;
        }).join("")}
      </div>
      ${spellsHtml}
      ${buildHtml}
      ${skillHtml}
      ${browseHtml}
      <button class="ll-apply" data-apply-idx="${i}">Apply runes + spells + build</button>
    </div>
  `;
}

async function paintCounters(container, counters) {
  const champions = await getChampions();
  const fmtRow = async (c) => {
    const champ = champions.get(c.cid);
    const name = champ?.name ?? `#${c.cid}`;
    const portrait = icons.championPortraitUrl(c.cid);
    const wr = c.vsWr != null ? `${(+c.vsWr).toFixed(1)}%` : "—";
    return `
      <div class="ll-counter-row">
        <span class="ll-counter-champ">
          <img class="ll-portrait" src="${portrait}" alt="${name}">
          <span class="ll-counter-name">${name}</span>
        </span>
        <span class="ll-counter-wr">${wr}</span>
      </div>
    `;
  };

  container.querySelector(".ll-strong").innerHTML =
    (await Promise.all(counters.strongAgainst.slice(0, 5).map(fmtRow))).join("") || "—";
  container.querySelector(".ll-weak").innerHTML =
    (await Promise.all(counters.weakAgainst.slice(0, 5).map(fmtRow))).join("") || "—";

  const wr = container.querySelector(".ll-wr");
  const pr = container.querySelector(".ll-pr");
  const br = container.querySelector(".ll-br");
  const tl = container.querySelector(".ll-tier-letter");
  const s = counters.stats || {};
  if (wr) wr.textContent = s.wr != null ? `${(+s.wr).toFixed(1)}%` : "—";
  if (pr) pr.textContent = s.pr != null ? `${(+s.pr).toFixed(1)}%` : "—";
  if (br) br.textContent = s.br != null ? `${(+s.br).toFixed(1)}%` : "—";
  if (tl) {
    const letter = derivedTier(s.wr, s.pr);
    tl.textContent = letter ?? "—";
    if (letter) tl.setAttribute("data-tier", letter);
  }
}
