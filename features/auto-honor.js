// Auto-honor.
//
// On post-game, query Riot's honor ballot for the eligible-allies list and
// honor the *highest-gold* non-bot teammate. Smart-pick rather than random:
// gold-earned is the cheapest reasonable signal for "carried" without
// over-weighting kills (which support mains rarely have).
//
// Riot's honor system gives one vote per match (ballot.votePool.votes is
// typically 1). If for some reason it's higher, we'll honor the top-N
// allies by gold. Per-game dedup so we never vote twice on the same match.
//
// LCU endpoints used (verified against the published swagger):
//   GET  /lol-honor-v2/v1/ballot
//        → { gameId, eligibleAllies, eligibleOpponents, votePool, ... }
//   GET  /lol-end-of-game/v1/eog-stats-block
//        → { teams: [{ players: [{ puuid, stats: { GOLD_EARNED, ... } }] }] }
//   POST /lol-honor-v2/v1/honor-player
//        body: { gameId: int64, honorType: string, puuid, summonerId }

import * as lcu from "../lcu.js";
import * as store from "../lib/store.js";
import { onPhaseChange } from "../lib/gameflow.js";

const log = (...a) => console.log("[league-lean][auto-honor]", ...a);

const HONOR_PHASES = new Set(["PreEndOfGame", "WaitingForStats", "EndOfGame"]);
const HONOR_DELAY_MS = 4000;        // give the ballot + EOG time to populate
const DEFAULT_HONOR_TYPE = "HEART"; // safe single-button honor

export function start() {
  log("active");
  const honoredGames = new Set();

  let pendingTimer = null;
  const stopPhase = onPhaseChange(async (phase) => {
    if (!HONOR_PHASES.has(phase)) return;
    if (!store.load().autoHonor) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(tryHonor, HONOR_DELAY_MS);
  });

  async function tryHonor() {
    let ballot;
    try { ballot = await lcu.get("/lol-honor-v2/v1/ballot"); }
    catch (e) { log("ballot fetch failed", e?.message); return; }

    const gameId = ballot?.gameId;
    if (!gameId)              { log("no gameId on ballot yet");    return; }
    if (honoredGames.has(gameId)) return;

    const votes = Math.max(1, ballot?.votePool?.votes ?? 1);
    const allies = (ballot.eligibleAllies || []).filter((p) => !p.botPlayer);
    if (!allies.length) { log("no eligible allies"); return; }

    // Build a puuid → gold map from the end-of-game stats. Best-effort —
    // if EOG isn't ready yet we fall back to a random pick so we don't
    // miss the honor window.
    const goldByPuuid = new Map();
    try {
      const eog = await lcu.get("/lol-end-of-game/v1/eog-stats-block");
      for (const team of (eog?.teams ?? [])) {
        for (const p of (team?.players ?? [])) {
          const gold = p?.stats?.GOLD_EARNED ?? p?.goldEarned ?? p?.gold ?? 0;
          if (p?.puuid) goldByPuuid.set(p.puuid, gold);
        }
      }
    } catch (e) {
      log("EOG fetch failed; will random-pick", e?.message);
    }

    // Rank allies. If we have gold data, sort descending by gold.
    // Otherwise shuffle so we still vote.
    const ranked = goldByPuuid.size
      ? [...allies].sort(
          (a, b) => (goldByPuuid.get(b.puuid) ?? 0) - (goldByPuuid.get(a.puuid) ?? 0)
        )
      : [...allies].sort(() => Math.random() - 0.5);

    if (goldByPuuid.size) {
      log("gold ranking:",
        ranked.map((p) => `${p.summonerName}=${goldByPuuid.get(p.puuid) ?? 0}`).join(", "));
    }

    // Honor up to `votes` players (typically 1).
    const targets = ranked.slice(0, Math.min(votes, ranked.length));
    let successful = 0;
    for (const target of targets) {
      try {
        await lcu.post("/lol-honor-v2/v1/honor-player", {
          gameId,
          honorType: DEFAULT_HONOR_TYPE,
          puuid: target.puuid,
          summonerId: target.summonerId,
        });
        successful++;
        log(`honored ${target.summonerName ?? target.puuid}` +
          (goldByPuuid.has(target.puuid) ? ` (gold ${goldByPuuid.get(target.puuid)})` : ""));
      } catch (e) {
        // Riot may reject extra honors; stop on first 4xx and accept what
        // landed.
        log("honor POST failed", e?.message);
        break;
      }
    }
    if (successful) {
      honoredGames.add(gameId);
      try {
        const name = targets[0]?.summonerName ?? "ally";
        const suffix = successful > 1 ? ` +${successful - 1} more` : "";
        globalThis.Toast?.success?.(`league-lean: honored ${name}${suffix}`);
      } catch {}
    }
  }

  return () => {
    stopPhase?.();
    if (pendingTimer) clearTimeout(pendingTimer);
  };
}
