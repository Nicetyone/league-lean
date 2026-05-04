// Collapsible sidebar with three tabs: Champion / Meta / Settings.
//
// - Pinned to the right edge of the screen.
// - Collapsed = thin tab strip (24px). Click handle to expand to ~380px.
// - Champion tab is only enabled during champ select; otherwise greyed out.
// - Meta tab shows the tier list per lane (Top / Jungle / Mid / ADC / Support),
//   color-coded letter tiers (S+ → D), sortable rows.
// - Settings tab carries the existing toggles + meta source / tier dropdowns.
//
// Layout split (Phase 3 refactor):
//   features/sidebar/constants.js  — SHELL_ID, STYLE_ID, TABS, LANES, icons
//   features/sidebar/styles.js     — CSS template + ensureStyle
//   features/sidebar/util.js       — getChampions cache, derivedTier
//   features/sidebar/tabs/*.js     — one file per tab (champion/meta/settings)
//   features/sidebar.js            — this file: shell, popout, champ-select wiring

import * as lcu from "../lcu.js";
import { SHELL_ID, TABS, TAB_ICONS } from "./sidebar/constants.js";
import { CSS, ensureStyle } from "./sidebar/styles.js";
import { getChampions } from "./sidebar/util.js";
import * as icons from "../lib/icons.js";
import * as championTab from "./sidebar/tabs/champion.js";
import * as metaTab     from "./sidebar/tabs/meta.js";
import * as settingsTab from "./sidebar/tabs/settings.js";

const log = (...a) => console.log("[league-lean][sidebar]", ...a);

export function start({ socket, onSettingChange } = {}) {
  ensureStyle();

  let activeTab = "champion";
  let isOpen = false;
  let csSession = null; // current /lol-champ-select/v1/session payload, or null
  let mySelection = null; // { champion, position } when in champ select
  let browseSelection = null; // override when user clicks a champ from Meta

  const shell = document.createElement("div");
  shell.id = SHELL_ID;
  shell.innerHTML = `
    <div class="ll-tabs">
      ${TABS.map((t) => `
        <button class="ll-tab ${t.key === activeTab ? "ll-active" : ""}" data-tab="${t.key}">
          ${TAB_ICONS[t.key] || ""}<span>${t.label}</span>
        </button>
      `).join("")}
      <button class="ll-popout-btn" data-action="pop-out" title="Open in a separate window">${TAB_ICONS.pop_out}</button>
    </div>
    <div class="ll-content"></div>
    <div class="ll-popup-resizer" title="Drag to resize"></div>
  `;

  const toggleBtn = document.createElement("div");
  toggleBtn.id = `${SHELL_ID}-toggle`;
  toggleBtn.title = "league-lean";
  toggleBtn.innerHTML = TAB_ICONS.toggle_open;

  document.documentElement.appendChild(shell);
  document.documentElement.appendChild(toggleBtn);
  icons.preload(); // warm the perks.json cache

  // ---- pop-out window mode -----
  // Pengu's CEF lets us spawn a detached OS-level window via window.open.
  // We adopt the shell DOM into the popup's document (preserving event
  // listeners and state) so all the running JS in the main window keeps
  // driving it. Closing the popup snaps the shell back into the in-client.
  let popupRef = null;
  let popupSize = { w: 420, h: 920 };

  function popOut() {
    if (popupRef && !popupRef.closed) { try { popupRef.focus(); } catch {} return; }
    let popup;
    try {
      popup = window.open("about:blank", "leagueLeanPopup",
        `width=${popupSize.w},height=${popupSize.h},left=80,top=80,resizable=yes`);
    } catch (e) { log("popup open threw", e); return; }
    if (!popup) { log("popup blocked"); return; }
    popupRef = popup;

    try {
      const invoke = (name, params = []) => popup.riotInvoke?.({
        request: JSON.stringify({ name, params }),
      });
      invoke("Window.ResizeTo", [popupSize.w, popupSize.h]);
      invoke("Window.CenterToScreen");
      invoke("Window.Show");
    } catch {}

    popup.document.open();
    popup.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<title>league-lean</title><style>${CSS}</style></head>` +
      `<body style="margin:0;padding:0;background:rgba(10,18,26,0.97);color:#f0e6d2;"></body></html>`
    );
    popup.document.close();

    try {
      const adopted = popup.document.adoptNode(shell);
      shell.classList.add("ll-popup-host", "ll-open");
      popup.document.body.appendChild(adopted);
    } catch (e) {
      log("adoptNode failed", e); popup.close(); popupRef = null; return;
    }

    toggleBtn.style.display = "none";
    setPopOutBtn(true);
    attachPopupResizeHandlers(popup);

    popup.addEventListener("beforeunload", () => popIn());
    log("popped out");
  }

  function popIn() {
    if (!popupRef) return;
    try {
      const adopted = document.adoptNode(shell);
      document.documentElement.appendChild(adopted);
    } catch (e) { log("adopt back failed", e); }
    shell.classList.remove("ll-popup-host");
    toggleBtn.style.display = "";
    setPopOutBtn(false);
    try { if (popupRef && !popupRef.closed) popupRef.close(); } catch {}
    popupRef = null;
    log("popped in");
  }

  function setPopOutBtn(poppedOut) {
    const btn = shell.querySelector(".ll-popout-btn");
    if (!btn) return;
    btn.innerHTML = poppedOut ? TAB_ICONS.pop_in : TAB_ICONS.pop_out;
    btn.dataset.action = poppedOut ? "pop-in" : "pop-out";
    btn.title = poppedOut ? "Return to in-client sidebar" : "Open in a separate window";
  }

  // ----- Resizable popup -----
  // CEF popups inherit borderless window chrome, so OS-level resize handles
  // aren't there. We add a corner grip in the bottom-right that drives
  // riotInvoke('Window.ResizeTo') as the cursor moves. screenX/screenY
  // give us screen-space coords that survive the window being moved around.
  function attachPopupResizeHandlers(popup) {
    const grip = popup.document.querySelector(".ll-popup-resizer");
    if (!grip) return;
    let dragging = false, sX = 0, sY = 0, sW = 0, sH = 0;
    const invokeResize = (w, h) => {
      try {
        popup.riotInvoke?.({ request: JSON.stringify({
          name: "Window.ResizeTo", params: [Math.round(w), Math.round(h)],
        })});
      } catch {}
    };
    grip.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      sX = e.screenX; sY = e.screenY;
      sW = popupSize.w; sH = popupSize.h;
      e.preventDefault(); e.stopPropagation();
    });
    popup.document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const w = Math.max(320, sW + (e.screenX - sX));
      const h = Math.max(400, sH + (e.screenY - sY));
      popupSize = { w, h };
      invokeResize(w, h);
    });
    popup.document.addEventListener("mouseup", () => { dragging = false; });
    popup.addEventListener("blur",  () => { dragging = false; });
  }

  const tabBar = shell.querySelector(".ll-tabs");
  const content = shell.querySelector(".ll-content");

  function setOpen(v) {
    isOpen = v;
    shell.classList.toggle("ll-open", v);
    toggleBtn.classList.toggle("ll-open", v);
    toggleBtn.innerHTML = v ? TAB_ICONS.toggle_close : TAB_ICONS.toggle_open;
    if (v) renderActive();
  }

  toggleBtn.addEventListener("click", () => setOpen(!isOpen));

  tabBar.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]");
    if (action) {
      if (action.dataset.action === "pop-out") popOut();
      else if (action.dataset.action === "pop-in") popIn();
      return;
    }
    const t = e.target.closest("[data-tab]");
    if (!t || t.disabled) return;
    activeTab = t.dataset.tab;
    if (activeTab === "champion") browseSelection = null;
    for (const el of tabBar.querySelectorAll(".ll-tab")) {
      el.classList.toggle("ll-active", el.dataset.tab === activeTab);
    }
    renderActive();
  });

  function effectiveSelection() {
    return browseSelection || mySelection;
  }

  function updateChampTabAvailability() {
    const champTab = tabBar.querySelector('[data-tab="champion"]');
    if (!champTab) return;
    if (effectiveSelection()?.champion) {
      champTab.removeAttribute("disabled");
    } else {
      champTab.setAttribute("disabled", "");
      if (activeTab === "champion") {
        activeTab = "meta";
        for (const el of tabBar.querySelectorAll(".ll-tab")) {
          el.classList.toggle("ll-active", el.dataset.tab === activeTab);
        }
      }
    }
  }

  function browseChampion(sel) {
    browseSelection = sel;
    activeTab = "champion";
    for (const el of tabBar.querySelectorAll(".ll-tab")) {
      el.classList.toggle("ll-active", el.dataset.tab === activeTab);
    }
    updateChampTabAvailability();
    renderActive();
  }

  function backToChampSelect() {
    browseSelection = null;
    updateChampTabAvailability();
    renderActive();
  }

  async function renderActive() {
    if (!isOpen) return;
    if (activeTab === "champion") {
      const sel = effectiveSelection();
      const isBrowse = !!browseSelection;
      championTab.setSelection(sel?.champion, sel?.position);
      await championTab.render(content, {
        ...(sel || {}),
        isBrowse,
        hasChampSelect: !!mySelection,
        onBackToChampSelect: backToChampSelect,
      });
    } else if (activeTab === "meta") {
      await metaTab.render(content, { onChampionClick: browseChampion });
    } else if (activeTab === "settings") {
      settingsTab.render(content, async (key, value) => {
        await onSettingChange?.(key, value);
      });
    }
  }

  // Champ select session subscriber.
  let lastLockedId = 0;
  async function syncSelection(session) {
    csSession = session;
    if (!session) {
      mySelection = null;
      lastLockedId = 0;
      updateChampTabAvailability();
      return;
    }
    const cellId = session.localPlayerCellId;
    const me = (session.myTeam ?? []).find((p) => p?.cellId === cellId);
    const lockedId = me?.championId || 0;
    const intentId = me?.championPickIntent || 0;
    const champId  = lockedId || intentId;
    if (!champId) {
      mySelection = null;
      lastLockedId = 0;
      updateChampTabAvailability();
      return;
    }
    const champions = await getChampions();
    const champion = champions.get(champId);
    const newSel = { champion, position: me?.assignedPosition || "" };
    const changed = !mySelection
      || mySelection.champion?.id !== newSel.champion?.id
      || mySelection.position !== newSel.position;
    mySelection = newSel;
    // When champ select fires a fresh pick, drop the browse override so the
    // user sees their actual matchup.
    if (changed) browseSelection = null;
    updateChampTabAvailability();

    // ----- Auto-focus on lock-in -----
    // When `championId` (the locked-in id, distinct from `championPickIntent`)
    // transitions from 0 → set, we yank the user to the Champion tab so they
    // immediately see their actual matchup. Hover-only intent changes do NOT
    // trigger an auto-switch — the user keeps whatever tab they're on.
    const justLockedIn = lockedId !== 0 && lockedId !== lastLockedId;
    lastLockedId = lockedId;
    if (justLockedIn) {
      activeTab = "champion";
      for (const el of tabBar.querySelectorAll(".ll-tab")) {
        el.classList.toggle("ll-active", el.dataset.tab === activeTab);
      }
      // Force the sidebar open on lock-in so the user sees their build
      // immediately. setOpen() is a no-op if already open + correctly sets
      // the toggle button position relative to the (possibly resized) shell.
      if (!isOpen) setOpen(true);
      else renderActive();
    } else if (changed && isOpen && activeTab === "champion") {
      renderActive();
    }
  }

  let unsub = null;
  if (socket) {
    unsub = lcu.subscribe(socket, "/lol-champ-select/v1/session", (msg) => {
      const data = msg?.data ?? msg;
      if (data) syncSelection(data);
    });
  }
  // Also poll once on start to catch already-in-champ-select case.
  (async () => {
    try {
      const session = await lcu.get("/lol-champ-select/v1/session");
      syncSelection(session);
    } catch {
      // not in champ select — that's fine.
      mySelection = null;
      updateChampTabAvailability();
    }
  })();

  // When champ select ends, the session GET 404s.
  const exitPoller = setInterval(async () => {
    if (!csSession) return;
    try {
      await lcu.get("/lol-champ-select/v1/session");
    } catch {
      syncSelection(null);
    }
  }, 5000);

  // Reattach on Riot view-router wipes. While popped out, the shell lives in
  // the popup's document — don't fight that.
  const reattachObserver = new MutationObserver(() => {
    if (popupRef && !popupRef.closed) return;
    if (!document.contains(shell)) {
      document.documentElement.appendChild(shell);
    }
    if (!document.contains(toggleBtn)) {
      document.documentElement.appendChild(toggleBtn);
    }
  });
  reattachObserver.observe(document.documentElement, { childList: true, subtree: false });

  log("active");

  return () => {
    unsub?.();
    clearInterval(exitPoller);
    reattachObserver.disconnect();
    if (popupRef && !popupRef.closed) { try { popupRef.close(); } catch {} }
    popupRef = null;
    shell.remove();
    toggleBtn.remove();
  };
}
