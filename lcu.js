// LCU helpers. Inside the Riot client renderer, fetch() already routes to the
// LCU with auth handled — same-origin. We just wrap common patterns.
//
// `context.socket` (Pengu) lets us observe LCU events without WAMP plumbing.

const log = (...a) => console.log("[league-lean][lcu]", ...a);

export async function get(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

export async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    // Best-effort: capture LCU's error body so callers can show Riot's
    // actual complaint instead of just an HTTP status.
    let detail = "";
    try { detail = (await res.text()).slice(0, 240); } catch {}
    throw new Error(`POST ${path} → ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export async function put(path, body) {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 240); } catch {}
    throw new Error(`PUT ${path} → ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export async function del(path) {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(`DELETE ${path} → ${res.status}`);
}

// Region (na, euw, kr, ...) — needed for op.gg URLs.
let cachedRegion = null;
export async function region() {
  if (cachedRegion) return cachedRegion;
  try {
    const r = await get("/riotclient/region-locale");
    cachedRegion = (r.region || r.webRegion || "na").toLowerCase();
  } catch (e) {
    log("region lookup failed, defaulting to na", e);
    cachedRegion = "na";
  }
  return cachedRegion;
}

export async function currentSummoner() {
  return get("/lol-summoner/v1/current-summoner");
}

// Subscribe to an LCU WAMP event. Pengu exposes context.socket for this.
// Returns an unsubscribe function.
export function subscribe(socket, eventPath, cb) {
  const handler = (msg) => {
    try { cb(msg); } catch (e) { log("subscriber threw", eventPath, e); }
  };
  socket.observe(eventPath, handler);
  return () => socket.unobserve?.(eventPath, handler);
}
