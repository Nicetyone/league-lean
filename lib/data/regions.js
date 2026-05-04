// Region code mapping. The LCU's /riotclient/region-locale returns codes
// like "NA" / "EUW" / "KR"; downstream services (op.gg, u.gg) want
// platform-specific codes like "na1" / "euw1" / "kr". One canonical map
// lives here and gets reused by everyone.

const PLATFORM_BY_LCU = Object.freeze({
  na: "na1",  na1: "na1",
  euw: "euw1", euw1: "euw1",
  eune: "eun1", eun1: "eun1",
  kr: "kr",
  jp: "jp1",  jp1: "jp1",
  br: "br1",  br1: "br1",
  lan: "la1", la1: "la1",
  las: "la2", la2: "la2",
  oce: "oc1", oc1: "oc1",
  tr: "tr1",  tr1: "tr1",
  ru: "ru",
  ph: "ph2",  ph2: "ph2",
  sg: "sg2",  sg2: "sg2",
  th: "th2",  th2: "th2",
  tw: "tw2",  tw2: "tw2",
  vn: "vn2",  vn2: "vn2",
});

/**
 * Convert an LCU region code (e.g. from /riotclient/region-locale) to a
 * platform id. Falls back to "na1" if unknown.
 */
export function toPlatform(lcuRegion) {
  if (!lcuRegion) return "na1";
  return PLATFORM_BY_LCU[String(lcuRegion).toLowerCase()] ?? "na1";
}

const OPGG_BY_LCU = Object.freeze({
  na: "na",  na1: "na",
  euw: "euw", euw1: "euw",
  eune: "eune", eun1: "eune",
  kr: "kr",
  jp: "jp", jp1: "jp",
  br: "br", br1: "br",
  lan: "lan", la1: "lan",
  las: "las", la2: "las",
  oce: "oce", oc1: "oce",
  tr: "tr",  tr1: "tr",
  ru: "ru",
  ph: "ph",  ph2: "ph",
  sg: "sg",  sg2: "sg",
  th: "th",  th2: "th",
  tw: "tw",  tw2: "tw",
  vn: "vn",  vn2: "vn",
});

/** Convert an LCU region code to an op.gg URL slug (e.g. "na", "euw"). */
export function toOpgg(lcuRegion) {
  if (!lcuRegion) return "na";
  return OPGG_BY_LCU[String(lcuRegion).toLowerCase()] ?? "na";
}
