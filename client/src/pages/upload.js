// Upload a document: pick files, drop them here (or anywhere on the app),
// or share them from another app on Android. Photos are made smaller, and
// several photos can be joined into one PDF. PDFs are at most 10 MB. Each
// upload then opens its check screen. Also: the list of uploads.

import { html, on, render } from '../ui/html.js';
import { chip, errorBox } from '../ui/feedback.js';
import { errorText, whileBusy } from '../ui/form.js';
import { mountList } from '../ui/list.js';
import { fileBytes, isImage, photosToPdf, shrinkPhoto, takeDropped, takeSharedFiles, toBase64 } from '../ui/files.js';
import { t } from '../core/i18n.js';
import { write } from '../core/api.js';
import { dateShortTime } from '../core/format.js';
import { INTAKE_KINDS, MAX_UPLOAD_BYTES, UPLOAD_TYPES } from '../../../shared/intake/kinds.js';
import { errorMessageId } from '../../../shared/contract/errors.js';

const ACCEPT = 'image/*,application/pdf,text/csv,.csv';
const kb = (n) => Math.max(1, Math.round(n / 1024));

function typeOf(file) {
  if (file.type) return file.type;
  return /\.csv$/i.test(file.name) ? 'text/csv' : '';
}

// What can't be uploaded, and why; or '' when the file is fine.
function problem(file) {
  const type = typeOf(file);
  if (!isImage(file) && !UPLOAD_TYPES.includes(type)) return t('intake.bad_type');
  if (!isImage(file) && file.size > MAX_UPLOAD_BYTES) return t('intake.too_big', { mb: MAX_UPLOAD_BYTES / 1048576 });
  return '';
}

// The files to send: photos made smaller (or joined into one PDF), others as they are.
async function prepare(files, join) {
  const photos = files.filter(isImage);
  const out = [];
  if (join && photos.length > 1) {
    const shrunk = [];
    for (const f of photos) shrunk.push(await shrinkPhoto(f));
    out.push({ name: `${photos[0].name.replace(/\.[^.]+$/, '')}-${photos.length}.pdf`, mime: 'application/pdf', bytes: photosToPdf(shrunk) });
  } else {
    for (const f of photos) out.push({ name: f.name.replace(/\.[^.]+$/, '.jpg'), mime: 'image/jpeg', bytes: (await shrinkPhoto(f)).bytes });
  }
  for (const f of files.filter((x) => !isImage(x))) out.push({ name: f.name, mime: typeOf(f), bytes: await fileBytes(f) });
  return out;
}

export const uploadPage = {
  path: '/upload',
  title: 'nav.upload',
  perm: 'intake.upload',
  mount(el, { query }) {
    let files = [];
    const messages = [];

    function draw() {
      const photos = files.filter(isImage).length;
      render(el, html`
        <p class="intro">${t('intake.intro')}</p>
        <label class="dropzone" data-role="zone">
          <input type="file" multiple accept="${ACCEPT}" data-role="pick" class="sr-only">
          <span class="dropzone-title">${t('intake.drop_here')}</span>
          <span class="muted">${t('intake.drop_help')}</span>
        </label>
        ${files.length ? html`<ul class="cards upload-files">${files.map((f, i) => html`<li class="card">
          <div class="card-head"><strong>${f.name}</strong><button type="button" class="icon-btn" data-act="remove" data-i="${i}" aria-label="${t('books.remove_line')}">×</button></div>
          <p class="muted">${t('intake.file_line', { kb: kb(f.size) })}</p>
          ${problem(f) ? html`<p class="field-error">${problem(f)}</p>` : ''}</li>`)}</ul>
          ${photos > 1 ? html`<label class="field-check"><input type="checkbox" data-role="join" checked> ${t('intake.join', { count: photos })}</label>` : ''}
          <div class="upload-error"></div>
          <div class="form-actions"><button type="button" class="btn btn-primary" data-act="upload" ${files.some(problem) ? 'disabled' : ''}>${t('intake.upload')}</button></div>` : ''}
        ${messages.length ? html`<div class="alert" role="alert">${messages.map((m) => html`<p>${m.text} ${m.id ? html`<a href="#/upload/doc?id=${m.id}">${t('intake.open_earlier')}</a>` : ''}</p>`)}</div>` : ''}`);
    }

    const add = (list) => {
      files = files.concat([...list]);
      draw();
    };

    el.addEventListener('change', (e) => {
      if (e.target.dataset.role === 'pick') add(e.target.files);
    });
    // Dropping on the zone; dropping anywhere else on the app comes here too.
    el.addEventListener('dragover', (e) => {
      if (e.target.closest('[data-role="zone"]')) {
        e.preventDefault();
        e.target.closest('[data-role="zone"]').classList.add('is-over');
      }
    });
    el.addEventListener('dragleave', (e) => {
      const zone = e.target.closest('[data-role="zone"]');
      if (zone) zone.classList.remove('is-over');
    });
    el.addEventListener('drop', (e) => {
      if (!e.target.closest('[data-role="zone"]')) return;
      e.preventDefault();
      e.stopPropagation();
      add(e.dataTransfer.files);
    });
    const off = on(el, 'click', {
      remove: (e, btn) => {
        files.splice(Number(btn.dataset.i), 1);
        draw();
      },
      upload: (e, btn) => whileBusy(btn, t('intake.uploading'), async () => {
        messages.length = 0;
        const joinBox = el.querySelector('[data-role="join"]');
        const ids = [];
        try {
          for (const f of await prepare(files, Boolean(joinBox && joinBox.checked))) {
            const reply = await write('intake.upload', { name: f.name, mime: f.mime, data: toBase64(f.bytes) });
            if (reply.status === 'saved') {
              ids.push(reply.record_id);
            } else {
              const field = reply.error.fields && reply.error.fields.data;
              messages.push({ text: `${f.name}: ${field ? t(field.code, field.params) : t(errorMessageId(reply.error.code), reply.error.params)}`, id: field && field.params.id });
            }
          }
        } catch (err) {
          messages.push({ text: errorText(err) });
        }
        files = [];
        if (ids.length === 1 && !messages.length) location.hash = `#/upload/doc?id=${ids[0]}`;
        else if (ids.length && !messages.length) location.hash = '#/uploads';
        else draw();
      }),
    });

    draw();
    if (query.dropped) add(takeDropped());
    if (query.shared) takeSharedFiles().then(add).catch((err) => render(el, errorBox(errorText(err))));
    return off;
  },
};

const STATES = {
  reading: ['intake.state.reading', 'muted'], needs_kind: ['intake.state.needs_kind', 'warn'], ready: ['intake.state.ready', 'warn'],
  confirmed: ['intake.state.confirmed', 'ok'], attached: ['intake.state.attached', 'ok'], discarded: ['intake.state.discarded', 'muted'],
};

export function intakeChip(status) {
  return chip(t(STATES[status][0]), STATES[status][1]);
}

export const uploadsPage = {
  path: '/uploads',
  title: 'nav.uploads',
  perm: 'intake.upload',
  mount(el) {
    const list = mountList(el, {
      key: 'uploads',
      action: 'intake.list',
      area: 'intake',
      searchLabel: t('intake.search'),
      empty: t('intake.empty'),
      emptySearch: t('list.no_match'),
      initial: { status: 'open' },
      filters: [{ name: 'status', label: t('intake.all'), options: [{ value: 'open', label: t('intake.filter.open') }, { value: 'done', label: t('intake.filter.done') }] }],
      tools: html`<a class="btn btn-primary" href="#/upload">${t('intake.new')}</a>`,
      columns: [
        { label: t('intake.when'), cell: (d) => dateShortTime(d.created_at), kind: 'nowrap' },
        { label: t('intake.file'), cell: (d) => d.name },
        { label: t('intake.kind'), cell: (d) => (d.kind ? t(INTAKE_KINDS[d.kind].label) : '—') },
        { label: t('money.field.state'), cell: (d) => intakeChip(d.status), kind: 'nowrap' },
        { label: t('money.field.entered_by'), cell: (d) => d.uploaded_by },
      ],
      onRow: (d) => {
        location.hash = `#/upload/doc?id=${d.id}`;
      },
    });
    return () => list.destroy();
  },
};
