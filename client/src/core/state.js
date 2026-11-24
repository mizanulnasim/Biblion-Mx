// App-wide state with subscribers, and the device's own storage.
// Every key on the device starts with "bm." (one prefix, no leftovers).

const listeners = new Set();
const state = {
  meta: null, // what meta.get returned for the signed-in person
  online: navigator.onLine,
  queued: 0, // items in "Saved on this phone" still to send
  attention: 0, // items that need the person (a prompt or a failure)
};

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function can(permission) {
  return Boolean(state.meta && state.meta.permissions.includes(permission));
}

const PREFIX = 'bm.';

export const device = {
  get(key) {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  },
  set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(PREFIX + key);
  },
};

export const tab = {
  get(key) {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw === null ? null : JSON.parse(raw);
  },
  set(key, value) {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  },
  clear() {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  },
};
