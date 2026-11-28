// A small promise wrapper over IndexedDB. One database, two stores:
//   queue  entries saved on this phone, keyed by op_id
//   cache  copies of reads, keyed by "<user id>|<action>|<payload>"

const DB_NAME = 'biblion';
const VERSION = 1;
let opening = null;

function open() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'op_id' });
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return opening;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
  }));
}

// The same small interface the tests implement in memory.
export function idbStore(name) {
  return {
    all: () => run(name, 'readonly', (s) => s.getAll()),
    get: (key) => run(name, 'readonly', (s) => s.get(key)),
    put: (value) => run(name, 'readwrite', (s) => s.put(value)),
    remove: (key) => run(name, 'readwrite', (s) => s.delete(key)),
  };
}
