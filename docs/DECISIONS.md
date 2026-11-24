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
