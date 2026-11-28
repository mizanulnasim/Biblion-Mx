// Setup: every setting the person may change, by section, from the
// descriptions in shared/schema/settings.js. A section is saved as a whole;
// a few sections check values against each other. A personal setting also
// lists the people with their own value, which Setup can change or reset.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { validate } from '../../shared/lib/validate.js';
import { SETTINGS, SETTING_AREAS, areaKeys, settingRule } from '../../shared/schema/settings.js';
import { saveSetting, setting } from '../kernel/settings.js';
import { deleteProp, getProp, setProp } from '../platform.js';

const fieldError = (field, code) => new AppError('VALIDATION', {}, { [field]: { code, params: {} } });
const TEXT_KINDS = new Set(['text', 'long', 'email', 'time', 'date', 'color']);

// Checks across a section's values; each throws on the first problem.
const CHECKS = {
  attendance: (v) => {
    if ((v['gps.lat'] === null) !== (v['gps.lng'] === null)) throw fieldError(v['gps.lat'] === null ? 'gps.lat' : 'gps.lng', 'val.required');
    if (v['attendance.shop_close'] <= v['attendance.shop_open']) throw fieldError('attendance.shop_close', 'val.time_after');
  },
  payroll: (v) => {
    const dates = v['food.rates'].map((r) => r.from);
    if (new Set(dates).size !== dates.length) throw fieldError('food.rates', 'val.taken');
  },
};

const NORMALIZE = {
  'staff.number_prefix': (value) => value.toUpperCase(),
  'food.rates': (rates) => [...rates].sort((a, b) => (a.from < b.from ? -1 : 1)),
};

// A secret is never sent back: only whether one is kept.
function valueOf(db, key) {
  const s = SETTINGS[key];
  return s.kind === 'secret' ? Boolean(getProp(s.prop)) : setting(db, key);
}

const people = (db) => db.all('Users').filter((u) => u.status === 'active');

function areaView(db, area) {
  return areaKeys(area).map((key) => {
    const out = { key, value: valueOf(db, key) };
    if (SETTINGS[key].personal) {
      out.own = people(db).filter((u) => u.settings && u.settings[key] !== undefined).map((u) => ({ user_id: u.id, name: u.display_name, value: u.settings[key] }));
    }
    return out;
  });
}

function view(ctx) {
  const areas = Object.keys(SETTING_AREAS).filter((area) => ctx.can(SETTING_AREAS[area].perm));
  if (!areas.length) throw new AppError('FORBIDDEN');
  const out = {};
  for (const area of areas) out[area] = areaView(ctx.db, area);
  const users = ctx.can('settings.manage') ? people(ctx.db).map((u) => ({ id: u.id, name: u.display_name })) : [];
  return { areas: out, users };
}

function saveArea(area) {
  return (ctx, input) => {
    const { db } = ctx;
    const values = {};
    for (const key of areaKeys(area)) {
      const s = SETTINGS[key];
      const raw = input[key];
      values[key] = s.kind === 'bool' ? Boolean(raw) : raw === null && TEXT_KINDS.has(s.kind) ? '' : raw === null && s.kind === 'set' ? [] : raw;
    }
    if (CHECKS[area]) CHECKS[area](values);
    for (const key of areaKeys(area)) {
      const s = SETTINGS[key];
      if (s.kind === 'secret') {
        if (input.forget) deleteProp(s.prop);
        else if (values[key]) setProp(s.prop, values[key]);
        continue;
      }
      saveSetting(db, key, NORMALIZE[key] ? NORMALIZE[key](values[key]) : values[key]);
    }
    return saved(null, areaView(db, area));
  };
}

// One person's own value of a personal setting; no value: back to the
// starting value.
function savePerson(ctx, input) {
  const { db } = ctx;
  const user = db.get('Users', input.user_id);
  if (!user || user.status !== 'active') throw new AppError('NOT_FOUND');
  const own = { ...(user.settings || {}) };
  if (input.value === null) delete own[input.key];
  else {
    const raw = SETTINGS[input.key].kind === 'bool' ? input.value === 'true' : input.value;
    const { value, fields } = validate({ value: settingRule(input.key) }, { value: raw });
    if (fields) throw new AppError('VALIDATION', {}, fields);
    own[input.key] = value.value;
  }
  db.update('Users', user, { settings: own });
  return saved(user.id, areaView(db, SETTINGS[input.key].area));
}

export const SETTINGS_HANDLERS = { 'settings.view': view, 'settings.person.save': savePerson };
for (const area of Object.keys(SETTING_AREAS)) SETTINGS_HANDLERS[`settings.${area}.save`] = saveArea(area);
