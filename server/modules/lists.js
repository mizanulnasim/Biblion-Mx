// Handlers for every setup list in shared/lists/lists.js: read, save and
// delete-if-unused. Rules shared by all lists:
// - names are unique (ignoring case), and a name that is nearly another's
//   ("Utility" and "Utilities") needs confirming;
// - a reference must name a record of the other list that isn't deleted
//   (and is active, unless it is the one already chosen);
// - only a shareholder deletes, and only a record nothing refers to.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { LISTS, listFields } from '../../shared/lists/lists.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });

// "Utility" and "Utilities", "Snack" and "Snacks", "Box" and "Boxes": the same word.
export function stem(name) {
  const word = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (/ies$/u.test(word)) return word.replace(/ies$/u, 'y');
  if (/(?:s|x|ch|sh)es$/u.test(word)) return word.slice(0, -2);
  return word.replace(/s$/u, '');
}

const live = (rows) => rows.filter((r) => r.status !== 'deleted');
const byName = (a, b) => a.name.localeCompare(b.name);

function view(key, row) {
  const out = { id: row.id, version: row.version, status: row.status };
  for (const name of Object.keys(listFields(key))) out[name] = row[name];
  return out;
}

function refsOf(key) {
  return [...new Set(Object.values(LISTS[key].fields).filter((f) => f.kind === 'ref').map((f) => f.ref))];
}

function read(key) {
  return (ctx) => {
    const { db } = ctx;
    const refs = {};
    for (const ref of refsOf(key)) refs[ref] = live(db.all(LISTS[ref].table)).map((r) => ({ id: r.id, name: r.name, name_bn: r.name_bn, status: r.status })).sort(byName);
    return { rows: live(db.all(LISTS[key].table)).map((r) => view(key, r)).sort(byName), refs, can_delete: ctx.level === 3 };
  };
}

function save(key) {
  const list = LISTS[key];
  const fields = listFields(key);
  return (ctx, input) => {
    const { db } = ctx;
    const rows = live(db.all(list.table));
    const current = input.id ? rows.find((r) => r.id === input.id) : null;
    if (input.id && !current) throw new AppError('NOT_FOUND');
    if (current && !input.version) throw fieldError('version', 'val.required');
    const others = rows.filter((r) => r.id !== input.id);
    if (others.some((r) => r.name.toLowerCase() === input.name.toLowerCase())) throw fieldError('name', 'val.taken');
    const close = others.find((r) => stem(r.name) === stem(input.name));
    if (close && !input.confirm_similar) throw fieldError('name', 'val.similar', { name: close.name });
    const record = { status: input.status };
    for (const [name, f] of Object.entries(fields)) {
      const value = input[name];
      if (f.kind === 'ref' && value) {
        const target = db.get(LISTS[f.ref].table, value);
        const usable = target && target.status !== 'deleted' && (target.status === 'active' || (current && current[name] === value));
        if (!usable) throw fieldError(name, 'val.not_found');
      }
      record[name] = f.kind === 'bool' ? Boolean(value) : value === null ? (f.kind === 'int' || f.kind === 'number' ? null : '') : value;
    }
    const row = current ? db.update(list.table, current, record, input.version) : db.insert(list.table, record);
    return saved(row.id, view(key, row));
  };
}

function remove(key) {
  const list = LISTS[key];
  return (ctx, input) => {
    const { db } = ctx;
    if (ctx.level !== 3) throw new AppError('FORBIDDEN');
    const current = db.get(list.table, input.id);
    if (!current || current.status === 'deleted') throw new AppError('NOT_FOUND');
    const uses = list.usedBy.reduce((n, [table, column]) => n + live(db.all(table)).filter((r) => r[column] === current.id).length, 0);
    if (uses) throw new AppError('IN_USE', { count: uses });
    db.update(list.table, current, { status: 'deleted' }, input.version);
    return saved(current.id);
  };
}

// The first setup makes each list's starting rows, in the order the lists
// are described (a list is described after the lists it refers to).
export function seedLists(db) {
  const ids = {};
  for (const key of Object.keys(LISTS)) {
    ids[key] = {};
    const fields = listFields(key);
    for (const start of LISTS[key].start) {
      const record = { status: 'active' };
      for (const [name, f] of Object.entries(fields)) {
        const value = start[name];
        record[name] = f.kind === 'ref' ? ids[f.ref][value] : f.kind === 'bool' ? Boolean(value) : value === undefined ? (f.kind === 'int' || f.kind === 'number' ? null : '') : value;
      }
      ids[key][start.name] = db.insert(LISTS[key].table, record).id;
    }
  }
}

export const LIST_HANDLERS = {};
for (const key of Object.keys(LISTS)) {
  LIST_HANDLERS[`list.${key}`] = read(key);
  LIST_HANDLERS[`list.${key}.save`] = save(key);
  LIST_HANDLERS[`list.${key}.remove`] = remove(key);
}
