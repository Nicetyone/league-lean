// Settings tab — toggles, dropdowns, danger actions, and the in-app
// version + update-check panel.
//
// Field/option lists are declarative so adding a new setting is one entry.

import * as store from "../../../lib/store.js";
import * as meta from "../../../lib/meta.js";
import * as updater from "../../../lib/updater.js";
import * as selfUpdate from "../../../lib/self-update.js";
import * as postGame from "../../post-game-opgg.js";

const FIELDS = [
  { key: "autoAccept",      label: "Auto-accept queue" },
  { key: "autoLockIn",      label: "Auto lock-in champion" },
  { key: "autoApplyRunes",  label: "Auto-apply runes on pick" },
  { key: "autoApplyItems",  label: "Auto-apply build (item set)" },
  { key: "autoApplySpells", label: "Auto-apply summoner spells" },
  { key: "autoHonor",       label: "Auto-honor top-gold teammate" },
  { key: "postGameOpgg",    label: "Post-game op.gg buttons" },
  { key: "homeCleanup",     label: "Home cleanup" },
  { key: "performanceMode", label: "Performance mode" },
];

const SELECTS = [
  {
    key: "autoApplyRunePage", label: "Auto-apply page",
    options: [
      ["pick", "Most played"],
      ["win",  "Highest winrate"],
    ],
  },
  {
    key: "flashSide", label: "Flash key",
    options: [
      ["D", "D (left slot)"],
      ["F", "F (right slot)"],
    ],
  },
  {
    key: "metaTier", label: "Meta tier",
    options: [
      ["all",            "All ranks"],
      ["platinum_plus",  "Plat+"],
      ["emerald_plus",   "Emerald+"],
      ["diamond_plus",   "Diamond+"],
      ["master_plus",    "Master+"],
      ["challenger",     "Challenger"],
    ],
  },
  {
    key: "updateBranch", label: "Update channel",
    options: [
      ["main", "Stable (main)"],
      ["dev",  "Experimental (dev)"],
    ],
  },
];

export function render(container, onChange) {
  const s = store.load();
  const v = updater.installedVersion();
  container.innerHTML = `
    <div class="ll-settings">
      ${FIELDS.map((f) => `
        <label>
          <span>${f.label}</span>
          <input type="checkbox" data-key="${f.key}" ${s[f.key] ? "checked" : ""}>
        </label>
      `).join("")}
      <hr/>
      ${SELECTS.map((sel) => `
        <label>
          <span>${sel.label}</span>
          <select data-key="${sel.key}">
            ${sel.options.map(([v, lbl]) =>
              `<option value="${v}" ${s[sel.key] === v ? "selected" : ""}>${lbl}</option>`
            ).join("")}
          </select>
        </label>
      `).join("")}
      <div class="ll-source-row">
        <span>Source</span>
        <span class="ll-source-value">Lolalytics → U.GG <span class="ll-source-detail">(auto-fallback)</span></span>
      </div>
      <hr/>
      <div class="ll-settings-actions">
        <button class="ll-action-btn" data-action="match-history">Open match history</button>
        <button class="ll-action-btn ll-danger-btn" data-action="clear-item-sets">Clear ALL item sets</button>
        <div class="ll-action-detail">Wipes every custom item set for your summoner — both league-lean's and your own hand-made ones. Use when the in-game shop is cluttered.</div>
        <div class="ll-action-status ll-clear-status"></div>
      </div>
      <hr/>
      <div class="ll-version">
        <div class="ll-version-row">
          <span>Installed</span>
          <span class="ll-version-installed">${v.shortSha || "dev"}${v.branch && v.branch !== "main" ? ` · <span style="color:#ffd166;">${v.branch}</span>` : ""}${v.date ? ` · ${v.date.slice(0,10)}` : ""}</span>
        </div>
        <div class="ll-version-row">
          <span>Latest</span>
          <span class="ll-version-latest">click "Check for updates"</span>
        </div>
        <button class="ll-action-btn" data-action="check-update">Check for updates</button>
        <div class="ll-update-steps" style="display:none;">
          <div class="ll-step-detail" style="margin-top:6px;">
            Run <code>install-league-lean.bat</code> in your plugins folder, then press <code>Alt+Shift+R</code> in the League client.
          </div>
          <button class="ll-action-btn" data-action="open-folder" style="margin-top:8px;">Open plugins folder</button>
        </div>
        <div class="ll-update-status"></div>
      </div>
    </div>
  `;

  container.addEventListener("change", async (e) => {
    const t = e.target;
    if (!t?.dataset?.key) return;
    const value = t instanceof HTMLInputElement && t.type === "checkbox"
      ? t.checked
      : t.value;
    store.save({ [t.dataset.key]: value });
    await onChange?.(t.dataset.key, value);
  });

  container.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "match-history") {
      await postGame.openMatchHistory();
    }
    if (btn.dataset.action === "clear-item-sets") {
      const status = container.querySelector(".ll-clear-status");
      if (!confirm("This will delete EVERY custom item set for your summoner — including ones you made yourself. Continue?")) return;
      if (status) status.textContent = "clearing…";
      btn.disabled = true;
      try {
        const removed = await meta.clearAllItemSets();
        if (status) status.textContent = removed
          ? `cleared ${removed} item set${removed === 1 ? "" : "s"}`
          : "no item sets to clear";
      } catch (e) {
        if (status) status.textContent = `failed: ${e?.message ?? e}`;
      } finally {
        btn.disabled = false;
        setTimeout(() => { if (status) status.textContent = ""; }, 4000);
      }
    }
    if (btn.dataset.action === "check-update") {
      const latestEl = container.querySelector(".ll-version-latest");
      const stepsEl  = container.querySelector(".ll-update-steps");
      latestEl.textContent = "checking…";
      if (stepsEl) stepsEl.style.display = "none";
      const res = await updater.checkForUpdate();
      const showSteps = () => { if (stepsEl) stepsEl.style.display = ""; };

      if (res.error) {
        latestEl.textContent = `error: ${res.error}`;
      } else if (res.isDev) {
        latestEl.textContent = `${res.latest.shortSha} on ${res.branch} (dev install)`;
        showSteps();
      } else if (res.upToDate) {
        latestEl.innerHTML = `${res.latest.shortSha} on <strong>${res.branch}</strong> — up to date ✓`;
      } else if (res.branchChanged) {
        latestEl.innerHTML = `${res.latest.shortSha} on <strong style="color:#ffd166;">${res.branch}</strong> — <strong style="color:#ffd166;">switch branches</strong>`;
        showSteps();
      } else if (res.behind) {
        latestEl.innerHTML = `${res.latest.shortSha} on <strong>${res.branch}</strong> — <strong style="color:#ffd166;">update available</strong>`;
        showSteps();
      }
    }
    if (btn.dataset.action === "open-folder") {
      selfUpdate.openPluginsFolder();
    }
  });
}
