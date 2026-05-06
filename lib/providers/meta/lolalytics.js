// Lolalytics meta provider — tier list + counters.
//
// Lolalytics' source-layer functions already match the MetaProvider
// contract, so this is a thin re-export.

export const id = "lolalytics";
export const label = "Lolalytics";

export { fetchTierList, fetchCounters } from "../../sources/lolalytics.js";
