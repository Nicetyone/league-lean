// OP.GG meta provider — tier list + counters.
//
// Tier list maps directly. Counters are derived from op.gg's per-champion
// payload (`data.counters`), where each entry is `{champion_id, play, win}`.
// `win` is the QUERIED champion's wins in the matchup, so vsWr =
// (win / play) * 100 is your champion's win rate against the opponent.
// Higher vsWr = strong-for-you, lower vsWr = weak-for-you. Verified by
// spot-checking known counters (e.g. Yorick/Singed sit in Aatrox's
// low-vsWr bucket as expected).

import * as opgg from "../../sources/opgg.js";
import { COUNTER_MIN_GAMES } from "../../config.js";

export const id = "opgg";
export const label = "OP.GG";

export async function fetchTierList({ lane, tier }) {
  return opgg.fetchTierList({ lane, tier });
}

export async function fetchCounters({ championId, position }) {
  const data = await opgg.fetchChampion({ championId, position });

  const rows = (data.counters || [])
    .map((c) => {
      const play = Number(c.play) || 0;
      const win  = Number(c.win)  || 0;
      return {
        cid:  c.champion_id,
        n:    play,
        vsWr: play > 0 ? (win / play) * 100 : null,
      };
    })
    .filter((c) => Number.isFinite(c.vsWr) && c.n >= COUNTER_MIN_GAMES);

  const byVsWr = [...rows].sort((a, b) => b.vsWr - a.vsWr);

  // op.gg returns rates as fractions; scale to percentages to match the
  // lolalytics adapter (which the Meta tab assumes).
  const pct = (v) => Number.isFinite(Number(v)) ? Number(v) * 100 : null;
  const sum = data.summary?.average_stats ?? {};
  return {
    stats: {
      wr:       pct(sum.win_rate),
      pr:       pct(sum.pick_rate),
      br:       pct(sum.ban_rate),
      analysed: Number(sum.play) || 0,
    },
    strongAgainst: byVsWr.slice(0, 5),
    weakAgainst:   byVsWr.slice(-5).reverse(),
  };
}
