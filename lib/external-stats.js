// Backwards-compatibility facade. The actual u.gg GraphQL fetcher now
// lives in lib/sources/ugg.js. New code should import from there.

export {
  fetchPlayerProfile as fetchPlayer,
  fetchManyPlayerProfiles as fetchMany,
} from "./sources/ugg.js";
