// Auto-accept queue. Reacts to gameflow phase entering ReadyCheck.

import * as lcu from "../lcu.js";
import { onPhaseChange } from "../lib/gameflow.js";

const log = (...a) => console.log("[league-lean][auto-accept]", ...a);

export function start({ delayMs = 0 } = {}) {
  log("active, delayMs =", delayMs);
  return onPhaseChange(async (phase) => {
    if (phase !== "ReadyCheck") return;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      await lcu.post("/lol-matchmaking/v1/ready-check/accept");
      log("accepted");
    } catch (e) {
      log("accept failed", e?.message);
    }
  });
}
