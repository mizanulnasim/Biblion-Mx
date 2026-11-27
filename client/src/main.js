// Start-up: theme and language, then setup, sign-in or the app.

import { can, device, getState, setState, tab } from './core/state.js';
import { loadLang, t } from './core/i18n.js';
import { ApiError, clearUserData, onApiEvent, read, refreshQueueCount, write } from './core/api.js';
import { startRouter, stopRouter } from './core/router.js';
import { startLive, stopLive } from './core/live.js';
import { applyLook } from './core/look.js';
import { mountShell } from './ui/shell.js';
import { confirmDialog } from './ui/dialog.js';
import { toast } from './ui/toast.js';
import { showSetup, showSignIn } from './pages/signin.js';
import { homePage } from './pages/home.js';
import { usersPage } from './pages/users.js';
import { activityPage } from './pages/activity.js';
import { savedPage } from './pages/saved.js';
import { mePage } from './pages/me.js';
import { moneyPage } from './pages/money.js';
import { moneyFormPage } from './pages/money-form.js';
import { setupMoneyPage } from './pages/setup-money.js';
import { approvalsPage } from './pages/approvals.js';
import { dailyPage } from './pages/daily.js';
import { closingPage } from './pages/closing.js';
import { booksPage } from './pages/books.js';
import { deliveriesPage, deliveryPage } from './pages/delivery.js';
import { bookSalesPage } from './pages/book-sales.js';
import { suppliersPage } from './pages/suppliers.js';
import { requisitionPage, requisitionsPage } from './pages/requisitions.js';
import { orderFormPage, ordersPage } from './pages/special-orders.js';
import { stocktakePage } from './pages/stocktake.js';
import { settingsBooksPage } from './pages/settings-books.js';
import { uploadPage, uploadsPage } from './pages/upload.js';
import { uploadDocPage } from './pages/upload-doc.js';
import { settingsIntakePage } from './pages/settings-intake.js';
import { cafeCountPage } from './pages/cafe-count.js';
import { cafeItemsPage } from './pages/cafe-items.js';
import { cafeOrderPage, cafeOrdersPage } from './pages/cafe-orders.js';
import { settingsCafePage } from './pages/settings-cafe.js';
import { NAV, NAV_GROUPS } from './pages/nav.js';
import { html, render } from './ui/html.js';

const root = document.getElementById('app');
let shell = null;

const notFound = {
  path: '*',
  title: 'nav.not_found',
  mount(el) {
    render(el, html`<div class="empty"><p>${t('common.not_found')}</p><a class="btn" href="#/">${t('nav.home')}</a></div>`);
  },
};

async function signOut() {
  await refreshQueueCount();
  const unsent = getState().queued;
  const ok = await confirmDialog(unsent
    ? { title: t('signout.title'), body: t('signout.unsent', { count: unsent }), ok: t('shell.sign_out'), tone: 'danger' }
    : { title: t('signout.title'), body: t('signout.body'), ok: t('shell.sign_out') });
  if (!ok) return;
  try {
    await write('auth.logout', {});
  } catch (err) {
    // Signing out on this device goes ahead even when the server can't be reached.
  }
  await endSession();
}

async function endSession() {
  await clearUserData();
  tab.clear();
  stopLive();
  stopRouter();
  if (shell) shell.destroy();
  shell = null;
  setState({ meta: null, queued: 0, attention: 0 });
  history.replaceState(null, '', '#/');
  showSignIn(root, { onSignedIn: startSession });
}

async function startSession({ token, meta }) {
  if (token) device.set('token', token);
  setState({ meta });
  applyLook(meta.settings);
  if (meta.settings.lang !== device.get('lang')) {
    device.set('lang', meta.settings.lang);
    await loadLang(meta.settings.lang);
  }
  device.set('meta', meta);
  await refreshQueueCount();
  shell = mountShell(root, { items: NAV, groups: NAV_GROUPS, onSignOut: signOut });
  startRouter({
    // Pages a person has no permission for are not routes for them at all.
    routes: [homePage, dailyPage, closingPage, booksPage, deliveryPage, deliveriesPage, bookSalesPage, suppliersPage, requisitionsPage, requisitionPage, orderFormPage, ordersPage, stocktakePage, settingsBooksPage, uploadPage, uploadsPage, uploadDocPage, settingsIntakePage, cafeCountPage, cafeItemsPage, cafeOrdersPage, cafeOrderPage, settingsCafePage, moneyPage, moneyFormPage, setupMoneyPage, approvalsPage, usersPage, activityPage, savedPage, mePage].filter((p) => !p.perm || can(p.perm)).concat(notFound),
    outlet: shell.outlet,
    onChange: (page, path) => shell.setPage(page, path),
    confirmLeave: () => confirmDialog({ title: t('guard.title'), body: t('guard.body'), ok: t('guard.leave'), tone: 'danger' }),
  });
  startLive();
}

async function boot() {
  const look = device.get('look');
  if (look) applyLook(look);
  await loadLang(device.get('lang') || 'en');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));
  onApiEvent('authLost', () => {
    if (getState().meta) endSession();
  });
  onApiEvent('updateNeeded', () => toast(t('err.update_app'), 'error'));

  if (device.get('token')) {
    // The person's details saved at sign-in let the app start without a
    // connection; the phone's copies of lists are found with them.
    const stored = device.get('meta');
    if (stored) setState({ meta: stored });
    try {
      const { data } = await read('meta.get');
      await startSession({ meta: data });
      return;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.code === 'NETWORK' && stored) {
        await startSession({ meta: stored });
        return;
      }
      if (err.code !== 'AUTH_REQUIRED') throw err;
    }
  }
  const { data } = await read('setup.status');
  if (data.initialized) showSignIn(root, { onSignedIn: startSession });
  else showSetup(root, { onDone: () => showSignIn(root, { onSignedIn: startSession }) });
}

boot().catch(() => {
  render(root, html`<div class="auth"><div class="auth-card"><p role="alert">${t('err.network')}</p>
    <button class="btn btn-primary" onclick="location.reload()">${t('common.retry')}</button></div></div>`);
});
