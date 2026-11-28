// Announcements, job descriptions and procedures (SOPs): written by managers
// for everyone, staff, managers, or chosen people; read, and acknowledged
// where asked. Changing the words of a document raises its version, so
// everyone acknowledges it again. Everyone reads what is addressed to them
// without a permission; writing needs announcements.manage (announcements)
// or responsibilities.manage (job descriptions and procedures).

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { roleById } from '../../shared/schema/permissions.js';
import { staffOfUser } from './staff.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
const PERM = { announcement: 'announcements.manage', jd: 'responsibilities.manage', sop: 'responsibilities.manage' };

// Whether a document is addressed to this sign-in.
function addressedTo(doc, user, staff) {
  const level = roleById(user.role_id).level;
  if (doc.audience === 'everyone') return true;
  if (doc.audience === 'staff') return level === 1;
  if (doc.audience === 'managers') return level >= 2;
  return Boolean(staff && (doc.staff_ids || []).includes(staff.id));
}

function readOf(db, doc, userId) {
  return db.all('Doc_Reads').find((r) => r.doc_id === doc.id && r.user_id === userId) || null;
}

function docView(doc, read) {
  const current = read && read.version_no === doc.version_no;
  return {
    id: doc.id, version: doc.version, kind: doc.kind, title: doc.title, body: doc.body, audience: doc.audience, staff_ids: doc.staff_ids || [],
    needs_ack: doc.needs_ack, version_no: doc.version_no, show_until: doc.show_until, status: doc.status, published_at: doc.published_at,
    read: Boolean(current && read.read_at), acked: Boolean(current && read.acked_at),
  };
}

// What this person should read: announcements (active, newest first) and
// their job descriptions and procedures.
function mine(ctx) {
  const { db } = ctx;
  const staff = staffOfUser(db, ctx.user.id);
  const docs = db.all('Docs').filter((d) => d.status === 'active' && addressedTo(d, ctx.user, staff))
    .sort((a, b) => (a.published_at < b.published_at ? 1 : -1))
    .map((d) => docView(d, readOf(db, d, ctx.user.id)));
  return { announcements: docs.filter((d) => d.kind === 'announcement'), procedures: docs.filter((d) => d.kind !== 'announcement') };
}

// For Home: unread announcements, and anything waiting for an acknowledgement.
export function docsWaiting(ctx) {
  const { announcements, procedures } = mine(ctx);
  const today = dhakaDate(ctx.db.now.getTime());
  return {
    unread: announcements.filter((d) => !d.read).length,
    to_ack: [...announcements, ...procedures].filter((d) => d.needs_ack && !d.acked).length,
    pinned: announcements.filter((d) => d.show_until && d.show_until >= today).map((d) => ({ id: d.id, title: d.title, read: d.read })),
  };
}

function mark(ctx, { id, ack }) {
  const { db } = ctx;
  const doc = db.get('Docs', id);
  if (!doc || doc.status !== 'active' || !addressedTo(doc, ctx.user, staffOfUser(db, ctx.user.id))) throw new AppError('NOT_FOUND');
  const read = readOf(db, doc, ctx.user.id);
  const fields = { version_no: doc.version_no, read_at: db.nowIso, acked_at: ack ? db.nowIso : '' };
  // A repeated read of the version already acknowledged keeps the acknowledgement.
  if (read && read.version_no === doc.version_no && read.acked_at && !ack) return saved(doc.id);
  if (read) db.update('Doc_Reads', read, fields);
  else db.insert('Doc_Reads', { doc_id: doc.id, user_id: ctx.user.id, ...fields });
  return saved(doc.id);
}

// Managers: the documents they may write, with who has read or acknowledged each.
function manage(ctx, { kind }) {
  const { db } = ctx;
  if (!ctx.can(kind === 'announcement' ? PERM.announcement : PERM.sop)) throw new AppError('FORBIDDEN');
  const users = db.all('Users').filter((u) => u.status === 'active');
  const staffOf = new Map(db.all('Staff').filter((s) => s.user_id).map((s) => [s.user_id, s]));
  const kinds = kind === 'announcement' ? ['announcement'] : ['jd', 'sop'];
  const items = db.all('Docs').filter((d) => kinds.includes(d.kind)).sort((a, b) => (a.published_at < b.published_at ? 1 : -1)).map((d) => {
    const people = users.filter((u) => addressedTo(d, u, staffOf.get(u.id) || null)).map((u) => {
      const r = readOf(db, d, u.id);
      const current = r && r.version_no === d.version_no;
      return { name: u.display_name, read: Boolean(current && r.read_at), acked: Boolean(current && r.acked_at) };
    });
    return { ...docView(d, null), people };
  });
  return { items, staff: db.all('Staff').filter((s) => s.status === 'active').map((s) => ({ id: s.id, name: s.name })) };
}

function save(ctx, input) {
  const { db } = ctx;
  if (!ctx.can(PERM[input.kind])) throw new AppError('FORBIDDEN');
  const ids = [...new Set(input.staff_ids.map((x) => x.id))];
  if (input.audience === 'people' && !ids.length) throw fieldError('staff_ids', 'val.required');
  const fields = {
    kind: input.kind, title: input.title, body: input.body, audience: input.audience, staff_ids: input.audience === 'people' ? ids : [],
    // Job descriptions and procedures are always acknowledged.
    needs_ack: input.kind === 'announcement' ? Boolean(input.needs_ack) : true,
    show_until: input.kind === 'announcement' ? input.show_until || '' : '', status: input.status,
  };
  if (!input.id) {
    const row = db.insert('Docs', { ...fields, version_no: 1, published_at: db.nowIso });
    return saved(row.id);
  }
  const doc = db.get('Docs', input.id);
  if (!doc || doc.kind !== input.kind) throw new AppError('NOT_FOUND');
  // New words: a new version, so everyone reads and acknowledges it again.
  const changed = doc.title !== fields.title || doc.body !== fields.body;
  db.update('Docs', doc, { ...fields, version_no: changed ? doc.version_no + 1 : doc.version_no, published_at: changed ? db.nowIso : doc.published_at }, input.version);
  return saved(doc.id, { new_version: changed });
}

export const DOC_HANDLERS = {
  'docs.mine': mine,
  'docs.mark': mark,
  'docs.manage': manage,
  'docs.save': save,
};
