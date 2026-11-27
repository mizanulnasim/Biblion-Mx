// Reports: choose one (only those this person may see) and what it is for;
// it shows on the letterhead, prints (or saves as PDF from the print
// dialog) and downloads as Excel. Opened from a report-printing task, the
// print is what the task is done with.

import { html, on, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { errorText } from '../ui/form.js';
import { reportView, workbook } from '../ui/report.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { REPORTS } from '../../../shared/reports/reports.js';
import { xlsx } from '../../../shared/lib/xlsx.js';

const TITLES = {
  daily: 'rep.title.daily', monthly: 'month.report', shareholders: 'rep.title.shareholders', salary: 'rep.title.salary',
  loans: 'rep.title.loans', dues: 'rep.title.dues', all_money: 'rep.title.all_money', books_monthly: 'rep.title.books_monthly',
  publisher_statement: 'rep.title.publisher_statement', tracker: 'rep.title.tracker', vendors: 'rep.title.vendors',
  vendor_statement: 'rep.title.vendor_statement', payables: 'rep.title.payables',
};
// What each kind of report is asked for, as query keys.
const KEYS = { date: ['date'], month: ['month'], range: ['from', 'to'], publisher: ['party_id', 'from', 'to'], vendor: ['party_id', 'from', 'to'] };

function inputsView(report, input, choices) {
  const kind = REPORTS[report].input;
  const range = html`<label class="field-inline">${t('rep.from')} <input type="date" data-key="from" value="${input.from}"></label>
    <label class="field-inline">${t('rep.to')} <input type="date" data-key="to" value="${input.to}"></label>`;
  if (kind === 'publisher' || kind === 'vendor') {
    return html`<label class="field-inline">${t('rep.party')} <select data-key="party_id">${choices.map((c) => html`<option value="${c.id}" ${c.id === input.party_id ? 'selected' : ''}>${c.name}</option>`)}</select></label>${range}`;
  }
  if (kind === 'date') return html`<label class="field-inline">${t('rep.date')} <input type="date" data-key="date" value="${input.date}"></label>`;
  if (kind === 'month') return html`<label class="field-inline">${t('hr.month')} <input type="month" data-key="month" value="${input.month}"></label>`;
  return range;
}

export const reportsPage = {
  path: '/reports',
  title: 'nav.reports',
  perm: 'acc.view_all|payroll.view|closing.month|acc.shareholders',
  mount(el, { query }) {
    const mine = Object.keys(REPORTS).filter((id) => can(REPORTS[id].perm));
    const report = mine.includes(query.report) ? query.report : mine[0];
    let data = null;
    // Opens the same page with changed query keys (the task stays).
    const go = (changes) => {
      const next = new URLSearchParams({ ...query, ...changes });
      location.hash = `#/reports?${next}`;
    };
    async function load() {
      const asked = Object.fromEntries(KEYS[REPORTS[report].input].filter((k) => query[k]).map((k) => [k, query[k]]));
      try {
        data = (await read('reports.get', { report, ...asked })).data;
        render(el, html`<div class="list-bar no-print">
            <label class="field-inline">${t('rep.choose')} <select data-role="report">${mine.map((id) => html`<option value="${id}" ${id === report ? 'selected' : ''}>${t(TITLES[id])}</option>`)}</select></label>
            ${inputsView(report, data.input, data.choices)}
            <button type="button" class="btn" data-act="excel">${t('rep.download')}</button>
            <button type="button" class="btn btn-primary" data-act="print">${t('pay.print')}</button>
          </div>
          ${query.task ? html`<p class="notice no-print">${t('rep.task_note')}</p>` : ''}
          ${reportView(data.model)}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const onChange = (e) => {
      if (e.target.dataset.role === 'report') {
        const keep = { ...query };
        for (const k of ['date', 'month', 'from', 'to', 'party_id']) delete keep[k];
        location.hash = `#/reports?${new URLSearchParams({ ...keep, report: e.target.value })}`;
      } else if (e.target.dataset.key && e.target.value) {
        go({ report, [e.target.dataset.key]: e.target.value });
      }
    };
    el.addEventListener('change', onChange);
    const off = on(el, 'click', {
      // Printing is noted, so a report-printing task can be done with it.
      print: async () => {
        window.print();
        const ref = Object.values(data.input).join(' – ');
        const reply = await write('reports.printed', { report, ref });
        if (query.task && reply.status === 'saved') await write('tasks.record', { id: query.task, record_id: reply.record_id });
      },
      excel: () => {
        const bytes = xlsx(workbook(data.model));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = `${t(TITLES[report])} ${Object.values(data.input).join(' ')}.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
    });
    if (!report) return off;
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      off();
      el.removeEventListener('change', onChange);
    };
  },
};
