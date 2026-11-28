// Background work while someone is signed in:
//   - sends entries saved on this phone when the connection comes back, when
//     the tab becomes visible, and every 60 s while online;
//   - polls the server's change number per area every 30 s and tells the
//     pages of an area that changed, so only those redraw; after a change
//     it fetches the unread notification count for the bell.

import { onApiEvent, read, sendQueue } from './api.js';
import { t } from './i18n.js';
import { getState, setState } from './state.js';
import { toast } from '../ui/toast.js';

const SEND_EVERY_MS = 60000;
const POLL_EVERY_MS = 30000;

const watchers = new Map();
let versions = null;
let timers = [];

function notify(area) {
  for (const fn of watchers.get(area) || []) fn();
}

// Calls fn when `area` changes. Returns the function that stops watching.
export function onArea(area, fn) {
  if (!watchers.has(area)) watchers.set(area, new Set());
  watchers.get(area).add(fn);
  return () => watchers.get(area).delete(fn);
}

async function send() {
  if (!getState().online) return;
  const report = await sendQueue();
  if (!report) return;
  if (report.sent) toast(t('sync.sent', { count: report.sent }));
  if (report.attention) toast(t('sync.attention', { count: report.attention }), 'error');
}

async function poll() {
  if (document.hidden) return;
  try {
    const { data } = await read('sync.version');
    const changed = !versions || Object.keys(data.areas).some((area) => data.areas[area] !== versions[area]);
    if (versions) for (const area of Object.keys(data.areas)) if (data.areas[area] !== versions[area]) notify(area);
    versions = data.areas;
    if (changed) setState({ unread: (await read('notify.count')).data.unread });
  } catch (err) {
    // Offline or signed out: the next poll tries again.
  }
}

const onOnline = () => send();
const onVisible = () => {
  if (!document.hidden) {
    send();
    poll();
  }
};

export function startLive() {
  versions = null;
  onApiEvent('areaChanged', (area) => notify(area));
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  timers = [setInterval(send, SEND_EVERY_MS), setInterval(poll, POLL_EVERY_MS)];
  send();
  poll();
}

export function stopLive() {
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
  for (const id of timers) clearInterval(id);
  timers = [];
}
