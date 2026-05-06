// Auto champ-select actions — driven by /lol-champ-select/v1/session.
//
// Two trigger models, picked by the autoLockIn toggle:
//
// MODE A — autoLockIn ON:
//   We chain apply + lock-in into one ordered flow. When the user has hovered
//   a champion stably for APPLY_DEBOUNCE_MS:
//     1. fetch the meta bundle
//     2. apply runes + spells + items   (still pre-lock; spells PATCH succeeds)
//     3. POST .../complete to lock in   (LOCK_IN_DELAY_MS after apply finishes)
//   This way spells land before my-selection becomes immutable, and the user's
//   "pick" doesn't trigger anything visible until lock-in fires.
//
// MODE B — autoLockIn OFF:
//   We *only* apply once the pick action has already completed (user clicked
//   Lock In manually). Hovering a champion does nothing — matches the
//   user's mental model of "lock means commit". Caveat: spell PATCH will
//   fail post-lock; runes + items still apply cleanly.
//
// Toggles are read live from store.load() on every event so flipping
// autoLockIn / autoApply* in the settings tab takes effect without reload.

import * as lcu from "../lcu.js";
import * as meta from "../lib/meta.js";
import * as store from "../lib/store.js";

const log = (...a) => console.log("[league-lean][auto-cs]", ...a);

const LOCK_IN_AFTER_APPLY_MS = 250; // small grace between apply and lock-in
const APPLY_DEBOUNCE_MS      = 1200;

function findMyPickAction(session) {
  const cellId = session?.localPlayerCellId;
  if (cellId == null || !Array.isArray(session?.actions)) return null;
  for (const phase of session.actions) {
    if (!Array.isArray(phase)) continue;
    for (const action of phase) {
      if (action?.actorCellId === cellId && action?.type === "pick") {
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

  let applyTimer = null;
  let appliedKey = null;     // identity of the bundle we last applied
  let inFlight = false;      // serialise the apply+lock chain

  const reset = () => {
    appliedKey = null;
    inFlight = false;
    if (applyTimer) { clearTimeout(applyTimer); applyTimer = null; }
  };

  async function doApplyAndMaybeLock(session) {
    if (inFlight) return;
    inFlight = true;
    const settings = store.load();
    const cellId = session?.localPlayerCellId;
    const me = findMyTeammate(session);
    const champId  = me?.championId || 0;
    const position = me?.assignedPosition || "";
    const action  = findMyPickAction(session);

    try {
      // 1. Apply runes + spells + items (skip if all three are off).
      const wantApply = settings.autoApplyRunes || settings.autoApplyItems || settings.autoApplySpells;
      if (wantApply && champId) {
        const tier = settings.metaTier || "platinum_plus";
        const flashSide = settings.flashSide || "D";
        const pageKind = settings.autoApplyRunePage === "win" ? "win" : "pick";
        try {
          const champions = await meta.getChampionMap();
          const champ = champions.get(champId);
          // Builds provider is read from settings inside fetchChampionBundle.
          const bundle = await meta.fetchChampionBundle({ championId: champId, position, tier });
          const labelMap = { pick: "Most played", win: "Highest winrate" };
          const wantedLabel = labelMap[pageKind];
          const page = bundle.pages.find((p) => p.label === wantedLabel)
            || bundle.pages.find((p) => p.label.includes(wantedLabel))
            || bundle.pages[0];
          if (page) {
            await meta.applyComplete(page, {
              championId: champId,
              championName: champ?.name,
              position,
              flashSide,
              alsoSpells: !!settings.autoApplySpells,
              alsoItems:  !!settings.autoApplyItems,
            });
            log(`auto-applied ${page.label} for ${champ?.name ?? champId} ${position}`);
            try { globalThis.Toast?.success?.(`league-lean: ${page.label} applied`); } catch {}
          }
        } catch (e) {
          log("auto-apply failed", e?.message ?? e);
        }
      }

      // 2. Auto lock-in (only if action is still in-progress + uncompleted).
      if (settings.autoLockIn && action && action.isInProgress && !action.completed && action.championId) {
        // small grace so apply settles before the cell goes immutable
        await new Promise((r) => setTimeout(r, LOCK_IN_AFTER_APPLY_MS));
        try {
          await lcu.post(`/lol-champ-select/v1/session/actions/${action.id}/complete`);
          log("auto-locked-in", action.id);
          try { globalThis.Toast?.success?.("league-lean: locked in"); } catch {}
        } catch (e) {
          log("lock-in failed", e?.message);
        }
      }
    } finally {
      inFlight = false;
    }
  }

  const onSession = async (session) => {
    if (!session) { reset(); return; }
    const settings = store.load();
    const me = findMyTeammate(session);
    const champId = me?.championId || 0;
    const position = me?.assignedPosition || "";
    const action  = findMyPickAction(session);
    if (!champId) return;

    if (settings.autoLockIn) {
      // MODE A: debounce on stable championId, then run apply → lock chain.
      const key = `A|${champId}|${position}|${settings.autoApplyRunePage}|f${settings.flashSide || "D"}`;
      if (key === appliedKey) return;
      // Don't fire if action already completed by something else (manual lock).
      if (action?.completed) return;
      if (applyTimer) clearTimeout(applyTimer);
      applyTimer = setTimeout(async () => {
        appliedKey = key;
        await doApplyAndMaybeLock(session);
      }, APPLY_DEBOUNCE_MS);
    } else {
      // MODE B: only apply once the pick action has been completed (user
      // manually locked in). One-shot per championId+position.
      if (!action?.completed) return;
      const key = `B|${champId}|${position}|${settings.autoApplyRunePage}|f${settings.flashSide || "D"}`;
      if (key === appliedKey) return;
      appliedKey = key;
      await doApplyAndMaybeLock(session);
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
    reset();
  };
}
