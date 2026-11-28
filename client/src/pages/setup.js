// Setup: every setting the person may change, in sections, drawn from the
// descriptions in shared/schema/settings.js, with a search box over all of
// them and links to the other setup pages. A section is saved on its own.
// A personal setting lists the people with their own value, which can be
// set or reset here.

import { html, on, render } from '../ui/html.js';
import { emptyState, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can, getState, setState } from '../core/state.js';
import { currentPlace } from '../core/place.js';
import { letterhead } from '../ui/letterhead.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { SETTINGS, SETTING_AREAS, settingRule } from '../../../shared/schema/settings.js';
import { NAV } from './nav.js';

// Saved rates plus empty rows for new ones.
const SPARE_RATES = 2;

const CONTROL = {
  text: () => ({}),
  long: () => ({ type: 'textarea' }),
  bool: () => ({ type: 'checkbox' }),
  int: () => ({ inputmode: 'numeric' }),
  number: () => ({ inputmode: 'decimal' }),
  money: () => ({ inputmode: 'decimal' }),
  choice: (s) => ({ type: 'select', options: Object.keys(s.choices).map((value) => ({ value, label: t(s.choices[value]) })) }),
  time: () => ({ type: 'time' }),
  date: () => ({ type: 'date' }),
  email: () => ({ inputmode: 'email' }),
  color: () => ({ type: 'color' }),
  secret: (s, value) => ({ type: 'password', autocomplete: 'off', help: t(value ? 'settings.ai_key_set' : s.help) }),
};

const shown = (value) => (value === null || value === undefined ? '' : typeof value === 'boolean' ? value : String(value));

function field(key, value, name = key) {
  const s = SETTINGS[key];
  return { name, label: t(s.label), required: settingRule(key).required, help: s.help ? t(s.help) : '', ...CONTROL[s.kind](s, value) };
}

function rateFields(key, rates) {
  const fields = [];
  for (let i = 0; i < rates.length + SPARE_RATES; i++) {
    fields.push(
      { name: `${key}.${i}.from`, label: t('pay.set.rate_from', { n: i + 1 }), type: 'date' },
      { name: `${key}.${i}.amount`, label: t('pay.set.rate_amount'), inputmode: 'decimal' },
    );
  }
  return fields;
}

function valueText(key, value) {
  const s = SETTINGS[key];
  if (s.kind === 'bool') return value ? t('common.yes') : t('set.no');
  if (s.kind === 'choice') return t(s.choices[value]);
  return String(value);
}

function ownView(item) {
  return html`<div class="own-values">
    <p class="help">${t('set.own', { setting: t(SETTINGS[item.key].label) })}</p>
    ${item.own.length ? html`<ul class="punches">${item.own.map((o) => html`<li class="punch">
      <span><strong>${o.name}</strong> ${valueText(item.key, o.value)}</span>
      <button type="button" class="btn btn-small" data-act="reset" data-key="${item.key}" data-user="${o.user_id}">${t('set.own_reset')}</button>
    </li>`)}</ul>` : ''}
    <button type="button" class="btn btn-small" data-act="own" data-key="${item.key}">${t('set.own_add')}</button>
  </div>`;
}

// Drawn after a section's fields.
const EXTRAS = {
  shop: () => html`<h3 class="section-title">${t('shop.preview')}</h3><article class="doc">${letterhead()}</article>`,
  attendance: () => html`<p><button type="button" class="btn" data-act="here">${t('hr.use_here')}</button></p>`,
};

function areaForm(area, items) {
  const values = {};
  const fields = [];
  let rateHelp = '';
  for (const item of items) {
    const s = SETTINGS[item.key];
    if (s.kind === 'rates') {
      item.value.forEach((r, i) => {
        values[`${item.key}.${i}.from`] = r.from;
        values[`${item.key}.${i}.amount`] = String(r.amount);
      });
      fields.push(...rateFields(item.key, item.value));
      rateHelp = html`<p class="help">${t(s.help)}</p>`;
      continue;
    }
    fields.push(field(item.key, item.value));
    values[item.key] = s.kind === 'secret' ? '' : shown(item.value);
    if (s.kind === 'secret' && item.value) fields.push({ name: 'forget', label: t('settings.ai_key_clear'), type: 'checkbox' });
  }
  return formView({ fields, values, submit: t('common.save'), extra: html`${rateHelp}${EXTRAS[area] ? EXTRAS[area]() : ''}` });
}

function areaView(area, items) {
  const a = SETTING_AREAS[area];
  return html`<section class="panel" data-area="${area}">
    <h2 class="section-title">${t(a.title)}</h2>
    ${a.intro ? html`<p class="help">${t(a.intro)}</p>` : ''}
    ${areaForm(area, items)}
    ${items.filter((i) => i.own).map(ownView)}
  </section>`;
}

// The form's values as the save action takes them.
function payload(items, raw) {
  const out = {};
  for (const { key } of items) {
    const s = SETTINGS[key];
    if (s.kind === 'rates') {
      out[key] = [];
      for (let i = 0; `${key}.${i}.from` in raw; i++) if (raw[`${key}.${i}.from`]) out[key].push({ from: raw[`${key}.${i}.from`], amount: raw[`${key}.${i}.amount`] || 0 });
    } else out[key] = raw[key] === '' ? null : raw[key];
  }
  if ('forget' in raw) out.forget = raw.forget;
  return out;
}

function ownDialog(key, users, onSaved) {
  const s = SETTINGS[key];
  const dialog = formDialog(t(s.label), formView({
    submit: t('common.save'),
    values: { value: s.kind === 'bool' ? !s.start : s.start },
    fields: [
      { name: 'user_id', label: t('set.person'), type: 'select', required: true, placeholder: '—', options: users.map((u) => ({ value: u.id, label: u.name })) },
      { ...field(key, s.start, 'value'), required: s.kind !== 'bool' },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['settings.person.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ key, user_id: v.user_id, value: String(v.value) }),
    onSubmit: (v) => write('settings.person.save', v),
    onSaved: (reply) => {
      dialog.close();
      toast(t('setup.saved'));
      onSaved(reply.data);
    },
  });
}

function linksView() {
  const links = NAV.filter((n) => (n.group === 'settings' || n.path === '/setup/money') && n.path !== '/setup' && n.path !== '/me' && n.path !== '/me/leaving' && (!n.perm || can(n.perm)));
  return html`<section class="panel" data-area="links"><h2 class="section-title">${t('set.more')}</h2>
    <ul class="setup-links">${links.map((n) => html`<li class="setup-link"><a href="#${n.path}"><strong>${t(n.title)}</strong></a> <span class="muted">${t(n.hint)}</span></li>`)}</ul>
  </section>`;
}

// Shows only the sections, settings and links whose words contain every
// typed word.
function search(el, text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (node) => words.every((w) => node.textContent.toLowerCase().includes(w));
  let any = false;
  for (const section of el.querySelectorAll('[data-area]')) {
    const title = section.querySelector('.section-title');
    const whole = !words.length || hit(title);
    let some = whole;
    for (const item of section.querySelectorAll('.field, .setup-link, .own-values')) {
      const show = whole || hit(item);
      item.hidden = !show;
      some = some || show;
    }
    section.hidden = !some;
    any = any || some;
  }
  el.querySelector('.setup-none').hidden = any;
}

export const setupPage = {
  path: '/setup',
  title: 'nav.setup',
  perm: 'settings.manage|settings.books|setup.tasks',
  mount(el) {
    let data = null;
    const bind = (area) => {
      const section = el.querySelector(`[data-area="${area}"]`);
      bindForm(section.querySelector('form.form'), {
        schema: ACTIONS[`settings.${area}.save`].schema,
        busyLabel: t('common.saving'),
        mapValues: (raw) => payload(data.areas[area], raw),
        onSubmit: (v) => write(`settings.${area}.save`, v),
        onSaved: (reply) => {
          if (area === 'shop') {
            const shop = {};
            for (const item of reply.data) if (item.key.startsWith('shop.')) shop[item.key.slice(5)] = item.value;
            setState({ meta: { ...getState().meta, shop } });
          }
          toast(t('setup.saved'));
          redraw(area, reply.data);
        },
      });
    };
    const redraw = (area, items) => {
      data.areas[area] = items;
      render(el.querySelector(`[data-slot="${area}"]`), areaView(area, items));
      bind(area);
      search(el, el.querySelector('.setup-search').value);
    };
    const offClick = on(el, 'click', {
      own: (e, btn) => ownDialog(btn.dataset.key, data.users, (items) => redraw(SETTINGS[btn.dataset.key].area, items)),
      reset: (e, btn) => whileBusy(btn, t('common.saving'), async () => {
        try {
          const reply = await write('settings.person.save', { key: btn.dataset.key, user_id: btn.dataset.user, value: null });
          if (reply.status === 'saved') redraw(SETTINGS[btn.dataset.key].area, reply.data);
        } catch (err) {
          toast(errorText(err), 'error');
        }
      }),
      here: (e, btn) => whileBusy(btn, t('hr.finding_place'), async () => {
        const place = await currentPlace();
        if (!place) {
          toast(t('hr.no_place'), 'error');
          return;
        }
        const form = btn.closest('form');
        form.elements['gps.lat'].value = place.lat.toFixed(6);
        form.elements['gps.lng'].value = place.lng.toFixed(6);
        form.dispatchEvent(new Event('input'));
        toast(t('hr.place_filled', { accuracy: place.accuracy }));
      }),
    });
    const onSearch = (e) => {
      if (e.target.matches('.setup-search')) search(el, e.target.value);
    };
    el.addEventListener('input', onSearch);
    render(el, html`<div aria-busy="true"></div>`);
    read('settings.view').then((reply) => {
      data = reply.data;
      render(el, html`<div class="field setup-find"><label for="setup-search">${t('set.search')}</label>
          <input id="setup-search" class="setup-search" type="search" autocomplete="off"></div>
        <div class="setup-none" hidden>${emptyState(t('set.search_none'))}</div>
        ${Object.keys(data.areas).map((area) => html`<div data-slot="${area}">${areaView(area, data.areas[area])}</div>`)}
        ${linksView()}`);
      for (const area of Object.keys(data.areas)) bind(area);
    }).catch((err) => render(el, errorBox(errorText(err))));
    return () => {
      offClick();
      el.removeEventListener('input', onSearch);
    };
  },
};
