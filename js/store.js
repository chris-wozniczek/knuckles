// Tiny IndexedDB key-value store for the user's own sounds. Everything stays in this browser.
const DB = 'knuckles', OS = 'sounds';
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(OS);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
async function run(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(OS, mode);
    const req = fn(tx.objectStore(OS));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}
export const store = {
  put: (k, v) => run('readwrite', (s) => s.put(v, k)).catch(() => {}),
  del: (k) => run('readwrite', (s) => s.delete(k)).catch(() => {}),
  async all() {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const out = {};
        const req = d.transaction(OS).objectStore(OS).openCursor();
        req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
        req.onerror = () => rej(req.error);
      });
    } catch { return {}; }
  },
};
