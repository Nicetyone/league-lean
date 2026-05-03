// Feature registry. Each feature registers a `start()` (and the registry
// stores the returned `stop()`). Settings-panel toggles call applyFeature(key,
// enabled) to flip features on/off live — no client reload required.

const log = (...a) => console.log("[league-lean][registry]", ...a);

const features = new Map(); // key -> { start, ctx, running, stop }

export function register(key, startFn) {
  features.set(key, { start: startFn, running: null, stop: null });
}

export async function applyFeature(key, enabled, sharedCtx = {}) {
  const f = features.get(key);
  if (!f) {
    log("unknown feature:", key);
    return;
  }
  if (enabled && !f.running) {
    try {
      const stop = await f.start(sharedCtx);
      f.stop = typeof stop === "function" ? stop : null;
      f.running = true;
      log("started:", key);
    } catch (e) {
      log("start failed:", key, e);
    }
  } else if (!enabled && f.running) {
    try {
      f.stop?.();
      log("stopped:", key);
    } catch (e) {
      log("stop failed:", key, e);
    }
    f.stop = null;
    f.running = false;
  }
}

export function isRunning(key) {
  return !!features.get(key)?.running;
}

export function shutdown() {
  for (const [key, f] of features) {
    if (f.running) {
      try { f.stop?.(); } catch (e) { log("stop failed", key, e); }
    }
  }
  features.clear();
}
