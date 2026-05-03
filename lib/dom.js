// DOM helpers for Riot's frontend. Riot uses Ember; views mount/unmount as you
// navigate, so we observe and re-attach when relevant containers appear.

const log = (...a) => console.log("[league-lean][dom]", ...a);

// Resolve when a selector first matches, with a timeout.
export function waitFor(selector, { timeoutMs = 10000, root = document } = {}) {
  return new Promise((resolve, reject) => {
    const initial = root.querySelector(selector);
    if (initial) return resolve(initial);

    const obs = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        obs.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    obs.observe(root, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      obs.disconnect();
      reject(new Error(`waitFor(${selector}) timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

// Call cb every time an element matching `selector` mounts. Returns a stop fn.
// Useful for screens like end-of-game that mount/unmount across matches.
export function onMount(selector, cb, { root = document } = {}) {
  const seen = new WeakSet();

  const scan = () => {
    for (const el of root.querySelectorAll(selector)) {
      if (seen.has(el)) continue;
      seen.add(el);
      try { cb(el); } catch (e) { log("onMount cb threw", selector, e); }
    }
  };

  scan();
  const obs = new MutationObserver(scan);
  obs.observe(root, { childList: true, subtree: true });
  return () => obs.disconnect();
}

// Inject a <link rel=stylesheet> from raw CSS text. Pengu's `import './x.css'`
// also works — this is for dynamic / conditional styles.
export function injectCss(id, cssText) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = cssText;
  return () => el.remove();
}
