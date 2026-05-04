// op.gg summoner URL builder. Riot IDs come in as "GameName#TagLine"; op.gg's
// summoner page uses "GameName-TagLine" (URL-encoded).
//
// Region mapping is shared with lib/data/regions.js — see toOpgg() there.

import { toOpgg } from "./data/regions.js";

/** Build the op.gg summoner profile URL for a region + name + tag. */
export function summonerUrl(region, gameName, tagLine) {
  const r = toOpgg(region);
  const slug = encodeURIComponent(`${gameName}-${tagLine}`);
  return `https://op.gg/lol/summoners/${r}/${slug}`;
}

/** Same as summonerUrl, but takes a "Name#Tag" string. */
export function summonerUrlFromRiotId(region, riotId) {
  const [gameName, tagLine = ""] = String(riotId).split("#");
  return summonerUrl(region, gameName, tagLine);
}
