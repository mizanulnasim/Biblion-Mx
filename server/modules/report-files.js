// Month-end report files (owner decision): on closing, the monthly,
// shareholders' and salary reports are kept as PDF and Excel in Drive
// (Monthly reports, by year), listed on the closing, and emailed to the
// shareholders who set an address. Written in the language of whoever
// closes the month, on the letterhead.

import { xlsx } from '../../shared/lib/xlsx.js';
import { reportSheets } from '../../shared/reports/sheets.js';
import { digitsFor } from '../../shared/lib/messages.js';
import { roleById } from '../../shared/schema/permissions.js';
import { dayText, figureText, moneyText, text } from '../kernel/i18n.js';
import { personalSettings } from '../kernel/settings.js';
import { folderFor, htmlToPdf, saveFile, sendMail, sha256Hex } from '../platform.js';
import { shopDetails } from './meta.js';
import { monthReport } from './reports.js';
import { closeMonth } from './month.js';

const MONTH_REPORTS = ['monthly', 'shareholders', 'salary'];
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// The page's look, with the design tokens' values put in (Google's PDF
// maker may not know CSS variables).
const DOC_CSS_RAW = `
body { font-family: var(--font-doc); font-size: 11pt; color: var(--text); }
.lh { display: flex; gap: 16px; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 12px; }
.lh img { height: 56px; } .lh .name { font-size: 18pt; } .muted { color: var(--text-muted); }
h2 { margin: 4px 0; } h3 { margin: 16px 0 4px; font-size: 12pt; }
table { border-collapse: collapse; width: 100%; } td, th { padding: 3px 6px; border-bottom: 1px solid var(--border); text-align: left; }
th { font-size: 9pt; color: var(--text-muted); } .n { text-align: right; } .tot td { font-weight: bold; border-top: 1px solid var(--text); }
.sign td { border: 0; border-top: 1px solid var(--text); padding-top: 6px; width: 30%; } .sign { margin-top: 48px; border-spacing: 24px 0; border-collapse: separate; }
`;
const withTokens = (css) => css.replace(/var\((--[\w-]+)\)/g, (m, name) => (globalThis.BIBLION_TOKENS || {})[name] || 'inherit');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// A report text as words (shared/reports/sheets.js has the kinds).
function textOf(lang) {
  const words = (x) => {
    if (x === null || x === undefined) return '';
    if (typeof x === 'number') return figureText(lang, x);
    if (typeof x === 'string') return x;
    if ('s' in x) return x.s;
    if ('n' in x) return digitsFor(lang, x.n);
    if ('d' in x) return x.d ? dayText(lang, x.d) : '';
    return text(lang, x.t, Object.fromEntries(Object.entries(x.p || {}).map(([k, v]) => [k, v && typeof v === 'object' ? words(v) : v])));
  };
  return words;
}

// The report as a page for Google to turn into a PDF.
function pageHtml(model, lang, shop) {
  const DOC_CSS = withTokens(DOC_CSS_RAW);
  const words = textOf(lang);
  const cell = (x, type) => (typeof x === 'number' && type === 'percent' ? digitsFor(lang, x) : esc(words(x)));
  const blocks = model.blocks.map((b) => {
    if (b.kind === 'section') return `<h3>${esc(words(b.title))}</h3>`;
    if (b.kind === 'note') return `<p class="muted">${esc(words(b.text))}</p>`;
    if (b.kind === 'sign') return `<table class="sign"><tr>${b.labels.map((l) => `<td>${esc(words(l))}</td>`).join('')}</tr></table>`;
    if (b.kind === 'kv') {
      return `<table class="kv">${b.rows.map((r) => `<tr class="${r.total ? 'tot' : ''}"><td>${esc(words(r.label))}</td><td class="n">${typeof r.value === 'number' ? esc(moneyText(lang, r.value)) : esc(words(r.value))}</td></tr>`).join('')}</table>`;
    }
    const n = (c) => (c.type === 'text' ? '' : ' class="n"');
    return `<table class="grid"><tr>${b.columns.map((c) => `<th${n(c)}>${esc(words(c.label))}</th>`).join('')}</tr>`
      + b.rows.map((row) => `<tr>${row.map((x, i) => `<td${n(b.columns[i])}>${cell(x, b.columns[i].type)}</td>`).join('')}</tr>`).join('')
      + (b.total ? `<tr class="tot">${b.total.map((x, i) => `<td${n(b.columns[i])}>${cell(x, b.columns[i].type)}</td>`).join('')}</tr>` : '')
      + '</table>';
  }).join('\n');
  const contact = [shop.address, shop.phone, shop.email].filter(Boolean).map(esc).join(' · ');
  const logo = globalThis.BIBLION_LOGO ? `<img src="${globalThis.BIBLION_LOGO}" alt="">` : '';
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><style>${DOC_CSS}</style></head><body>
<div class="lh">${logo}<div><div class="name">${esc(shop.name)}</div><div class="muted">${esc(shop.tagline)}</div><div class="muted">${contact}</div></div></div>
<h2>${esc(words(model.title))}</h2>
${model.sub.map((x) => `<p class="muted">${esc(words(x))}</p>`).join('')}
${blocks}
</body></html>`;
}

// Makes and keeps the month's files; returns their Files rows' ids and the
// files themselves (for the email).
function monthFiles(ctx, month) {
  const { db } = ctx;
  const lang = (ctx.user.settings || {}).lang || 'en';
  const shop = shopDetails(db);
  const folder = folderFor(`Monthly reports/${month.slice(0, 4)}`);
  const words = textOf(lang);
  const files = [];
  for (const report of MONTH_REPORTS) {
    const model = monthReport(db, report, month);
    const base = `${words(model.title)} ${month}`;
    const made = [
      { name: `${base}.pdf`, mime: 'application/pdf', bytes: htmlToPdf(pageHtml(model, lang, shop), base) },
      { name: `${base}.xlsx`, mime: XLSX, bytes: xlsx(reportSheets(model, words)) },
    ];
    for (const f of made) {
      const row = db.insert('Files', {
        drive_id: saveFile(folder, f.name, f.mime, f.bytes), name: f.name, mime: f.mime, size: f.bytes.length, checksum: sha256Hex(f.bytes),
        sensitive: true, uploaded_by: ctx.user.id, status: 'active', record_ids: [],
      });
      files.push({ ...f, id: row.id });
    }
  }
  return files;
}

// Emails the month's files to each shareholder who set an address. One
// refused email doesn't stop the others; returns how many went.
function sendMonthFiles(db, month, files) {
  let sent = 0;
  for (const user of db.all('Users')) {
    const settings = personalSettings(db, user);
    if (user.status !== 'active' || roleById(user.role_id).level < 3 || !settings['notify.email_enabled'] || !settings['notify.email']) continue;
    const { lang } = settings;
    const shop = shopDetails(db).name;
    try {
      sendMail(settings['notify.email'], text(lang, 'mail.month_subject', { shop, month }),
        `${text(lang, 'mail.greeting', { name: user.display_name })}\n\n${text(lang, 'mail.month_body', { month })}\n\n${text(lang, 'mail.footer', { shop })}\n`, files);
      sent++;
    } catch {
      // Not sent; the files are still in Drive and on the closing page.
    }
  }
  return sent;
}

export const REPORT_FILE_HANDLERS = {
  'month.close': (ctx, input) => closeMonth(ctx, input, { make: monthFiles, send: sendMonthFiles }),
};
