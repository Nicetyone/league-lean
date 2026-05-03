// Gameflow phase poller. Real plugins (Yimikami's SoloQMachine) prefer polling
// /lol-gameflow/v1/gameflow-phase over WAMP subscription because the socket
// occasionally drops phase updates. 1.5s is the community-standard cadence.
//
// Phases observed: None, Lobby, Matchmaking, ReadyCheck, ChampSelect, GameStart,
// InProgress, Reconnect, WaitingForStats, PreEndOfGame, EndOfGame, TerminatedInError.

import * as lcu from "../lcu.js";

const log = (...a) => console.log("[league-lean][gameflow]", ...a);

let pollTimer = null;
let lastPhase = null;
const subscribers = new Set();

async function tick() {
  try {
    const phase = await lcu.get("/lol-gameflow/v1/gameflow-phase");
    if (phase !== lastPhase) {
      const prev = lastPhase;
      lastPhase = phase;
      log("phase:", prev, "→", phase);
      for (const cb of subscribers) {
        try { cb(phase, prev); } catch (e) { log("subscriber threw", e); }
      }
    }
  } catch {
    // Client may not be ready yet; silently skip.
  }
}

export function onPhaseChange(cb) {
  subscribers.add(cb);
  if (lastPhase != null) {
    queueMicrotask(() => { try { cb(lastPhase, null); } catch {} });
  }
  return () => subscribers.delete(cb);
}

export function start({ intervalMs = 1500 } = {}) {
  if (pollTimer) return () => {};
  pollTimer = setInterval(tick, intervalMs);
  tick();
  return () => {
    clearInterval(pollTimer);
    pollTimer = null;
    lastPhase = null;
    subscribers.clear();
  };
}

export function currentPhase() {
  return lastPhase;
}
