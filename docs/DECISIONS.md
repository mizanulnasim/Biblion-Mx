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
