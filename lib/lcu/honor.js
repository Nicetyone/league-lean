// LCU honor — read the post-game ballot, vote for a teammate.
//
// Endpoints:
//   GET  /lol-honor-v2/v1/ballot
//        { gameId, eligibleAllies, eligibleOpponents, votePool }
//   POST /lol-honor-v2/v1/honor-player
//        body: { gameId, honorType, puuid, summonerId }
//
// Riot's votePool.votes is typically 1 — one honor per match.

import * as lcu from "../../lcu.js";
import { LCU_HONOR_BALLOT, LCU_HONOR_PLAYER } from "../endpoints.js";
import { DEFAULT_HONOR_TYPE } from "../config.js";

/** Returns the ballot (gameId, eligibleAllies, votePool). */
export const fetchBallot = () => lcu.get(LCU_HONOR_BALLOT);

/**
 * Submit one honor vote.
 * @param {{gameId:number|string, puuid:string, summonerId:number, honorType?:string}} target
 */
export const submitHonor = (target) => lcu.post(LCU_HONOR_PLAYER, {
  gameId:     target.gameId,
  honorType:  target.honorType ?? DEFAULT_HONOR_TYPE,
  puuid:      target.puuid,
  summonerId: target.summonerId,
});
