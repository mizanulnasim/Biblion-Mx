// My attendance: punch in and out from this phone, this month's days, my
// corrections, and the PIN for the shop's punch device. Everyone with a
// staff record has it; nobody sees anyone else's here.

import { html, on, render } from '../ui/html.js';
import { errorBox, staleNotice } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { onArea } from '../core/live.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { fixesView, monthView, openFix, punchCard, startPunch, thisMonth } from './attendance-common.js';

function openPin(pinSet) {
  const dialog = formDialog(t(pinSet ? 'hr.change_pin' : 'hr.set_pin'), formView({
    submit: t('common.save'),
    fields: [{ name: 'pin', label: t('hr.pin'), type: 'password', inputmode: 'numeric', autocomplete: 'new-password', required: true, help: t('hr.pin_help') }],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['attendance.pin'].schema,
    busyLabel: t('common.saving'),
    onSubmit: (v) => write('attendance.pin', v),
    onSaved: () => {
      dialog.close();
      toast(t('hr.pin_saved'));
    },
  });
}

export const myAttendancePage = {
  path: '/me/attendance',
  title: 'nav.my_attendance',
  perm: 'self.staff',
  mount(el, { query }) {
    let month = query.month || thisMonth();
    let data = null;
    async function load() {
      try {
        const [todayReply, monthReply] = await Promise.all([read('attendance.today'), read('attendance.mine', { month })]);
        data = { today: todayReply.data, month: monthReply.data, cachedAt: todayReply.cachedAt || monthReply.cachedAt };
        draw();
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    function draw() {
      const { today, cachedAt } = data;
      render(el, html`${staleNotice(cachedAt)}
        ${today.staff && today.day ? punchCard(today) : ''}
        <section class="panel">
          <div class="list-bar">
            <label class="field-inline">${t('hr.month')} <input type="month" data-role="month" value="${month}" max="${thisMonth()}"></label>
            <button type="button" class="btn" data-act="pin">${t(data.month.staff.pin_set ? 'hr.change_pin' : 'hr.set_pin')}</button>
          </div>
          ${monthView(data.month, { fixLabel: t('hr.ask_fix') })}
        </section>
        ${fixesView(data.month.fixes, { canWithdraw: true })}`);
    }
    const offClick = on(el, 'click', {
      punch: (e, btn) => startPunch(btn, load),
      pin: () => openPin(data.month.staff.pin_set),
      fix: (e, btn) => openFix({ date: btn.dataset.date, day: data.month.days.find((d) => d.date === btn.dataset.date), onSaved: load }),
      withdraw: async (e, btn) => {
        const reply = await write('attendance.fix.withdraw', { id: btn.dataset.id });
        if (reply.status === 'saved') load();
      },
    });
    const onMonth = (e) => {
      if (e.target.dataset.role !== 'month' || !e.target.value) return;
      month = e.target.value;
      load();
    };
    el.addEventListener('change', onMonth);
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
      el.removeEventListener('change', onMonth);
    };
  },
};
