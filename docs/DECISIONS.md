# Owner decisions

These decisions were made by the owner on 24 Nov 2026. Where they differ from `BLUEPRINT.md`, this file wins. `BLUEPRINT.md` describes v1 and is used as a **feature checklist only**.

## A completely new app
- Nothing is carried over from v1: no data, ids, spreadsheets, browser storage or code.
- v2 runs at its own web address. It has no v1 migration code.
- The database starts empty. The first owner creates their account with the one-time setup code, then sets up everything else.
- Tables, settings and actions are designed fresh. Only what a feature needs is added, when that feature is built.
- v1's Bangla is used only as a wording reference while writing new translations.

## Numbers and language
- Latin digits for all calculations, entries and stored values.
- Bangla digits only in text shown in Bangla.
- Where v1 spelled a word two ways, v2 uses:
  - "counted" → গণনা হয়েছে
  - "done" → সম্পন্ন
  - "open" as a button → খুলুন; "open" as a status → খোলা
  - "café stock" → ক্যাফের স্টক
- "Say why the quantity differs from the suggestion" → পরামর্শ থেকে পরিমাণ কেন আলাদা লিখুন
- Bangla sentences always carry every detail the English carries: who did it, what was done, how many days, today or yesterday.
- New words:
  - Receipts by item → আইটেম অনুযায়ী রসিদ
  - Saturday → শনিবার; Tuesday → মঙ্গলবার; Wednesday → বুধবার; Thursday → বৃহস্পতিবার
  - Thu (short) → বৃহস্পতি

## Brand
- The only logo is the hand-and-book drawing with the word "Biblion" (`assets/biblion-logo.png`), used on letterheads.
- App icons show the drawing only, black on white. The maskable icon has padding for Android's round crop.
- The accent colour is indigo `#4f46e5`. The top bar and splash screen use the same indigo.

## People and permissions
- Staff never enter money: no money entries, no expense claims, no daily shift, no typed book sales.
- Staff may count café stock, record waste, and take a customer's special book order (name and phone).
- Every staff member can always work with **their own** items without a permission: their tasks, shifts and swap requests, leave and leave balance, punches, and payslips. They never see anyone else's.

## Money kinds
- "Bonus paid" is a money kind for one-off extra pay to staff. "Salary adjustment" is not used.
- "Sold" and "Damaged or lost" are book stock changes on the Books page, not money kinds.
- Every money kind has help text, including "Food allowance paid" and the shareholder "Advance given" and "Salary deduction".

## Settings with starting text
- Performance criteria, the four letter templates, and the day and month closing checklists are written fresh. The owner edits them in Settings.

## HR
- All HR features in the blueprint are in scope. Their tables are designed fresh.

## Uploads
- Documents can be uploaded with the upload button, from Android Share, **and by drag and drop**:
  - dropping files on the upload area;
  - dropping files anywhere on the app window, which opens Upload with the files attached.
  - All three ways feed the same reading pipeline and the same checks: file types, the 10 MB PDF limit, and duplicate files.

## Deployment and workflow
- `clasp` may be used to deploy to Apps Script. It is never part of the app.
- Work goes on a branch and reaches `main` through a pull request the owner reviews.

## Milestone 2: money (assumptions to confirm)
These are working choices made while building. Each is easy to change.
- **Scope.** The money screen has the Money kinds and the shareholder pay kinds:
  - Vendors and Publishers come with the Books milestone, with their separate ledger.
  - Staff pay comes with HR.
  - The shareholder "Advance given" and "Salary deduction" come with payroll.
- **Due taken** means a person took goods and will pay later. No money moves; their due goes up. **Due collected** brings the money into an account and lowers their due.
- **Loan repayment** asks who pays back: the shareholder pays the shop, or the shop pays the shareholder.
- **Approval switches start as "final for a manager".** The amount limit starts at Tk 2,000. A shareholder can change both in Settings → Approvals.
- **Manager permissions.** Managers may enter expenses, transfers and dues directly. Other income and loans can be sent as requests. Shareholder pay is for shareholders only.
- **Who sees what.**
  - Managers see only the money entries they made, and no account balances.
  - Shareholders see everything.
- **Corrections and cancellations.**
  - The person who made an entry may correct or cancel it while it waits.
  - After that, only a shareholder can correct or cancel it.
- **Amounts** are shown with Bangladesh digit grouping: Tk 1,00,000.
- **Closed months** are locked in the month-closing milestone. Until then, no month is locked.

## Milestone 3: daily shift and day closing (assumptions to confirm)
- **The daily shift is stored as a money entry** of its own kind. It is approved, corrected, cancelled and logged like other money, and appears in the money list.
- **Sales are typed in.** Uploading the Loyverse report and the photo of the shift slip come with the upload milestone.
- **What the shift does to each account:**
  - Cash sales go into the cash drawer, and cash handed to a shareholder comes out of it.
  - Any short or over is booked to the drawer, so after the shift the drawer holds exactly what was counted.
  - bKash and card sales go to the accounts chosen on the shift. Cash handed over goes to the account it was handed to, for example "Held by a shareholder".
- **What the drawer should hold** is worked out as: the drawer's opening balance plus every entry dated up to and including that day, other than the shift itself.
- **Any short or over makes the shift wait for a shareholder,** whatever the size. A balanced shift follows the "Daily shift" switch in Settings → Approvals.
- **The day-closing checklist** has these steps:
  - shift entered (needed before closing);
  - drawer balanced;
  - nothing from the day waiting for a shareholder;
  - nothing unsent on this phone.

  Café count, deliveries and tasks join when those are built.
- **A closed day is locked for managers:** no new, corrected or cancelled money dated that day. A shareholder can still change it, and can reopen the day with a reason.

## Milestone 4: books, part 1 (assumptions to confirm)
- **Vendor and publisher entries** are stored with the other money entries but keep their own payables. They are never expenses, and they don't change profit.
- **What a publisher is owed:**
  - "Paid for copies as they sell": the cost of copies sold.
  - "Paid for everything delivered": the cost of copies delivered, less copies returned.
  - Both add the opening due, refunds and advances written off, and subtract payments.
- **A copy's cost** is the average cost of its deliveries. Before any delivery, it is the printed price less the publisher's commission.
- **Selling price** is the title's own price if it has one. Otherwise it is the printed price less the publisher's shop discount to customers, rounded to the taka.
- **"Covers sales up to"** is suggested as the latest sales day the payments so far, with this one, fully settle. You can change it.
- **"Bought with cash" from a publisher** isn't a separate kind. Record a delivery with "Paid on delivery" instead.
- **Damaged copies in a delivery** are sent back and never stocked. Keeping damaged copies at full or lower cost, extra and short copies, and delivery charges come with requisitions in part 2.
- **Same vendor bill number twice is blocked.** Case, spaces and punctuation are ignored ("MV-7", "mv 7" and "MV/7" are one bill). This is a little wider than the blueprint's "case and spaces".
- **What the shop owes vendors and publishers,** and supplier statements, are for shareholders only, like account balances.
- **Typed book sales** may take stock below zero, so typing a sale at the till never fails; the stock then shows in warning colour. Matching typed sales against the Loyverse upload comes with uploads.
- **Book approval settings** ("final for a manager, can be flagged") come with review flags. Until then, deliveries, stock changes and typed sales by managers are final.
- **Still to come in part 2:** requisitions, special orders, full stock-take, the Loyverse item import, and learning other names.

## Milestone 5: books, part 2 (assumptions to confirm)
- **A requisition draft asks again for what sold** since the publisher's last requisition, plus customers' open special orders. A publisher's first requisition looks back 30 days (a setting).
- **Drafts can be made automatically** each week (from Saturday) or each month, by the hourly job, for publishers with something to ask for. A manager checks a draft and sends it.
- **Matching a delivery to a requisition, title by title:**
  - **Short copies** stay "still expected", or are marked "not coming".
  - **Extra copies** are kept or sent back.
  - **Damaged copies** are sent back, kept at full cost, or kept at a lower cost. Kept damaged copies count as received.
- **Closing a requisition** marks what is left "not coming". Its special orders wait for the next requisition.
- **Special orders:**
  - Staff can take them, and can see the book catalogue to do so (without costs).
  - Only managers and shareholders can see the list, because it holds customers' names and phones.
  - An order is marked arrived when a delivery brings its title, oldest order first.
  - "Tell the customer" opens WhatsApp with the message ready, and marks the order as told.
- **An advance taken on a special order** is noted on the order. The money itself counts in that day's sales, through the daily shift.
- **Stock-take:**
  - Only one is open at a time.
  - Counts are kept between sittings.
  - Applying it changes only the titles counted.
- **Still to come:** the Loyverse item import, and learning other names for titles, come with uploads.

## Milestone 6: uploads, part 1 (assumptions to confirm)
- **Ways in:**
  - the upload button in the top bar, and Home;
  - **drag and drop**, on the upload area or anywhere on the app (a "Drop to upload" layer appears);
  - **Android Share** from another app, up to 10 files at a time.
- **Before upload:**
  - Photos are shrunk to at most 1600 px and saved as JPEG.
  - Two or more photos are joined into one PDF unless you untick it.
  - PDFs are limited to 10 MB.
- **The same file twice is refused** (found by its fingerprint), unless the earlier upload was discarded.
- **Text reading:** Drive's free text reading reads in Bangla and English. The app asks what the document is before anything else, and before Gemini is used.
- **Gemini is off by default.** When a shareholder turns it on and saves a key, it is used only for receipts and bills, and only to fill in what the text reading missed. The key is kept in Script Properties, never in a sheet or a reply.
- **Document kinds handled for now:**
  - expense receipt and utility bill, which become an expense;
  - vendor bill, which becomes a purchase on credit or paid on the spot ("COD" or "Received" means paid);
  - payment slip, which becomes a vendor or publisher payment (or an expense, income or transfer, as you choose);
  - publisher's challan, which becomes a delivery with its title lines, adding titles that are new;
  - "something else", where the file is just kept.
- **One document makes one entry.** A challan's payment on delivery is part of the same delivery.
- **Duplicates:**
  - A possible duplicate offers to file the document on the earlier entry instead.
  - The same challan for the same publisher is refused, and offers the earlier delivery.
  - The same bKash TrxID (10 letters and digits) is refused.
- **Still to come:**
  - staff papers (private, no text kept), statements and matching, the Loyverse import, customer and loyalty cards, shopping lists and quotations;
  - document expiry, search and email;
  - checking the reading rules against the owner's real documents.

## Milestone 7: café (assumptions to confirm)
- **Item kinds:** café **stock** is counted at every daily closing; **supplies** are checked when ordering (the on-hand box on an order).
- **The checklist of 38 common items** (19 stock, 19 supplies) was written for v2, with Bangla names, units, shelf life and usual cover. Edit or extend it freely.
- **Staff do the daily count:** count, waste with a reason, and expired. It can be saved offline. Staff see no orders or costs.
- **Use is worked out between counts:**
  - the earlier count + what came in − waste − expired − the new count;
  - correcting an earlier day recalculates the later days;
  - before an item's first count it had nothing on hand except what came in.
- **Suggested amounts:**
  - daily use over the last 4 weeks (at least 14 days of counts; a setting) × (days to buy for + days until it arrives) − what's on hand;
  - rounded up to the order multiple, and at least the smallest order;
  - "Buy for" is never longer than an item keeps.
  - "Automatic" means the item's shelf life, up to a month.
- **A changed amount needs a reason,** kept on the order.
- **A manager's order is final by default,** or a shareholder confirms it (Settings → Café). Nobody approves their own.
- **Each bill is a vendor purchase** (paid now or on credit), with the usual duplicate checks and money approvals. Its items come in as batches. Expiry is the date typed, or the received date plus the item's shelf life.
- **Expiry:** each batch is used up oldest first, and what's left in a batch expiring within 2 days (a setting) is listed on the count page.
- **Day closing** shows the café count as a step to check; it doesn't block closing.
- **Still to come:**
  - PDF and Excel copies of an order come with the downloads milestone.
  - Linking names typed on bills to items, and comparing with Loyverse café sales, come with uploads part 2.

## Milestone 8: HR, part 1 — staff records and attendance (assumptions to confirm)
- **Staff records** are separate from sign-ins. A record can be linked to one sign-in, so that person can punch from their own phone and see their own attendance. Someone without a sign-in punches on the shop's punch device.
- **Private parts** are sent and saved only with their permission:
  - NID, date of birth and address (`staff.identity`, shareholders);
  - emergency contacts (`staff.emergency`, managers and shareholders);
  - family (`staff.family`, shareholders);
  - salary (`salary.view` / `salary.edit`, shareholders).
- **Work hours** are one start and end time per person, plus their weekly days off. Roster, shift swaps, leave and holidays come in HR part 2. Until then, a leave day shows as absent.
- **Punching from a phone:**
  - The punch is checked against the shop's position (set in Settings → Attendance, 50 m by default).
  - From further away, the person gives a reason and a manager checks the punch, or it is refused. This is a setting.
  - A phone that only knows its position roughly (beyond 100 m) counts as further away.
- **The phone's clock is corrected:** each request carries the phone's time, so a wrong clock doesn't move the punch. A clock more than 5 minutes wrong is marked on the punch.
- **Punches made offline** keep the time the button was pressed. They are checked by a manager (a setting can accept them), and refused after 7 days.
- **Punch order:** in, out, in, out. The same punch twice within 2 minutes is one punch.
- **The shop's punch device:**
  - A manager makes a tablet or phone a punch device in Settings → Attendance. With nobody signed in, it shows everyone with a PIN.
  - Each punch is signed with the device's secret and a key made from the person's PIN (PBKDF2, then HMAC-SHA256). The PIN never leaves the device, and the server keeps only its hash.
  - 5 wrong PINs lock that person's PIN for 15 minutes.
  - Punches go one at a time through the usual offline queue (each with its own id), not a batch route.
  - The device needs no location.
- **Checks and corrections:**
  - Staff ask for a correction (a missing punch, or one replacing a wrong one) with a reason.
  - A manager decides staff corrections; a shareholder decides managers'. Nobody decides their own, and a shareholder's own is final.
  - A manager can add a missing punch for someone directly.
  - "Not accepted" needs a note the person sees.
- **A day's summary:**
  - Late counts after the grace minutes (0 by default), and then from the start time.
  - A missing punch-out shows as "No punch out" 2 hours after work ends.
  - Days before someone joined are not counted.
- **Not yet:** night shifts across midnight, half days, and attendance in payroll (HR part 3).

## Milestone 9: HR, part 2 — rota, leave and holidays (assumptions to confirm)
- **What a day is meant to be,** most important first:
  1. approved leave;
  2. a public holiday when the shop closes;
  3. the rota for that date;
  4. the person's usual hours and weekly days off.

  Attendance uses this, so leave and closed holidays no longer show as absent. Someone who works on a day off is never marked late.
- **Shifts** are named hours, such as "Morning 08:00–14:00". A manager puts a shift, a day off, or usual hours on any person's date. The week starts on Saturday.
- **Rota requests from staff,** each decided by a manager (or a shareholder when a manager is involved). Nobody decides their own.
  - **Choose a shift** for a day from tomorrow up to 7 days ahead, with at least 8 hours' rest between days. A shift can be marked "no manager needed". This replaces v1's next-day selection reminder and automatic confirmation, and staff can be stopped from choosing in Settings.
  - **Swap a day** with a colleague: the colleague agrees first, then a manager. Both people's days are swapped.
  - **Move the weekly day off** to a working day in the same week, asked at least 1 day ahead.
- **Public holidays** are a list per year in Settings → Leave and rota. By default the shop stays open on them and the people on the rota work. With "closed", nobody is expected and leave doesn't count those days.
- **Leave:**
  - Two kinds: paid (from the balance) and unpaid.
  - Earning starts when probation ends (3 months), at 1.5 days a month: per full month of service, or per full calendar month with the first part month prorated (settings). The month running now never counts.
  - The balance is worked out when shown (earned + adjustments − approved paid leave), so there is no monthly earning job.
  - Leave is counted in working days by default, so days off and closed holidays don't count.
  - Paid leave can't go below what is left after waiting requests (a setting can allow it).
  - Leave for the same dates as other leave is refused.
  - People can cancel their own leave until it starts. After that only someone who may decide it can cancel it.
  - A manager can record leave for someone directly.
  - Only shareholders adjust a balance, always with a reason, and never their own.
- **Not yet:** moving tasks when leave is approved (comes with tasks), cashing in unused leave when someone leaves (comes with staff leaving), reminders, and making an inactive shift active again (add it again instead).

## Milestone 10: HR, part 3 — payroll (assumptions to confirm)
- **A payslip per person and month,** worked out from:
  - the salary on the staff record;
  - the days employed (from joining to the new "Left on" date);
  - approved unpaid leave;
  - the absent days a shareholder chooses to cut when issuing it. Absences are decided case by case, never cut automatically.

  A day's pay is the salary ÷ the days in that month, or ÷ 30 (a setting).
- **Drafts and issued payslips:** until a shareholder issues it, a payslip is a draft that follows attendance and leave. Once issued its figures stay as they were. To change it, cancel it with a reason and issue it again. Nobody issues their own.
- **Each person's pay account:**
  - What the shop owes them: starting balance + issued payslips + food allowance earned − salary paid − food allowance paid − deductions.
  - Their advance: starting advance + advances − deductions.
  - Worked out when shown, like the leave balance.
- **Staff pay on the money screen:** Salary paid (for a month), Food allowance paid, Bonus paid, Advance given and Salary deduction.
  - For shareholders only by default (`acc.staffpay`), and never sent as a request.
  - A deduction recovers an advance, so it can't be more than the advance still owed.
  - Bonus is paid as it is given and isn't on the payslip.
- **Shareholders' "Advance given" and "Salary deduction"** work the same way against a shareholder's advance.
- **Food allowance:**
  - A rate a day, from each date on. A new rate never changes earlier days.
  - Earned every day employed (default), every day except unpaid leave, or only the days the person punched in.
  - v1's "week starts" setting isn't used; the allowance is shown as one running amount.
- **Payroll page** (shareholders): the month's payslips, what was paid for the month and what is left, everyone's pay account, and buttons that open the money screen with the person, kind, amount and month filled in.
- **Payslips:** staff see their own under My pay. A payslip prints (or saves as PDF) on the letterhead.
- **Not yet:** overtime pay (`payroll.overtime_paid` stays off), settling pay when someone leaves (comes with staff leaving), and payslips by email.
