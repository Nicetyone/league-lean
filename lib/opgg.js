// op.gg URL builder. Riot IDs are "GameName#TagLine"; op.gg URL-encodes the
// hash as %23 (or uses "-" in some routes). The current scheme:
//   https://op.gg/lol/summoners/{region}/{gameName}-{tagLine}

const REGION_MAP = {
  na: "na", na1: "na",
  euw: "euw", euw1: "euw",
  eune: "eune", eun1: "eune",
  kr: "kr",
  jp: "jp", jp1: "jp",
  br: "br", br1: "br",
  lan: "lan", la1: "lan",
  las: "las", la2: "las",
  oce: "oce", oc1: "oce",
  tr: "tr", tr1: "tr",
  ru: "ru",
  ph: "ph", ph2: "ph",
  sg: "sg", sg2: "sg",
  th: "th", th2: "th",
  tw: "tw", tw2: "tw",
  vn: "vn", vn2: "vn",
};

export function normalizeRegion(raw) {
  if (!raw) return "na";
  const key = String(raw).toLowerCase();
  return REGION_MAP[key] ?? "na";
}

export function summonerUrl(region, gameName, tagLine) {
  const r = normalizeRegion(region);
  const slug = encodeURIComponent(`${gameName}-${tagLine}`);
  return `https://op.gg/lol/summoners/${r}/${slug}`;
}

// Riot ID can arrive as a single "Name#Tag" string in some payloads.
export function summonerUrlFromRiotId(region, riotId) {
  const [gameName, tagLine = ""] = String(riotId).split("#");
  return summonerUrl(region, gameName, tagLine);
}
