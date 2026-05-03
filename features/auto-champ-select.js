// Auto champ-select actions — driven by the /lol-champ-select/v1/session
// subscription. Two independent automations:
//
//   1. autoLockIn:        when your pick action is in progress AND you've
//                         hovered/selected a champion, POST .../complete to
//                         lock in for you. Uses a small debounce so a fat-
//                         finger tap doesn't lock instantly.
//   2. autoApplyRunes:    when your championId/position pair stabilises, fetch
//                         meta runes and apply the chosen page (most-played
//                         or highest-WR per settings.autoApplyRunePage).
//
// Both feature toggles are read live via store.load() on every event, so
// flipping them in the settings tab takes effect without reload.

import * as lcu from "../lcu.js";
import * as meta from "../lib/meta.js";
import * as store from "../lib/store.js";

const log = (...a) => console.log("[league-lean][auto-cs]", ...a);

const LOCK_IN_DELAY_MS = 600;     // grace period before forcing lock-in
const APPLY_DEBOUNCE_MS = 1200;   // wait for the user to stop changing pick

function findMyPickAction(session) {
  const cellId = session?.localPlayerCellId;
  if (cellId == null || !Array.isArray(session?.actions)) return null;
  for (const phase of session.actions) {
    if (!Array.isArray(phase)) continue;
    for (const action of phase) {
      if (action?.actorCellId === cellId && action?.type === "pick" && !action?.completed) {
        return action;
      }
    }
  }
  return null;
}

function findMyTeammate(session) {
  const cellId = session?.localPlayerCellId;
  if (cellId == null) return null;
  return (session?.myTeam ?? []).find((p) => p?.cellId === cellId) ?? null;
}

export function start({ socket } = {}) {
  if (!socket) {
    log("no socket provided — auto-cs disabled");
    return () => {};
  }
  log("active");

  let lockInTimer = null;
  let applyTimer = null;
  let appliedKey = null;     // `${championId}|${position}|${pageKind}` last applied
  let lockedActionIds = new Set(); // avoid double-completing the same action

  const onSession = async (session) => {
    if (!session) {
      // Champ-select ended — reset memory.
      appliedKey = null;
      lockedActionIds.clear();
      if (lockInTimer) { clearTimeout(lockInTimer); lockInTimer = null; }
      if (applyTimer)  { clearTimeout(applyTimer);  applyTimer  = null; }
      return;
    }

    const settings = store.load();
    const me = findMyTeammate(session);
    const champId = me?.championId || me?.championPickIntent || 0;
    const position = me?.assignedPosition || "";

    // ---- Auto-apply runes + spells + items (one bundle, one apply) ----
    if ((settings.autoApplyRunes || settings.autoApplyItems || settings.autoApplySpells) && champId) {
      const pageKind = settings.autoApplyRunePage === "win" ? "win" : "pick";
      const key = `${champId}|${position}|${pageKind}` +
        `|r${!!settings.autoApplyRunes}|i${!!settings.autoApplyItems}|s${!!settings.autoApplySpells}` +
        `|f${settings.flashSide || "D"}`;
      if (key !== appliedKey) {
        if (applyTimer) clearTimeout(applyTimer);
        applyTimer = setTimeout(async () => {
          const tier = settings.metaTier || "platinum_plus";
          const source = settings.metaSource || "lolalytics";
          const flashSide = settings.flashSide || "D";

          try {
            const champions = await meta.getChampionMap();
            const champ = champions.get(champId);
            const bundle = await meta.fetchChampionBundle({
              championId: champId, position, tier, source,
            });
            const labelMap = { pick: "Most played", win: "Highest winrate" };
            // After dedupe there may be only one page; take whichever matches
            // the user's preference, or the only available.
            const wantedLabel = labelMap[pageKind];
            const page = bundle.pages.find((p) => p.label === wantedLabel)
              || bundle.pages.find((p) => p.label.includes(wantedLabel))
              || bundle.pages[0];
            if (!page) { log("no rune page — skipping"); appliedKey = key; return; }

            await meta.applyComplete(page, {
              championId: champId,
              championName: champ?.name,
              position,
              flashSide,
              alsoSpells: !!settings.autoApplySpells,
              alsoItems:  !!settings.autoApplyItems,
            });
            log(`auto-applied ${page.label} for ${champ?.name ?? champId} ${position}`);
            try {
              globalThis.Toast?.success?.(`league-lean: ${page.label} applied`);
            } catch {}
          } catch (e) {
            log("auto-apply failed", e?.message ?? e);
          }
          appliedKey = key;
        }, APPLY_DEBOUNCE_MS);
      }
    }

    // ---- Auto lock-in ----
    if (settings.autoLockIn) {
      const action = findMyPickAction(session);
      if (action && action.isInProgress && action.championId && !lockedActionIds.has(action.id)) {
        if (lockInTimer) clearTimeout(lockInTimer);
        lockInTimer = setTimeout(async () => {
          try {
            await lcu.post(`/lol-champ-select/v1/session/actions/${action.id}/complete`);
            lockedActionIds.add(action.id);
            log("auto locked-in action", action.id, "championId=", action.championId);
            try { globalThis.Toast?.success?.("league-lean: locked in"); } catch {}
          } catch (e) {
            log("lock-in failed", e?.message);
          }
        }, LOCK_IN_DELAY_MS);
      } else if (action && !action.isInProgress && lockInTimer) {
        // Action turned not-in-progress before timer fired — cancel.
        clearTimeout(lockInTimer);
        lockInTimer = null;
      }
    }
  };

  const unsub = lcu.subscribe(socket, "/lol-champ-select/v1/session", (msg) => {
    const data = msg?.data ?? msg;
    onSession(data);
  });

  // Initial poll in case we're already in champ select when the toggle flips on.
  (async () => {
    try {
      const session = await lcu.get("/lol-champ-select/v1/session");
      onSession(session);
    } catch {}
  })();

  return () => {
    unsub?.();
    if (lockInTimer) clearTimeout(lockInTimer);
    if (applyTimer)  clearTimeout(applyTimer);
  };
}
