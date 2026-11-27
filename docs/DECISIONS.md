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

## Milestone 11: tasks (assumptions to confirm)
- **Tasks are given to a person,** not a role. Managers give one-off tasks (`tasks.create`) and set repeating tasks (`tasks.manage`).
- **Repeating tasks:**
  - Daily, on chosen weekdays, or on one day of the month (the last day in a shorter month).
  - The hourly job makes them for today and tomorrow (a setting), and only on days the person is meant to work by the rota. So no tasks appear on days off, on leave, or on closed holidays.
  - Pausing or ending a repeating task skips its coming tasks. Changing its person moves the open coming ones.
- **Doing a task:**
  - People do their own tasks without a permission: done, or "can't do it" with a reason, and comments.
  - All three work offline and are sent later.
- **Checks:**
  - A task can need a manager's check. The manager accepts it or sends it back with a note, and it opens again.
  - Nobody checks their own task, and a manager's is checked by a shareholder.
- **Links:** a task can open a screen, such as the money screen with "Expense" chosen, the daily shift or the café count. The button shows only to someone who may use that screen. The task is still marked done by hand.
- **Leave:** when leave is approved, repeating tasks on those days are skipped, and one-off tasks move to the person's next working day (and show where they moved from).
- **Where tasks show:**
  - Home shows the person's tasks due today or overdue, and managers see "N tasks wait for your check".
  - Day closing gains a tasks step: open tasks are a warning, not a block.
- **Not yet:** reminders by notification or email (Home shows what is due and overdue), and printed task reports.

## Milestone 12: staff leaving and letters (assumptions to confirm)
- **Who records leaving:** a staff member resigns themselves (My settings → Resigning), giving their notice date and last day. A manager accepts it (a shareholder for a manager's). A manager can also record a resignation or a termination for someone, which is accepted at once.
- **Accepting sets the last day:** their pay then counts days up to it. Withdrawing clears it.
- **Handover:** moves every open task and repeating task of the person to one colleague in one step. Tasks are never made after someone's last day.
- **Final settlement:**
  - What the shop owes them now (their pay account)
  - \+ unused leave paid at a day's pay (all, none, or the days a shareholder chooses; "ask" is the default)
  - − notice short of 30 days, for a resignation (a setting)
  - − the advance still owed.
- **Confirming the settlement:**
  - It can only be confirmed once every payslip up to the last day is issued.
  - Once confirmed, the leave pay and notice cut join the pay account.
  - It is paid with the usual staff pay kinds: a deduction for the advance, then "Salary paid". The page offers both buttons filled in.
  - A shareholder can reopen it with a reason.
- **Completing:** after the last day, the person is marked "Left", their sign-in is turned off, and anything still open of theirs is skipped or ended.
- **The four letters** (offer, appointment, experience, release) are plain-text templates in Settings → Letters:
  - The first line is the title, with a blank line between paragraphs.
  - Placeholders such as `{{name}}` are filled from the record, and a misspelt placeholder is refused when saving.
  - Letters are in English. A letter keeps its words as issued and prints on the letterhead with the shop's address.
  - Offer and appointment letters need `staff.edit`; experience and release letters need `separation.manage` and a last day.
- **Not yet:** uploading the signed resignation letter (comes with staff papers in uploads part 2), and Bangla letter templates (one template per letter for now; the owner can write it in Bangla).

## Milestone 13: announcements, procedures and reviews (assumptions to confirm)
- **Announcements** (`announcements.manage`, managers):
  - For everyone, staff only, managers and shareholders only, or chosen people.
  - They can ask people to acknowledge them, and can stay pinned on Home until a date.
  - Opening one marks it read. Managers see read or acknowledged counts, and who hasn't yet.
- **Job descriptions and procedures (SOPs)** (`responsibilities.manage`):
  - Written the same way, for everyone or chosen people.
  - Always acknowledged ("I have read and understood this").
  - Changing the title or text makes a new version, which everyone acknowledges again.
  - Each person reads theirs under Notices.
- **Performance reviews** (`performance.manage`):
  - A manager starts one for a person and a period. If set (on by default), the person first scores themselves.
  - The manager scores each point 1–5 with notes and a summary, beside facts for the period: days worked, late, absent, on leave, and tasks done, not done and missed.
  - Sharing keeps the facts as they were, and then it can't be changed. The person sees the manager's scores only once shared, and acknowledges with a comment.
  - Nobody reviews themselves, and a manager's review is a shareholder's.
  - The points (Punctuality, Task completion, Work quality, Teamwork, Customer care) were written fresh and are edited in Settings → Reviews.
- **Home** shows reviews waiting, pinned announcements, unread announcements, and anything waiting for an acknowledgement. All of these "waiting for you" counts now come from one place (`people.waiting`).
- **Not yet:** recruitment (stages and applicants) and onboarding, and email notifications.

## Milestone 14: recruitment and onboarding (assumptions to confirm)
- **Applicants** (`recruitment.manage`, managers and shareholders, since names and phones are personal):
  - Each applicant has a name, phone, the job, where they heard of it, and notes.
  - Stages: New → Interview (with a time) → Offered (salary and start date) → Hired. They can also end as "Not taken" or "Withdrew", both with a reason.
  - Every move is kept with who made it, when, and a note.
- **Hiring** (also needs `staff.edit`):
  - Makes their staff record with the job, the offered salary and the start date.
  - Hours, days off, sign-in and PIN are added afterwards in Staff.
  - An offer or appointment letter is then written from Staff → Letters.
- **Onboarding:**
  - A checklist for each new person, with steps from Settings → Onboarding (seven written fresh).
  - Ticking a step records who and when. All steps ticked closes it.
  - It shows whether their sign-in is linked and their punch PIN is set.
- **Not yet:** uploading applicants' CVs (comes with staff papers in uploads part 2).

## Uploads: reading rules checked against the owner's documents (Nov 2026)
The owner sent 20 real documents: invoices, cash memos, a publisher's invoice, bKash slips, a courier slip, a money receipt, a Loyverse shift report, a bank statement, a membership card and lists. They were used only to check the reading rules. No copy, name, number or account is kept in the repository; the tests use made-up text in the same layouts.
- **What changed in reading:**
  - Sizes ("1L", "750ml") are not figures, and counts ("20p", "2000 pcs") are quantities.
  - A row number at the start of a line is dropped.
  - Lines with "%" (terms), "Label : value" lines, dated lines and letterhead lines (including BIN) are never items.
  - "Bill To" is no longer joined to the date line.
  - A publisher's row "printed price, commission %, copies, net amount" is read as such, and the row's own commission becomes that line's cost (35% vs 40% rows on one invoice).
  - Delivery charges are charges, not a negative discount.
  - When a row has only copies and one figure, the printed total decides whether that figure is a price or the row's amount.
  - A label alone on its line (সর্বমোট, Amount) takes the figure on the next line.
  - The TrxID is found under "ট্রানজেকশন আইডি" or "Transaction ID".
  - The bill number is found from "No. :", "SL No." and "Consignment No.".
  - A receipt's "TK 2000/-" is its total, and "বিকাশ", cheque or cash says how it was paid.
- **bKash slips:** the kind of transaction decides the entry, and the check screen says which it read:
  - cash out → a transfer from bKash to the cash drawer;
  - bKash to Bank → a transfer to the bank;
  - cash in → a transfer from the drawer to bKash;
  - received → income;
  - a merchant payment or send money → paid from bKash: a vendor or publisher payment if the slip names one, otherwise an expense.
- **Courier slips** are a new upload kind: an expense, paid on arrival ("To-Pay"), in a shipping or courier category if there is one, with the sender noted.
- **Loyverse shift reports** are a new upload kind:
  - The check screen shows the figures read.
  - "Open the daily shift" fills in the form: net sales, cash, bKash, card, counted cash, and the shift number as a note.
  - Saving the shift files the report on it.
  - Money paid out of the drawer is still entered as expenses, and each due is entered per person.
- **Still to come from these documents:** matching a bank or bKash statement (the bank statement), customer and membership cards, requisition lists (title and copies), and shopping lists.

## Owner decisions after comparing with v1 (27 Nov 2026)
The v1 package (requirements audit, build notes, guides) was compared with v2; where they differed, the owner decided:
1. **Month:** the month's first day is a setting, the 11th by default (11th–10th). Month closing, payroll, payslips, profit shares and month reports all follow it.
2. **Start date:** one guided "Getting started" setup for shareholders. It covers the start date, then each kind of opening figure in order, with a checklist:
   - account balances; shareholders' cash held and amounts owed; other dues;
   - vendor and publisher balances; staff advances; leave balances;
   - opening book stock (approved by someone else, like a delivery);
   - the first café count.
3. **Shop punch device:** kept, but off by default; a shareholder turns it on in Settings → Attendance.
4. **Punching away from the shop:** allowed with a reason, then checked by a manager (as built).
5. **New punch rules:**
   - breaks ("Take break" / "Back") are recorded and shown, and paid;
   - punches outside shop hours (11:00–23:00, a setting) wait for a manager's check.
6. **Task checks:** every finished task is checked by someone more senior. A shareholder's own tasks are final. The per-task tick is removed.
7. **Task rules:**
   - tasks can be given to a role;
   - a task falling on a day off, leave or holiday moves to the nearest **earlier** working day (both dates kept, giver and doer told, flagged if there is none);
   - forms inside tasks: a task can't be done until its record exists, unless a manager overrides with a reason;
   - scheduled report printing as a repeating task.
8. **Payroll:**
   - the unpaid-leave cut is chosen on each payslip, like absent days;
   - salary in parts (basic, allowances, food rate, overtime rule), each change effective from a date;
   - advances repaid in instalments, the instalment suggested as a deduction;
   - salary overdue 7 days after the payslip;
   - food allowance grouped by week (from Saturday) for paying.
9. **Shareholders:**
   - dated share history (46/44/10 as starting shares, always 100%);
   - an owner salary per shareholder;
   - profit worked out at month closing and split by share;
   - loans with a yearly interest rate per loan;
   - amounts owed set against their balance.
10. **Shift choices:** every choice is confirmed by a manager or shareholder; the "no manager needed" option is removed.
11. **Leave and passwords:**
    - leave in the first part month counts by days (the new default);
    - passwords are set and reset by shareholders, and a person changes their own only if a shareholder allows it.
12. **Short or over:** the daily shift shows Loyverse's expected cash beside the app's drawer figure and any gap between them; the short/over booked is from the app's figure.

## Owner decisions after comparing with the v1 code (27 Nov 2026)
The v1 server and screen code was compared with v2 for what v2 has built; where they differed, the owner decided:
1. **Short rest between shifts:** a warning only, never a block (as v1).
2. **Out from a break:** someone on a break can punch out; that ends the break.
3. **Salary overdue:** 7 days after the accounting month ends (as v1; the same date will apply to profit shares). This replaces "7 days after the payslip" in decision 8 above.
4. **Leave types:** Paid and Unpaid exist from the start; shareholders can add types (for example sick or casual) and choose for each: paid or unpaid, taken from the earned balance or not, half days allowed or not. Half-day leave is the first or second half of one day, counts 0.5 and halves the hours expected.
5. **Hours short and overtime:** each day's worked time is compared with the hours expected; hours short and overtime are shown separately, never set against each other, and never cut pay. Overtime is paid only for people a shareholder switches it on for, at a rate in their salary.
6. **Who may work a shift:** places per shift (a full shift refuses more); staff mark days or weekdays they can't work (then a choice needs a manager's OK); shifts can be limited to positions; each person can have their own list of shifts (others need a manager).
7. **Task extras:** checklists inside a task (tick, number, text or photo; some required); before/after photos or a note required; priority; more repeat patterns (every N days, fortnightly, last day of the month, specific dates, custom); teams and positions, with one shared task or a copy for each person.
8. **Linked tasks:** the form is filled in from inside the task and the task is tied to that exact record; payments, deliveries and bills also need the receipt or bill attached (as v1). This replaces "a task can't be done until its record exists" in decision 7 above.
9. **Letterhead:** as v1, on letters, payslips and reports: logo, the shop's name and description, address, phone and email; signature lines on reports; every report downloadable as PDF or Excel, and can be emailed.
10. **Self-service and staff numbers:** people can change their own phone, email and address (a setting, on by default); the change waits until a manager approves it (a shareholder, for a manager's own). Each staff member gets a number such as BIB0001, given automatically (prefix and digits in Settings).

### Details of decisions 1–3 above (27 Nov 2026)
- **Short rest:** shown to the person choosing the shift and to the manager deciding (and to a manager setting the rota, before saving). Rest counts from the actual punch out, else the shift's planned end. Both sides are checked: before the chosen shift and before the next one. Nothing extra is needed; the manager decides as usual.
- **Out from a break:** the break ends at the punch out and is paid time. It is flagged for a manager only when it is before the shift's end. A break never followed by anything is "No punch out", like any missed out; the open break isn't counted. On a break, "Back from break" is the main button and "Punch out" the smaller one.
- **Salary overdue:** counted from the day after the accounting month ends (11 Nov – 10 Dec is due by 17 Dec, overdue from 18 Dec), issued or not (a draft's net pay counts). Anything left unpaid is overdue, with the amount. Shown to payroll people on Home, to the person on My pay, and in the shareholders' daily warnings email once that is built. The 7 days stay a setting.

### Month closing profit (27 Nov 2026)
Built exactly as v1: net sales + other income + interest on loans shareholders took from the business; minus expenses, vendor costs and the cost of books sold or written off; minus staff salaries, food allowance, bonuses and cuts, owner salaries, and interest owed to shareholders who lent to the business; plus the month's drawer over/short. A loss is made up from later months' profit before anything is shared. Profit is split by the dated share history (46/44/10 to start).

### Publisher payment schedule (28 Nov 2026)
- **Pay every N months:** each publisher can have a schedule (empty: none), as v1. Vendors don't have one.
- **Counted from:** the last payment (any payment, even a part payment), else the first book received or the opening stock. When nothing was owed and something becomes owed again, the count starts from that day.
- **Overdue:** when something is owed after the due date (due by = counted from + N months). With nothing owed, it isn't overdue.
- **Who is told:** the payment tracker shows the due date and status; Home tells shareholders, whoever can pay publishers, and managers.

### Notifications (28 Nov 2026)
- **Shareholders' daily warnings email:** sent only on days with something to say, one hour after the shop closes (the hour is a setting). It lists money overdue (salaries, profit shares, publisher payments), what waits for a shareholder's approval, the day's shift missing or the day not closed, and the drawer short or over. Each shareholder adds their own address in My settings and can turn the email off there. Sent through the Google account the app runs on (free).
- **Messages on Home:** a message stays on the person's Home until they dismiss it, for: a task moved to an earlier day (giver and doer); their leave or shift request decided; their money entry or task sent back; their payslip issued and salary paid; their contact-detail change decided. No email or phone notifications for these.

### Profit by area (28 Nov 2026)
- In the monthly report, after the profit: books' and café's own profit, then what is shared, then the month's profit. Shared costs are not split between the areas.
- An area's own: its sales (the shift's books sales; the rest is café), expenses in categories of that area, vendor bills from vendors marked with that area (a new setting on each vendor; unmarked is shared), and for books the cost of books sold or written off. Shared: other income and interest, the drawer's over/short, salaries, food allowance, bonuses, owner salaries and interest owed.
