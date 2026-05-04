// Auto-honor.
//
// On post-game, query Riot's honor ballot for the eligible-allies list and
// honor a random non-bot teammate. One vote per match (dedup'd by gameId).
//
// LCU endpoints used (verified against the published swagger):
//   GET  /lol-honor-v2/v1/ballot
//        → { gameId, eligibleAllies: [{ puuid, summonerId, summonerName,
//                                        championName, botPlayer, ... }],
//             eligibleOpponents, votePool, honoredPlayers }
//   POST /lol-honor-v2/v1/honor-player
//        body: { gameId: int64, honorType: string, puuid, summonerId }
//
// honorType options Riot's UI uses: HEART, SHOTCALLER, COOL.
// HEART (good teammate) is the safe universal default.

import * as lcu from "../lcu.js";
import * as store from "../lib/store.js";
import { onPhaseChange } from "../lib/gameflow.js";

const log = (...a) => console.log("[league-lean][auto-honor]", ...a);

const HONOR_PHASES = new Set(["PreEndOfGame", "WaitingForStats", "EndOfGame"]);
const HONOR_DELAY_MS = 4000;       // give the ballot a few seconds to populate
const DEFAULT_HONOR_TYPE = "HEART";

export function start() {
  log("active");
  const honored = new Set(); // gameIds we've already voted on this session

  let pendingTimer = null;
  const stopPhase = onPhaseChange(async (phase) => {
    if (!HONOR_PHASES.has(phase)) return;
    if (!store.load().autoHonor) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(tryHonor, HONOR_DELAY_MS);
  });

  async function tryHonor() {
    try {
      const ballot = await lcu.get("/lol-honor-v2/v1/ballot");
      const gameId = ballot?.gameId;
      if (!gameId) { log("ballot has no gameId yet"); return; }
      if (honored.has(gameId)) return;

      const allies = (ballot.eligibleAllies || []).filter((p) => !p.botPlayer);
      if (!allies.length) { log("no eligible allies"); return; }

      const target = allies[Math.floor(Math.random() * allies.length)];
      await lcu.post("/lol-honor-v2/v1/honor-player", {
        gameId,
        honorType: DEFAULT_HONOR_TYPE,
        puuid: target.puuid,
        summonerId: target.summonerId,
      });
      honored.add(gameId);
      log("honored", target.summonerName ?? target.puuid, "as", DEFAULT_HONOR_TYPE);
      try { globalThis.Toast?.success?.(`league-lean: honored ${target.summonerName ?? "ally"}`); } catch {}
    } catch (e) {
      log("honor failed", e?.message ?? e);
    }
  }

  return () => {
    stopPhase?.();
    if (pendingTimer) clearTimeout(pendingTimer);
  };
}
