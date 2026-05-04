// Tiny logger factory. Returns a `log(...args)` that prefixes its output with
// `[league-lean][<module>]`, plus matching .warn / .error variants. Existing
// modules manually inlined this pattern; centralising here lets us add log
// levels, buffering, or DataStore-backed log capture later without touching
// every feature.

/**
 * @param {string} mod  short module name, e.g. "meta", "auto-cs"
 * @returns {{
 *   log:   (...args: unknown[]) => void,
 *   warn:  (...args: unknown[]) => void,
 *   error: (...args: unknown[]) => void,
 * }}
 */
export function loggerFor(mod) {
  const prefix = `[league-lean][${mod}]`;
  return {
    log:   (...a) => console.log(prefix, ...a),
    warn:  (...a) => console.warn(prefix, ...a),
    error: (...a) => console.error(prefix, ...a),
  };
}
