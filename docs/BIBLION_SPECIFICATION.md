# Biblion Management — specification

Biblion Management is the one app that runs Biblion, a bookstore café in Mirpur, Dhaka. It covers accounts, books, the café, customers, events, documents and people (HR).

This is the app's rulebook. It lists everything the app does and every rule it follows: features, business rules, permissions, data, settings, offline behaviour, screens, languages, security and hosting. It describes the app as it is meant to be, not how or when it was built. Where a figure is a setting, the starting value is given and the setting key is in brackets; every setting is in table S1. A rule changes only when the owners change it, and then this document changes with it.

---

## Contents

1. Standing rules
2. People, roles and permissions
3. Approvals
4. Records, corrections, audit and locks
5. Home, Dashboard, notifications and tasks
6. Money (accounts)
7. Daily shift, day closing and month closing
8. Shareholders
9. Vendors and publishers
10. Books
11. Café
12. Customers, membership and loyalty cards
13. Events and bookings
14. Upload a document
15. Document library
16. People (HR)
17. Reports and downloads
18. Offline use, caching and sync
19. Live updates
20. Screens and how they behave
21. Languages
22. Scheduled jobs
23. Backups, restore, reset and storage
24. Security
25. Data rules
26. Server contract
27. Hosting, configuration and deployment
28. Starting from a date (Getting started)
29. Not part of the app
30. Limits of the free setup
31. Open questions
32. Reference tables: S1 settings, S2 permissions, S3 starting lists

---

## 1. Standing rules

These rules come from the owners and apply to everything:

- **Free only.** Google Apps Script, Google Sheets, Google Drive, GitHub (code and GitHub Pages), and an optional free Gemini key. Nothing paid.
- **English and Bangla everywhere**, with a switch on the top bar.
- **Permissions are enforced on the server**, not only by hiding menus or buttons.
- **No dummy data** in the real database. The first setup creates only real setup data (section 28).
- **Customer data is for managers and shareholders only.**
- **Nothing is lost.** No function, requirement or piece of data is removed, changed or reinterpreted without the owners' approval.
- **Ask, don't assume.** Unclear business rules are asked about, one question at a time with an example, not guessed.
- **Tests are never reported as passed unless they were run.** Known issues and limits are never hidden.
- **Clean code.** Custom, self-contained code with no bloated libraries; no dead code, debug logging or unused message texts.
- **Desktop computers and phones** are the supported devices (layouts for about 1,280 px and 390 px wide).
- **Fast and light.** Few requests per screen, a small download, photos made smaller before upload, and storage planned to last about 20 years on 15 GB.
- **Optional extras never block.** Records such as vacancies, interview scores, reference checks, exit interviews, training and assets are filled in only when wanted. Only steps the owners mark as required (closing steps, leave attachments by type, onboarding documents marked "needed") block anything.

---

## 2. People, roles and permissions

### 2.1 Roles
Every user has one role. Each role has a level:

| Role | Level | What it is for |
|---|---|---|
| Staff | 1 | Their own attendance (punch, breaks), schedule and shift choice, swaps, tasks, leave, announcements, profile and documents; the café closing count; customer special orders. **No money.** |
| Manager | 2 | HR operations, the daily shift, vendor purchases, expenses and transfers (with limits), book requisitions, deliveries, sales and stock, café orders and counts, day closing. |
| Owner / shareholder | 3 | Everything: money, shareholders, settings, users and passwords, overrides, the activity log and sensitive records. |

- **Custom roles** can be made at level 1 or 2, with their own permissions (for example "Senior barista" = Staff plus café orders).
- **Shareholders are users with the Owner role, and are not staff.** An owner's sign-in is linked to their shareholder record. Owners have no staff record, no punch card and no staff pay.
- Managers and staff are linked to their staff record.

### 2.2 Permissions
- Each permission belongs to an **area** (HR, Tasks, Accounts, Books, Café, Closing, Administration) and a **kind** (view, create, edit, approve, manage). Users shows them grouped by area. The full list is in S2.
- On top of the role, each person can be **given** extra permissions or have some **taken away** (per-person grants and denies).
- The Owner role always has every permission and can never lose any. The last active owner can't be disabled.
- Users, roles, passwords and permissions are managed by owners only.
- **Setup is split into parts that can be granted separately:** business, HR policies, books, tasks, accounts setup, users, backup.

### 2.3 Money access for managers
- Managers can **pay expenses** (bills, supplies) and **move money** between accounts. Other income, loans, the bank, staff pay and owner pay need full money access.
- **Dues:** a manager's separate "Due taken" or "Due collected" is sent as a request for a shareholder. Dues recorded inside the manager's daily shift are allowed.
- **Which accounts** a person may use:
  - full money access or an owner: any account;
  - anyone else: the accounts set for them in Users, otherwise the account kinds in the setting (cash drawer and bKash to start) (`acc.limited_account_kinds`).
- An owner's own "Cash with …" account is never usable by anyone else.
- An owner can switch "pay expenses" or "move money" off for one manager, or limit their accounts (for example the cash drawer only).
- Only the accounts a person may use are offered on screen. The server refuses the others. Vendor purchases paid on the spot follow the same rule.

### 2.4 Passwords and sign-in
- Everyone has a password. Only owners set or reset passwords. A person may change their own only if an owner allows it for them (`auth.self_password`, off).
- After 5 failed sign-ins the account locks for 15 minutes (`auth.max_failed`, `auth.lock_minutes`).
- A sign-in lasts 30 days on each device (`auth.session_days`). It ends at sign-out, when the user is disabled, or when the person leaves.
- **Owners confirm a new device** with a code sent to their email. The code is asked only on a new device or after signing out; the device is then remembered for the sign-in's 30 days.
- **Active sign-ins:** each person sees where they are signed in (phone, computer, when last used) and can sign out other devices. Owners can sign anyone out.
- **The password is asked again** before risky actions: restore, reset or starting fresh; downloading a backup; making an owner, changing roles or permissions, resetting someone's password, disabling an owner; reopening a closed month; confirming a change of shares; changing the start date or opening figures; turning off backups.
- The first owner is created with a one-time setup code, which is deleted after use.

### 2.5 What each level sees
- Staff see only their own entries, and only for the last 7 days.
- Staff can't look up customers. They can still type a customer's name and mobile on a customer order, and see the book list (without costs) to take one.
- Staff can't search earlier events by the organiser's name or phone.
- Money figures (Dashboard, reports, balances, what is owed) appear only for people with the Accounts reports permission.
- Sensitive HR sections are separate permissions and are removed from server replies for anyone without them: salary, NID and passport, family contacts, sensitive performance and disciplinary records, payroll and management notes.

---

## 3. Approvals

### 3.1 The ladder (applies to every kind of entry)
- **Nobody approves their own entry.**
- **A shareholder's own entries are final.** They need no approval.
- **Staff entries** go to a manager or a shareholder.
- **A manager's entries** go to a shareholder, never to another manager.
- **A manager's own requests** always go to a shareholder: leave, attendance corrections, shift choices and swaps, day-off moves, expense claims and their own detail changes.
- An approver must be strictly more senior than the person who made the entry. A shareholder can approve anything except their own.
- Approve buttons, "Waiting for you" lists, counts and notifications all follow the same ladder. Each person sees only what they may approve.
- One rule decides every case. Given who is acting and what the entry is, it answers: is the entry final, does it need a shareholder, and why. Every save, every approval screen and the upload check screen use the same rule.

### 3.2 Approval settings per kind (Setup → Approvals)
Each kind is either **final when a manager confirms it** (the manager can flag it to a shareholder) or **a shareholder confirms it**.

| Kind | Starting value |
|---|---|
| Book deliveries and direct purchases (with extra, short and damaged copies) | Final for a manager (`approve.books_delivery`) |
| Book stock changes (damaged, lost, returns, count corrections, opening stock) | Final for a manager (`approve.books_stock`) |
| Book sales lines typed by a manager | Final for a manager (`approve.books_sales`) |
| Café orders, including supplies | Final for a manager (`approve.cafe_order`) |
| Money: expenses, other income, transfers, vendor entries, publisher entries, daily shift | Same as other money entries (`approve.rule.expense`, `.income`, `.transfer`, `.vendor`, `.publisher`, `.daily`) |
| Other money entries (dues, loans, salaries and owner pay) | A shareholder confirms (`approve.rule.other`) |

The amount limit and the categories below apply on top of these switches.

### 3.3 Money approvals
- **Amount limit per entry: Tk 2,000** (`approve.money_limit`). It applies to each entry, not to daily or monthly totals.
  - A manager's money entry above the limit waits for a shareholder.
  - At or below the limit it is final if the kind's switch allows, and the manager can flag it.
- **Categories that always need a shareholder** are ticked in Accounts setup → Expense categories.
- **Daily shift:** final for a manager only if the cash drawer balances exactly against the app's own figure. Any short or over, however small, waits for a shareholder.
- **Staff money entries** (expense claims) wait for a manager or a shareholder. Over the limit, or in a ticked category, they need a shareholder.
- **Saved past a duplicate warning:** waits for a shareholder, with the reason that was given.
- **Requests:** a kind of money entry outside a person's permissions can be sent as a request.
  - It is saved and counted now, marked "waiting", and only a shareholder approves it.
  - Staff pay and owner pay can't be requested.
  - The person who sent a request may correct or cancel it while it is still waiting.
- **Waiting list:** Home shows each waiting entry under "Waiting for you", with why it waits and any reason given. Shareholders are notified at once.
- Entries waiting longer than 1 day are reminded to shareholders (`approve.waiting_days`).
- Before Confirm on an upload, the check screen shows which approval rule each new entry will fall under.

### 3.4 Flags and oversight
- An entry that is final for a manager can be **flagged for a shareholder** with a reason. It appears in the shareholders' "Waiting for you" and notifications. When a shareholder marks it looked at, the manager is told. Nothing about the entry changes.
- Every evening, shareholders get what managers made final that day, as part of the daily warnings email and notifications. The Dashboard shows today's and yesterday's.
- **Payroll adjustments, salary changes by a manager, approving a staff member's leaving, and confirming the settlement** keep their own approval steps.

### 3.5 Once decided
- When one approver decides an entry (approve, send back or reject), it leaves every other approver's list, and their notifications are closed ("Done: approved by X").
- A second decision is refused, saying who decided it and when ("Already approved by Karim at 14:05").

---

## 4. Records, corrections, audit and locks

### 4.1 Nothing is erased
- **Money and stock records are append-only.**
  - A correction makes a new record that replaces the earlier one, and cancels the earlier one with a reason.
  - A cancellation needs a reason.
  - Cancelled records stay in the data for the record, but never count in any figure.
  - Someone whose entry is cancelled by another person is told why.
- Approved records are cancelled with a reason, never erased.
- HR records are never deleted: they are archived, replaced by a new version (documents, job descriptions), or voided by a correction (attendance).
- **Setup items** (accounts, categories, contacts, suppliers, items and other lists) are made inactive when no longer used, so old entries still show their names. A shareholder can delete a setup item that has no records attached; the deletion is logged.
- A correction keeps its documents.

### 4.2 Conflicts
- Every editable record has a version number. Editing something that someone else changed since it was opened is refused: "changed by someone else, reload".
- Money and stock records can't be edited, only corrected. Correcting a record that was already corrected or cancelled is refused, saying who changed it and when. It never creates a second replacement.

### 4.3 Activity log
- Every change is logged: who, when, the action, the table, the record, the fields before and after, the reason, and the request id.
- Sign-ins, failed sign-ins, overrides and every opening of a sensitive record or file (NID, payslips, sensitive documents, customer files) are logged too.
- Password hashes and secrets are masked in the log.
- Entries older than 2 years (`audit.archive_years`) are moved once a month into a compressed file in Drive. The file is read back and checked before the rows are removed. Archived activity can still be opened and searched (Activity log → Archived).

### 4.4 The accounting month and the month lock
- The accounting month runs **from the 11th to the 10th** (`accounting.month_start_day` = 11; any day 1–28; 1 is the calendar month).
- **A month is named by the month it starts in.** For example, 11 Nov – 10 Dec is "November 2026".
- **One month lock across the whole app**: money, books, café (counts, orders, batches), HR (attendance corrections, leave, payroll, rota) and tasks.
- A month is closed only through Month closing (section 7.3). Nothing can be entered, corrected or cancelled in a closed month.
- Only an owner can reopen a month, only the latest closed month, only with a reason, and after entering their password again.
- A **closed day** (section 7.2) is locked for managers and staff; a shareholder can still change it and can reopen it with a reason.

---

## 5. Home, Dashboard, notifications and tasks

### 5.1 Home
Home is the first page after sign-in. It is personal and depends on the person's role. It shows:
- **The punch card** (punch in, take a break, back from break, punch out), with status, times and GPS rules. For managers and staff, not owners. It works offline. Each person can hide it (`attendance.home_controls`).
- **Quick add:** a "+" with the four or five entries this person makes most (for example Expense, Due collected, Café count), learnt from use.
- **My tasks** and upcoming deadlines.
- **Waiting for you**: only what this person may approve, with why each entry waits.
- **Alerts**:
  - overdue payments (salaries, profit shares, publishers and vendors by their schedules), with the amount and since when;
  - suppliers over their credit limit;
  - documents that are expiring;
  - probation dates to confirm;
  - event bookings (shown to everyone);
  - the day's shift not entered yet, and the day not closed yet (for those who do them);
  - Getting started steps left (for shareholders, until done).
- **Summaries**, by permission.
- **Notifications** and **quick buttons**, including Upload a document.
- **A "Getting started" card** by role: the few places this person uses most, in the order of a normal day. It can be hidden and brought back per device.

Each person can hide Home sections they don't need, and choose their colour and reminders, in My settings.

### 5.2 Dashboard (owners and managers)
- **What needs doing now**, most urgent first, each with who it waits on:
  - approvals and flags;
  - missing daily shifts and days not closed;
  - cash shortfalls;
  - overdue payments and tasks;
  - café items to order or expiring;
  - low book stock;
  - incomplete punches.
- **Sales:** sales so far against the same day last month, today's takings against the same weekday last week, and the projected month.
- **Takings:** daily takings split into books and café, and the usual takings by weekday.
- **Money:** where the money went, money on hand, what is owed, and **cash ahead**: money on hand against what falls due in the next 14 days (salaries, profit shares, suppliers by schedule), with a warning if short.
- **People and work:** staff today and tomorrow; tasks; café stock; best-selling books.
- **The nightly check card**, with "Check now".
- **What managers made final** today and yesterday.
- Every chart has "Show as a table". Every figure opens the report or list behind it.
- The figures are the same as the reports, worked out by the same calculations. Money figures need the Accounts reports permission.

### 5.3 Today's team
Shows who is working, late, on a break, on leave or absent, today's checklists, and the tasks waiting to be checked.

### 5.4 Notifications
- **One notification system** for the whole app. Each notification has a priority, a part of the app, read or unread, and a key that stops duplicates. A bell on the top bar shows the unread count.
- Tapping a notification opens the exact record.
- **What people are told about**, among others:
  - an entry waiting for them, or a flag;
  - their entry cancelled by someone else (with the reason), or sent back;
  - their task moved to an earlier day (the doer and the giver), sent back, or due soon or overdue;
  - an owner's own task done (the owner who gave it);
  - their leave or rota request decided; their contact-detail change decided;
  - their payslip issued, and their salary paid;
  - a delivery's payment they may make (when the person receiving couldn't);
  - a special order arrived (the person who took it).
- **History**: 12 months, newest first, grouped by day. Search by any word, filter by part of the app (Accounts, Books, Café, HR, Tasks), show only unread. "Load more" brings older ones. "Mark all read" clears the bell. Each can also be dismissed.
- **Personal preferences** (My settings): mute kinds of notification (`notify.muted`; approvals and urgent alerts always arrive); how many hours before a task's due time to remind (`tasks.remind_hours`, 24); email on or off and the address (`notify.email_enabled`, `notify.email`).
- **The owner alert address** receives urgent system alerts: a failed backup or restore test, an override (`notify.owner_email`).
- **The shareholders' daily warnings email** goes to each shareholder with email on, the set minutes after the shop closes (60, `notify.after_close_min`), only on days with something to say, in their own language. It lists: money overdue (salaries, profit shares, supplier payments); what waits for their approval; the day's shift missing or the day not closed; the drawer short or over; and what managers made final that day.
- **The weekly owner digest**, Saturday morning: last week's sales, profit so far, cash, what is owed, top books and café waste, by email and in notifications.
- Notifications are in the app and by email only. There are no phone push notifications.

### 5.5 Tasks
**One task system** across the whole app.

**Giving tasks**
- A task can go to a person, a role, a position or a team, owners included. For a role, position or team it is either one shared task anyone of them may do (it becomes theirs when done) or a copy for each person.
- Any owner or manager can give a task to anyone, including owners and themselves. Staff can't give tasks. Only an owner gives a task to an owner.
- A task can happen once or repeat:
  - daily; every N days; weekdays (the shop's working days); weekly on chosen days; every N weeks; fortnightly;
  - monthly on a day (days 29–31 move to the month's last day), every N months, the last day of the month;
  - specific dates.
- A repeating task has start and end dates, and can be paused or ended. Changing its person moves its open coming tasks.
- Each task has a category, a priority (low, normal, high, urgent), a due date and time, a status, details, a checklist, comments and links to records. Duplicates are prevented.
- **Categories** (a list in Setup; S3): checklists such as Opening, Closing and Food safety, and tasks such as General, Events and Accounts.
- **Checklists inside a task:** each item is a tick, a number (with limits), words or a photo; some are required.
- **Evidence:** a task can require a photo before, a photo after, or a note.
- Tasks are made 1 day ahead (`tasks.days_ahead`), only on days the person is meant to work.

**Who sees what**
- Owners see everyone's tasks.
- Managers see their own tasks, the tasks they gave, and tasks held by other managers or staff.
- Staff see only their own.
- This is enforced in lists, task pages, comments, reassigning, the Dashboard, Day closing and the tasks report.

**Reassigning:** owners and managers reassign from the task itself, choosing the person and optionally why.

**Reminders:** a reminder before the due time (each person's hours), and an alert to the doer and the giver when it becomes overdue.

**Doing and checking**
- The person presses **Done** (after the checklist and evidence the task asks for), or "Can't do it" with a reason, and can comment. Done and comments work offline.
- Every completed task waits to be checked, one at a time, by someone more senior than the person who did it, never by themselves. The checker must have the "check tasks" permission, have given the task, or supervise it. The giver (or supervisor) is asked first; Home shows it to everyone who may check it.
- The checker approves it or sends it back with a note (the doer is told). Once checked, it leaves everyone else's list.
- An owner's own tasks need no checking: complete when marked done, and the owner who gave the task is told.
- Daily checklists are tasks too, so each completed checklist is checked.

**Forms inside tasks**
- A task can carry a form: an expense, a vendor or publisher payment, a vendor purchase or delivery, a utility bill, the daily shift, the café count, a café order, a requisition, a stock count, Day closing, Month closing, or printing a report.
- The form opens from inside the task and saves into the main records, so nothing is typed twice. The task is tied to that exact record and shows ✓.
- The task can't be marked done until its record exists, and, for payments, deliveries and bills, its receipt or bill is attached (it is filed on the money entry too).
- A manager can let it be done without the form by giving a reason, which is logged.
- A printing task opens the report; it is done once the report is printed or saved as PDF from it.

**Dates and holidays**
- A task for one person that falls on their day off, leave or a closed public holiday moves to the nearest earlier working day. Both dates are kept, and both the person and the giver are told.
- If there is no earlier working day, the task is flagged for management.
- This is checked when leave is approved and again every hour, so rota changes and holidays added later are caught.
- A repeating task is skipped on days off, leave and closed holidays.
- When a person leaves, their tasks are handed over one by one (section 16.12).

**Routine tasks made at the first setup** are in S3.

---
## 6. Money (accounts)

### 6.1 Money accounts
- The account kinds are the cash drawer, bKash, bank, and "Cash with …" (the shop's money a shareholder holds, naming that shareholder). There is **exactly one cash drawer**.
- The first setup creates the Cash drawer, bKash and Bank, plus one "Cash with …" account for each shareholder (S3).
- Each account has an opening balance as at the evening before the start date (section 28).
- **Balance** = the opening balance plus the effect of every entry. The daily shift books any short or over to the drawer, so after each shift the drawer holds exactly what was counted.
- The balance of a "Cash with …" account counts as owed to the business by that shareholder.

### 6.2 Money in & out: one screen
"What is this?" picks the kind, and the form changes to fit:

| Group | Kinds |
|---|---|
| Money | Expense, Other income, Due taken, Due collected, Loan to shareholder, Loan from shareholder, Loan repayment, Transfer |
| Vendors | Purchase on credit, Purchase paid on the spot, Payment to vendor, Credit note / goods returned |
| Publishers | Payment to publisher, Bought with cash, Refund from publisher, Advance written off |
| Staff pay | Salary paid (for a month), Food allowance paid, Bonus paid, Salary adjustment (+ bonus / − cut), Advance given (with an optional instalment), Salary deduction |
| Shareholders | Owner salary paid, Profit share paid, Owner withdrawal, Advance given, Salary deduction |

- All kinds are kept in one money ledger; each kind's effect on accounts, dues, loans, pay accounts and what suppliers are owed is defined once (6.3) and used by every calculation and report.
- **Publisher and vendor payments are never Expenses.** Book cost is counted as copies sell (or arrive, by the publisher's setting); a vendor's cost is counted when the goods arrive. A payment only pays off what is owed. Entered as an Expense, the cost would count twice.
- The Pay staff, Vendor bills, Publishers and Shareholders pages are **views**: balances, statements and lists. Their buttons, and tapping an amount owed, open the one money screen with the kind chosen and the figures filled in.
- Everyone with money access sees every kind except staff pay and owner pay. A kind outside a person's permissions says "sent for approval" and is saved as a request (section 3.3).
- **Smart defaults:** the form remembers each person's usual choices (for example Rafi's milk bill opens with "Milk" and "Cash drawer"), and "Repeat last entry" copies the last one.
- **Bulk entry:** several expenses can be entered in one table and saved together, each checked as usual.
- **A bill photo first:** "Take photo" on the form reads the bill and fills the amount, date and vendor for the person to check.
- A bill photo or memo can be attached with Take photo or Choose file.
- **Unusual amounts** are warned: an amount far from the usual for that category, vendor or kind (for example milk Tk 9,000 when it is usually Tk 900), or a date far in the past or future.
- Field errors are shown beside each field. When saving fails, the message stays and the form stays filled.

### 6.3 Effect of each kind
| Kind | Effect |
|---|---|
| Expense, Salary paid, Food allowance paid, Bonus paid, Advance given, Owner withdrawal, Loan to shareholder, Owner salary paid, Profit share paid, Purchase paid on the spot, Payment to vendor, Payment to publisher, Bought with cash | Money out |
| Other income, Due collected, Loan from shareholder, Refund from publisher | Money in |
| Transfer | Out of one account, into the other |
| Loan repayment | In, if a shareholder repays the shop; out, if the shop repays a shareholder |
| Due taken, Salary deduction, Salary adjustment, Purchase on credit, Credit note, Advance written off | No cash movement (they change what someone owes) |
| Daily shift | Cash sales into the drawer, less cash handed over, plus any short/over; bKash and card sales into their accounts; cash handed over into the account it went to |

### 6.4 Expenses
- **Categories** are made at the first setup (S3) and edited in Accounts setup. A category can also be typed as a new one in the expense form by someone with the Accounts setup permission (others ask).
- A name close to an existing one ("Utility" while "Utilities" exists, plurals included) offers "Use it", and the server treats them as the same unless confirmed.
- **Category settings.** Each category belongs to an area (books, café or shared), used for profit by area. It can be ticked "always needs a shareholder".
- **Utility bills.** Tick "This is a utility bill" on an expense to record the utility, the bill period, the units used (kWh, m³), the bill amount, late fee, due date and meter reading. They are also read from uploaded utility bills. The Utility bills report shows units, cost, cost per unit and % change, month by month.
- **Recurring expenses** (Accounts setup): name, category, account, amount and day of the month. On the day, a reminder task opens the expense filled in; a person saves it.
- **Expense claims.** A staff member who paid for something themselves claims it with the receipt; a manager or shareholder approves it (by the ladder); an expense pays it back and marks the claim paid.

### 6.5 Dues
- **Due taken:** someone took goods or money on credit. It can be a staff member, an owner, or another person from the dues list (with their opening due).
- **Due collected:** they paid it back.
- **Recovery:**
  - a staff member's dues and advances can be deducted from salary, fully or partly;
  - an owner's dues are set against what the business owes him.
- **Dues in the daily shift** are recorded by person and linked to that shift.

### 6.6 Loans with shareholders
- Each loan has a number (L001 …), a shareholder, a direction (lent to the business, or taken from it), a yearly interest rate, an opening date and a status. Loan entries name the loan.
- **Interest** is worked out day by day: each day's balance × the yearly rate ÷ 365.
  - Loan **taken** by a shareholder: interest is charged to him and counts as business income.
  - Loan **given** by a shareholder: interest is owed to him, counts as a business cost, is due like his salary (6.10) and paid like his other dues.
- Loan lines without a loan are listed for fixing (Shareholders page and the data check).
- **Open loans at the start date** are entered as loans on that date, and the account's opening balance is adjusted by the same amount, so the cash is not counted twice.

### 6.7 Staff pay
- **Salaries come from payroll** (section 16.6). There is one calculation, and each payment is recorded once, on the money screen.
- **Part months** (joining, leaving, a change mid-month) are paid by days.
- **Advances.** One advance balance per person, repaid in instalments where set; when paying a salary, the instalment due is suggested as a deduction and can be changed. A deduction can't be more than the advance still owed.
- **Unpaid leave and absence.** The cut is chosen per person on each payslip.
- **Unpaid salary** stays owed until paid. It is overdue 7 days after its month ends (`payroll.overdue_days`), issued or not.
- **Settling payments.** A payment that names its month settles that month first. The rest settles the oldest open item.
- **Opening amounts.** What the shop owed each person, and their advance, as at the start (Payroll → openings). An opening advance is recovered like any advance.
- **Bonus paid** is handed over at once and isn't on the payslip. **Salary adjustment** (+ or −) is added to what is owed and paid with the salary.

### 6.8 Food allowance
- **Rates** are dated: a rate a day from each date (Tk 100 to start). A person's own rate, set on their salary from a date, overrides the standard rate. A new rate never changes earlier days.
- **Rule** (`food.unpaid_rule`): every calendar day employed (starting value); not on unpaid-leave days; not on unpaid-leave days or days absent without leave; or only the days the person punched in.
- **Weeks** start on Saturday (`food.week_starts`); the allowance is shown and paid by week.
- **Settling payments.** Payments settle the oldest week first, or the week a payment names. Money paid ahead covers the next days, and the app shows "paid up to" a date.

### 6.9 Pay screens
- **Pay staff** shows one line per person: this month's salary and food allowance, what was paid this month, and what is owed or paid ahead overall, with the status of each item (6.10). Tapping an amount owed opens the money screen filled in.
- **Shareholders** shows the same for owner salary, profit share and interest.
- **Vendor bills** shows each vendor's bills and what is owed, with the same tap-to-pay.

### 6.10 What is owed, and when it is overdue
- **Kinds owed to staff and owners:** staff salary and food allowance; owner salary, loan interest owed to a shareholder, profit share; an opening balance; a share buyout.
- Each item is due a set number of days after its month ends (7, `payroll.overdue_days`); profit shares and interest are due once their month is closed and those days have passed.
- **Status of each item:** Paid, Pending, Partially paid, or Overdue (with days late and the amount left).
- **Month reconciliation** (the payables report): owed at start + new amounts owed − payments − other = owed at end, for every person and supplier, each side worked out on its own so a line that doesn't add up is named.

### 6.11 Profit
Monthly profit is worked out as:

> net sales + other income + loan interest charged to shareholders
> − (expenses + vendor costs + book cost)
> − staff salaries (payslips) − food allowance − bonuses and salary adjustments
> − owner salaries − loan interest owed to shareholders
> + the daily shifts' short/over

- **Staff salaries** leave out owners (they have no staff pay).
- **Book cost** = the cost of copies sold, damaged or lost (not those returned to publishers), at each title's cost (10.1), plus publisher advances written off.
- **Vendor cost** is counted when the goods arrive: purchases on credit and paid on the spot, less credit notes.
- **A loss is carried forward.** Later profits make it up before anything is shared out.
- **Profit by area** (in the monthly report): books' and café's own sales, own costs and profit, then shared income and costs, adding up to the month's profit. Shared costs are not split.
  - An area's own: its sales (the shift's books sales; the rest is café); expenses in categories of that area; vendor bills from vendors marked with that area; for books, the book cost.
  - Shared: other income, interest and the drawer's short/over; shared expenses and unmarked vendors; salaries, food allowance, bonuses, owner salaries and interest owed.
  - **Break-even:** the sales each area needs to cover its own costs and a share of the shared costs (shared by sales, for break-even only).

### 6.12 Transfers between Biblion's own accounts
- A transfer moves money between two of Biblion's accounts. It is not income or an expense.
- A bKash cash out, cash in, and a bKash-to-bank move are transfers.
- bKash's charge can be recorded as its own expense.

### 6.13 Duplicate and wrong-total guards
These run on the server before saving. The same duplicate service is used for typed entries, uploads, Loyverse imports, statement matching, offline entries when they are sent, and the nightly check. Each guard warns or blocks:

| Guard | When it fires | What happens |
|---|---|---|
| A | Same kind, same party or category, same amount, within 7 days | Warn; saving needs a reason |
| B | An expense that matches a vendor bill within 7 days, or names a vendor | Warn, with "Make it a vendor entry" |
| C | An expense that names a publisher | Warn, with "Make it a publisher payment" |
| D | The same vendor bill number for the same vendor (case, spaces and punctuation ignored: "MV-7", "mv 7", "MV/7") | **Blocked**, with a link to the earlier entry |
| D2 | The same bKash TrxID | **Blocked**, offering to attach to the earlier entry |
| E | A Loyverse upload for a title and day that already has typed sales | The upload replaces them; after the person confirms, the typed sales are cancelled with the reason |
| E2 | Typing sales for a day already uploaded from Loyverse | Needs a reason; the lines are flagged to the shareholders |
| F | A due already in a daily shift, and a separate "Due taken" for the same due (either order) | Warn, with a reason |
| G | An amount equal to an open expense claim | Offer to link it to the claim; a claim already paid: warn |
| H | A paper for the same party and amount was uploaded but not entered | Offer to open the upload |
| I | An expense and an income of the same amount on the same day in two of Biblion's accounts, or an expense that mentions bKash, bank, cash out or deposit | Warn, with "Make it a transfer", which cancels the paired entry |

- **The prompt** shows each warning, the earlier entries (each a link), a button for each fix, and a required reason.
- **Switching kind** carries the figures over to the new kind.
- **Saved past a warning:** waits for a shareholder, with the reason shown.
- **No way round it.** Nothing sent from a browser can skip a check.

### 6.14 Matching a bank, bKash or Nagad statement
1. Choose the account, then the statement: several photos, a PDF, or the CSV or Excel download.
2. The lines are read: CSV and Excel by their columns; photos and PDFs by Google's text reading. The sign comes from the change in balance, otherwise from the words. Gemini is used only when the reading gives fewer than 2 lines or more than a third are unsure, and only with a key and the reading setting allowing it. Reading saves nothing.
3. The person checks and edits every line (money out has a minus), and can add or remove lines.
4. **Match with the app** shows three lists: matched, on the statement but not in the app, in the app but not on the statement.
5. The person ticks the missing lines and chooses what each is (expense, income, or a move from or to another account). "Add the ticked lines" saves them under the normal approval rules and month lock.

An uploaded account statement opens here automatically.

### 6.15 Nightly check
- Runs once a night, between 01:00 and 06:00. It looks for: possible duplicates over the last 60 days; balances below zero; typed sales on days already uploaded from Loyverse; the data check; entries waiting more than a day.
- Shareholders are notified only when something is found.
- The Dashboard card shows the last result, with "Check now".

### 6.16 Data check
Accounts → Data check finds broken links (for example a payment naming a missing loan), mismatched figures (for example stock that doesn't add up from its movements) and missing pieces (for example a delivery without its stock lines). It is also a step of Month closing.

---

## 7. Daily shift, day closing and month closing

### 7.1 Daily shift
- **One per date.** A second one for the same date is refused.
- **What is recorded:**
  - net sales;
  - books sales: filled from that day's book sale entries (Loyverse upload or typed), or typed if they aren't entered yet; café sales = net sales − books sales;
  - the cash, bKash, card and due split, which must add up to net sales (the screen shows the difference);
  - dues by person;
  - cash counted, **by notes and coins** (how many 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1), added up by the app;
  - cash handed over, and to which account (a shareholder's "Cash with …" or another);
  - the accounts bKash and card sales went to.
- **The drawer's expected cash** = the drawer's balance before the shift + cash sales + other cash in − cash paid out, from the entries of the day.
- **Short / over** is measured against the app's own expected cash. Loyverse's expected cash, and the gap between the two, are shown beside it. Short/over counts in profit.
- **Filling from Loyverse:** from the printed shift slip (photo or PDF) or from Loyverse's CSV reports (shifts, sales summary, sales by payment type, sales by category). The app fills net sales, cash, bKash, card, due, expected cash and cash counted, checks the slip's own sums (payment types add up to net sales; the drawer figures add up), and says if a figure looks misread. The person adds who took on due and the cash handed over. The slip is kept with that day's entry.
- **Approval:** final for a manager only when the drawer balances (section 3.3).
- **Offline:** the daily shift can be saved offline. When it is sent, a shift already entered for that date is caught and shown to the person.

### 7.2 Day closing
- **The end of the day in one screen:** a guided screen for the manager at night: the daily shift, the cash count by notes, the bKash and bank balances, then the closing checklist and "Close the day".
- **Balances:** at closing the person types the balance the bKash app and the bank show; any difference from the app's figure is flagged.
- **Steps.** Which steps must be done is a setting (`closing.day_steps`): daily shift, cash count, café count, deliveries, tasks. Other steps are shown as warnings: entries from the day still waiting, items unsent on this phone.
- Each step shows its live status, with "Open" to fix it.
- A manager may close without a required step by giving a reason, which is kept on the closing and logged.
- A closed day is locked for managers and staff. A shareholder can reopen it with a reason.
- Day closing can be a daily task with the form inside.

### 7.3 Month closing
- Runs once the month has ended, for that month. The steps (`closing.month_steps`) are:
  - every day closed;
  - salaries paid or noted;
  - vendor balances reviewed, publisher balances reviewed;
  - café stock valued;
  - utility bills entered;
  - the month-end reports;
  - the data check clean.
- Shares must add up to 100% for the month, and months close in order.
- Only owners may close a month, and may go ahead without a step by giving a reason, which is kept.
- **Closing** keeps the month's figures as they were, locks the month everywhere (section 4.4), and saves the month-end reports as PDF and Excel in Drive (Monthly reports, by year): the monthly accounts, shareholders, salary and payroll reports. They are listed on the closing and emailed to shareholders who have an email address set. The files are made before the month closes, so a failure closes nothing.
- Profit shares are **provisional** until the month is closed, and final after.
- Reopening: only the latest closed month, by an owner, with a reason and their password.
- Month closing can be a task with the form inside.

---

## 8. Shareholders

### 8.1 Setup and pay
- **Shareholders** (made at the first setup, editable):
  - Mizanul Islam Nasim (Nasim) 46%;
  - Mushfiqul Karim (Mushfiq) 44%;
  - Shourov Kabir (Shourov) 10%;
  - each with an owner salary of Tk 10,000 a month.
- **Per shareholder:** full name and short name, phone, status, share (by date, 8.2), monthly owner salary and its "salary from" date, and opening figures: what the business owed him and what he owed it, as at the start. The shop's cash he held at the start is the opening balance of his "Cash with …" account.
- **Owner salary** counts from its "salary from" date; a part month (starting or leaving) is paid by days. It is owed for each closed month.
- **Profit share** = his share × the profit that can be shared out (after losses are made up).
- **What the business owes him** (oldest first): opening balance, owner salary, interest on his loans to the business, profit share, any buyout; less owner salary paid, profit share paid and withdrawals.
- **What he owes the business:** his opening amount, the shop's cash he holds ("Cash with …"), his dues and advances, loans taken from the business and their interest.
- **Net to settle** = owed to him − owed by him.
- Profit shares overdue (6.10) show against each shareholder and on Home.
- **Payments:** owner salary paid, profit share paid, owner withdrawal, advance and salary deduction are set against what is owed.

### 8.2 Dated shares
- Share history is dated. Earlier months keep the split they had.
- **Shares must add up to 100% on every date.** A change can't reach back into a closed month.
- In a month when the split changed, the month is shared by days at each split (for example 10 days at one split and 20 days at another).

### 8.3 Change of shares: joining, leaving, transfer (Shareholders → Change of shares)
- **Proposing.** One shareholder proposes: who leaves or joins, the date, the new split, who buys the share and how. The new split can go to the others in proportion, to one person, or to a new shareholder.
- **Confirming.** A **different** shareholder confirms (with their password), and never the one leaving. A proposal can be cancelled with a reason.
- **Exit month.** Salary and profit share are worked out by days up to the exit date. The exit-month profit is shown at once and becomes final at month close.
- **The leaver's settlement** nets into one figure: profit share and owner salary to the last day; loans either way; what he has already drawn.
- **Buyout.** Paid by the business at once or in parts (recorded as an obligation, tracked like other owed items and paid through owner withdrawal), or paid privately by the others (recorded).
- **Completion.** The exit completes only when his "Cash with …" account is at 0 and closed. His sign-in is then disabled.
- **Documents:** the shareholder settlement statement and the share transfer record, as PDF.

---

## 9. Vendors and publishers

### 9.1 Vendors (café and other suppliers)
- **Vendor details:** name, contact person, phone, email, address, what they supply; expense category; area (books, café or shared, for profit by area); "pay within (days)" or a payment schedule (9.3); credit limit, usual discount, terms note; opening amount owed, and since when; status.
- **A delivery service** (for example Pathao) is set up as a vendor marked "Delivery service".
- **Vendor kinds:**
  - **Purchase on credit:** adds to what we owe, and counts as cost when the goods arrive.
  - **Purchase paid on the spot:** counts as cost; the cash leaves the account at once.
  - **Payment to vendor:** reduces what we owe.
  - **Credit note / goods returned:** reduces what we owe, and the cost.
- **Item lines on a purchase:** the café item (or any other item), quantity, unit, rate, and expiry date for café items, plus the delivery charge. The amount is the total. Café items on a purchase create stock batches. A rate far from the item's last rates is warned (price memory).
- **Who takes the delivery charge:** the vendor (on its bill); a delivery service (its own linked bill, paid now from an account or owed to it; cancelling or correcting the purchase does the same to the linked bill); or no delivery charge. The form fills in each vendor's usual arrangement from its last purchase.
- **Which bill a payment pays.** Payments and credit notes are set against the bill they name, otherwise against the oldest bill first. Bills show paid, part paid or open.
- **Linked to café orders.** A purchase can be opened from an approved café order, with the items filled in.
- **Vendor documents and agreements** can have expiry dates, with reminders before them (30 days, `docs.expiry_warn_days`).
- **Vendor purchases report** (a month or any period): purchases, quantities and average rate; first and last rates and % change; delivery charges and the full cost per vendor; a delivery services table.
- **Vendor statements and the vendor tracker** show bills, payments, balance, and when payment is due or overdue.

### 9.2 Publishers
- **Publisher details:** contact person, phone, email (for sending requisitions), address; usual discount (commission) %; shop discount to customers %; payment schedule (9.3); terms note, credit limit; opening amount owed, and since when; status.
- **When we owe a publisher** is set per publisher:
  - **when copies sell** (the starting value): the cost of each copy sold;
  - **when copies arrive:** the cost of each delivery received, less returns.

  Whether stock is bought outright or returnable follows this setting, not a choice per purchase. Opening stock adds nothing to what is owed; that is the opening due.
- **Publisher kinds:**
  - **Payment to publisher** reduces what we owe.
  - **Bought with cash** (books bought and paid on the spot, for example at a stall) records the copies and the payment together; nothing is owed.
  - **Refund from publisher** increases what we owe back.
  - **Advance written off** increases it back, and counts as book cost.
- **Payment to a publisher:** shows what is owed now and what is settled so far, and suggests "Covers sales up to": the latest sales date this amount fully settles. The person can change it.
- **Late sales.** A newly entered sale is "late" if its date is already settled by a payment or already covered by a sent requisition. Such sales are flagged, so the same sales are never paid for or ordered twice.
- **Terms** can be read from an uploaded terms letter or challan: payment schedule, credit limit, usual discount, returns. Saving terms needs the Accounts setup permission.
- **Reports:** publisher statements and the publisher tracker show schedules, what is due, and overdue flags.

### 9.3 Payment schedules (vendors and publishers)
- A supplier can be paid:
  - **every N months** (for example every 2 months);
  - **in fixed months, within a day range** (for example Dyu: March, June, September and December, between the 5th and the 10th);
  - **every N days**, or within N days of a bill (vendors);
  - or have no schedule.
- **Counted from** the last payment (any payment, even a part payment), else the first book received or opening stock (publishers) or the first bill (vendors). When nothing was owed and something becomes owed again, the count starts from that day.
- **Due by** follows from the schedule. **Overdue** = something still owed after the due date; with nothing owed it isn't overdue.
- The trackers show the schedule, counted-from and due-by dates and the status (Overdue, Not yet due, Nothing owed, No schedule). Home tells shareholders, whoever can pay that supplier, and managers which supplier is overdue, since when and how much is owed.
- **Credit limit:** Home warns when the amount owed passes a supplier's credit limit.

---
## 10. Books

### 10.1 Book list and stock
- **Each title has:** title, other names, author, ISBN, publisher, printed price; its own selling price (optional); its own low-stock level (optional); its Loyverse name, SKU and price; notes; "from the web" marks; status.
- **Stock** is counted per title **and** printed price, from the stock movements (the ledger). Balances can be rebuilt from the movements at any time.
- **Stock movements** (each with a reason, the person, the date and approval):
  - in: delivery received, opening stock, count correction (more), customer return;
  - out: sold, damaged, lost, returned to publisher, count correction (fewer).

  Recorded by hand as stock changes: damaged, lost, returned to publisher, count corrections. A movement can be cancelled with a reason.
- **Only approved deliveries add stock** (section 3.2). New titles are created from deliveries.
- **A sale with no stock** is allowed and flagged. It may be a book on the shelf that wasn't entered, so the app offers "add as opening stock".
- **Low stock** at 1 copy or fewer (`books.low_stock`), with a per-title override. **Slow sellers** are those unsold for 90 days (`books.slow_days`).
- **A copy's cost** is the average cost of the copies received (deliveries and opening stock, damaged copies kept at a lower cost included). Before any, it is the printed price less the publisher's usual discount.
- **Selling price** = the title's own price, otherwise the printed price less the publisher's shop discount to customers, otherwise less the standard discount (`books.sell_discount`, blank = no selling-price check); rounded to the taka.
- **Customer discount on a sale line** is recorded and reduces the sale amount.
- **Other names.** Titles have other names: Bangla spellings, romanised titles, names on memos. When someone corrects a match on an upload, a list or a customer bill, that name is kept, so the next one matches by itself.
- **Web look-ups.** Open Library and Google Books (free; the Google Books key is optional) only fill empty author and ISBN fields, marked "from the web", to confirm. Most Bangla titles aren't found, and the app says so. Biblion's own book list and the Loyverse item list are matched first. A setting turns look-ups off (`intake.web_lookup`).
- **Barcodes.** An ISBN barcode can be scanned with the phone's camera wherever a title is picked: sales, deliveries, stock-take and customer orders.
- **Who sees what:** staff and managers see the book list and stock; costs and what publishers are owed are for people who see money.

### 10.2 Book sales
- **Loyverse is used for all sales**, books and café. Book sales come mainly from Loyverse's "Receipts by item" upload; typing is for corrections and days without an upload.
  - Loyverse's columns are recognised automatically and can be corrected.
  - The date order is worked out (`pos.date_order`).
  - Book categories come from `pos.book_categories` (Books, Book); payment names from `pos.payment_map`.
- **Loyverse replaces typed sales:** an upload replaces sales typed for the same title and day (after the person confirms, the typed sales are cancelled with the reason). Typing sales for a day already uploaded needs a reason and is flagged to the shareholders.
- **Customer returns** are stock movements, with the refund recorded (an expense under "Customer refunds", or set against a new sale).
- **Our own bill to a customer** (a bulk sale with a discount, for example to a school) can be entered or uploaded. It becomes book sale lines with the customer's discount, and warns about doubling with Loyverse.
- **Offline.** Book sales can be saved offline. When they are sent, a clash with a Loyverse upload made in the meantime is shown to the person.

### 10.3 Loyverse item list
- The Loyverse item list (Items → Export) is imported on Book stock → Loyverse upload.
- Titles whose Loyverse price differs from the price they should sell at by more than 2% (`books.price_check_pct`) are listed as "change in Loyverse".

### 10.4 Requisitions (orders to publishers)
- **Contents.** Publisher by publisher; each line has title, author, ISBN, quantity and unit price. Each requisition has a unique number (RQ-…).
- **Statuses:** draft, sent, part received, received, closed, cancelled.
- **Drafts can be edited.** A sent requisition is cancelled and remade, not edited.
- **Making one:**
  - Choose the publisher and the sales period (a first requisition looks back 30 days, `books.req_days`).
  - Each title shows the suggested quantity, with its reason, from the forecast (10.8); titles the forecast says to reorder within a week are added even if none sold in the period.
  - Customers' open special orders for that publisher are added.
  - Change the copies, add titles, then send.
- **Sending.** By email, if the publisher has one. The PDF and an Excel copy are kept in Documents, and both are attached to the email.
- **The printed requisition** shows SL, title, author, quantity and ISBN. Prices stay in the app.
- **Automatic drafts** (Setup → Books, `books.req_auto`: off, weekly, every two weeks or monthly): a draft per publisher with sales since its last requisition and any customer orders. A manager checks the copies and sends it. Any period can still be chosen by hand.
- **Our own order list** sent to a publisher outside the app can be uploaded. It is recorded as a sent requisition (lines may be title-only), and later deliveries are matched to it title by title.
- **Closing.** The rest of a requisition can be closed with a reason (what is left becomes "not coming", and its special orders wait for the next requisition). Lines can be cancelled with a note.
- **Reports:** outstanding requisitions; requisitions ordered against received.

### 10.5 Deliveries (receiving)
- **A delivery has** its challan or receipt number and date; its titles and ISBNs, quantities and unit prices; the requisition it answers, if any.
- **Several and partial deliveries** are allowed against one requisition. **Direct purchases** (no requisition) are recorded the same way.
- **Duplicates.** A challan number already entered for that publisher is blocked, with a link to the earlier delivery.
- **Checking a delivery** against its requisition: full or partial; outstanding; excess, unexpected or missing titles; title or ISBN mismatch; price differences. Each must be decided (accept, reject or note) by an authorised person before the delivery is approved. A delivery is never approved automatically; the approval switch (3.2) decides when a manager's is final.
- **Damaged copies** are sent back, kept at full cost, or kept at a lower cost.
- **Extra copies** are kept or sent back.
- **Short copies** are still expected, or not coming (taken off the requisition).
- **Payment on delivery and the delivery charge** are handled (a publisher payment, and a delivery charge as an expense or a delivery service's bill). A payment the person may not enter goes to the to-do list of those who can, and they are told.
- **Opening stock** is recorded as a delivery of its own kind, dated the start date, approved like any delivery, and can be done in parts: one shelf or one publisher at a time.
- **The publisher's price** is found from the challan, in this order:
  1. a price per copy, or a line amount lower than copies × printed price (that book's own discount);
  2. a % on the book's line;
  3. a % for the whole challan ("Commission 25%");
  4. a discount written as an amount ("Less 350"), turned into a %;
  5. the total at printed prices against the net payable;
  6. otherwise, the publisher's usual discount.

  Each title shows "x% off" (marked "this book" when it has its own discount), and the check screen says where the discount came from. "Discount on all titles" applies one % to every title except those with their own. A discount more than 2% from the publisher's usual one is shown as a difference to accept.
- Customers' special orders for a title are marked arrived when the delivery is approved (oldest first).

### 10.6 Customer special orders
- A customer asks for a book Biblion doesn't have: name, mobile, the book (or a typed title), publisher, quantity, and any advance. Staff can take them.
- It goes into the next requisition to that publisher by itself.
- When the delivery is approved, the order shows **Arrived** and the person who took it is told.
- "Tell on WhatsApp" opens a ready message and marks the order told; then **Collected**, or cancelled with a reason.
- An advance on an order is noted on it; the money counts in that day's sales through the daily shift.
- The list (names and phones) is for managers and shareholders. Customer orders can be saved offline.

### 10.7 Stock-take
- **Start:** all books, or one publisher's. One stock-take is open at a time.
- **Counting.** Type (or scan) what is on the shelf for each title. Each count saves by itself, one row per title and price, and several people can count at once. Counts are **blind**: counters don't see the expected number.
- **Finish and correct stock** turns the differences into count corrections, approved as usual (3.2). Titles not counted are treated as missing (0) or left as they are, chosen when finishing.
- **Records.** A finished stock-take keeps the titles that differed. A stock-take can be cancelled with a reason.

### 10.8 Book forecast
- Uses the Croston weekly method, for slow sellers, over 12 weeks (`books.forecast_weeks`).
- Delivery takes 7 days (`books.lead_days`). Orders aim to cover 30 days besides that (`books.order_cover_days`).
- No suggestion without 4 weeks of sales. The reason is shown, and the usual stock level is used instead.
- A title's selling strength (speed, trend, how fast the last order sold, how recently it sold) is shown over 30, 90, 180, 365 or 730 days (`books.rating_days`, 180).

### 10.9 Books reports
- current stock, by publisher and by title, with its value at cost;
- outstanding requisitions; requisitions ordered against received;
- discrepancies (deliveries and stock-takes); stock movements;
- low stock and out of stock, with the forecast's suggestion;
- monthly book sales (the books monthly report);
- publisher statements, the publisher tracker.

---

## 11. Café

### 11.1 Items
- **Each item has:** name, Bangla name, other names; kind (café stock or supply); vendor or "any shop"; unit, category; shelf life, days to deliver; minimum order, order multiple; usual stock level (used until there is enough history); selling price, buying cost; Loyverse name; "buy enough for (days)"; counted daily or not; notes, sort order; status.
- **Two kinds:**
  - **Café stock** (cakes, brownies, milk …): counted at closing every day.
  - **Supplies** (sugar, tissues, cups, cleaning things): "on hand" is typed when ordering.
- **One item picker** everywhere items are chosen (café orders, vendor bills, uploaded bills, shopping lists): type a few letters in English, Bangla or an other name and tap the item; "+ Add … as a new item" adds one in place; a similar name ("Suger" while "Sugar" exists) is offered first.
- **Other names** are learnt when someone corrects a match. A typed bill name that is an item's other name is linked at once.
- **Common items:** a checklist of 38 common café items (19 stock, 19 supplies) with Bangla names, units, shelf life and usual cover. Nothing is added until it is ticked.
- **"Bought, but not in the item list"** lists names typed on bills. One tap makes each an item (or links it to one), linking the past bills so the forecast uses them.

### 11.2 Daily closing count
- For each item: counted now, wasted (with a reason), expired. Counts are blind: the counter doesn't see the expected amount.
- **Used** = the earlier count + received − the new count − wasted − expired. Correcting an earlier day recalculates the later days. Days the item ran out are marked.
- **Batches.** Stock is kept in batches with expiry dates (the date typed, or the received date plus the item's shelf life). The oldest expiry is used first. Expired stock is never usable. Items close to their date (2 days, `cafe.expiry_warn_days`) are shown in red and reminded.
- **Compare with Loyverse.** Loyverse's "receipts by item" can be uploaded and compared with usage. Gaps are flagged (for example "Brownie: 12 sold, 15 used").
- **Who and how.** Staff do the count; they see no orders or costs. It can be a daily task with the form inside, and works offline (counts and waste).

### 11.3 Café orders (one workflow for café stock and supplies)
1. **Suggestions.** The app suggests quantities, grouped by vendor plus "Any shop / market". It can show only what is due now, and any item can be added to any order.
2. **"Buy for".** Automatic, 1 week, 2 weeks, 1 month, 2 months or 3 months; otherwise the item's own "buy enough for (days)"; otherwise Automatic for café stock (balancing the delivery charge and shelf life) and 30 days for supplies (`cafe.supply_cover_days`). **Shelf life always caps it**, and the reason says so. Before a forecast exists, the usual stock level is used.
3. **Supplies.** Type what is on hand. These checks teach the app how fast each supply is used.
4. **Changes.** Any quantity changed from the suggestion needs a reason, kept on the order.
5. **Prepare the order.** Approved as usual (3.2); a shareholder's own order is final at once. Nobody approves their own.
6. **Send.** As PDF, Excel or WhatsApp text.
7. **Bills.** Record one or more bills against the order, from the vendor or from several shops, by uploading the cash memo or with "Record the bill" (a vendor purchase with item lines, 9.1).
8. **Status.** Draft, approved, part bought, bought, cancelled; the rest can be closed with a reason.
9. **New supplies.** Items typed by name on an order become supply items when it is approved.

A shopping list uploaded as a photo becomes a café order for any shop.

### 11.4 Café forecast (statistics, not AI)
- **Why statistics:** no free AI model can run in Apps Script, an in-browser model would slow the app down, and there is too little data to learn from.
- **Café stock:** weighted daily usage (recent days count more) and the weekday pattern; days the item ran out are ignored; safety stock from a service level of 90% (`cafe.service_level`); lead time, minimum order and order multiples; the delivery charge kept near 10% of the order (`cafe.max_delivery_share`), using each vendor's average charge over its last 10 deliveries; capped by shelf life.
- **Supplies:** usage between stock checks (the on-hand typed on each order) and the bills in between, recent periods counting more; until there are two checks 14 days apart, usage comes from the purchases alone; safety stock from the spread once 3 periods are known (15% extra before that); between checks, on hand is estimated.
- **Planned events** (for example a book fair) scale demand (`forecast.events`).
- **Minimum history:** no suggestion without 14 days of counts (`cafe.min_history_days`). The usual stock level is used instead, and the reason is shown.
- **When it runs:** nightly, at about 03:00. Screens read the stored results.
- **Every suggestion shows its reason:** usage per day, busy weekdays, delivery time, shelf life and the delivery charge. Management can always change the quantity.

### 11.5 Café stock page
Tabs: items, counts, expiry & waste, orders. The café overview shows what to order and what is expiring.

---

## 12. Customers, membership and loyalty cards

### 12.1 Customers
- **Each customer is kept once:** name, mobile (matched on its 11-digit form 01XXXXXXXXX), email, note.
- **Where customers are picked:** customer orders, event bookings and bills to customers.
- **The customer page** shows what each person ordered, booked and bought, and each card's history and photo.
- **Search** finds a customer by any detail: name, any part of the mobile, email, member number or note.
- **Access:** all customer and card data, card photos and exported lists are for **managers and shareholders only**, enforced on the server. Staff can type a customer on a customer order, but can't look customers up.

### 12.2 The shop's offers
- **Membership card:** given with a purchase of Tk 2,000 or more (`members.min_purchase`). Discounts: 5% off books, 7% off food, 10% off drinks (`members.discounts`), given in Loyverse.
- **Loyalty card:** a free regular drink after 10 drink purchases (`loyalty.drinks_per_free`).

### 12.3 Membership cards
- **Valid for 2 years** (`members.valid_years`), then renewed. A renewal runs from the earlier expiry date, or from today if the card had lapsed. The period can change for future cards; cards already given keep their dates.
- **Member numbers.** Paper card numbers are kept as written (for example No. 106), and the next free number is suggested. A number already used by another customer is refused.
- **Adding a member:** "Add a member", or upload a photo of the filled card.
- **Cards ending soon** can be listed with the state filter. There are **no** expiry reminders on Home.
- **Card history:** issued, renewed, photo, free drink, free drink cancelled.

### 12.4 Loyalty cards
- **No per-drink tracking.** One confirmed upload of a full loyalty card (its info side) = one free drink. Without a photo: "Record a free drink".
- **What is kept:** the count of free drinks, the last date, and drinks bought ≈ free drinks × 10.
- **Checks.** A second free drink on the same day is asked about. A mistaken one is cancelled with a reason.

### 12.5 Reading cards and the members' ledger
- **Upload a document recognises** membership cards, full loyalty cards, and ledgers of members or loyal customers (photos or PDF).
- **Google's text reading** reads the printed labels, mobile, email, member number and dates. The photo date is taken from the file name.
- **Handwriting.** Gemini reads the handwriting only if Setup → Customer cards allows it (`members.ai`, on to start). Google's free tier may use what is sent to improve its products. When it is off, the manager types what Google's reader couldn't read.
- **The members' ledger.** Each line is checked, then confirmed. Lines that clash are left out and listed.
- **Nothing is saved** before a manager or shareholder confirms.

### 12.6 The list
- Customers & cards has tabs: Membership, Loyalty, All, with counts.
- The list downloads as a letterhead PDF or Excel (members and loyalty sheets). It is kept in Documents as sensitive, and opened only by managers and shareholders.

---

## 13. Events and bookings

- **A booking has:** number, date, start and end time; title, kind; customer or organiser, phone, email; number of people; fee, deposit, note.
- **Flow:**
  - add;
  - **Confirm** when the deposit is paid (the deposit goes in as Other income);
  - **Done** after the event (the rest of the fee goes in as Other income);
  - or **Cancel** with any refund (the refund is an Expense under "Customer refunds").
- **Rules:** these money entries follow the normal approval rules and month lock; two bookings at the same time are flagged; there is one events space (no room field).
- **Who:** managers and owners add bookings. Everyone sees upcoming bookings on Home.
- **Lists.** Earlier events are listed, newest first, with paging. Search uses only the fields each person may see.
- Planned events can raise café demand (11.4).

---

## 14. Upload a document

### 14.1 Ways in
- The upload arrow at the top of every screen, and Upload a document on Home.
- **Drag and drop:** on the upload area, or anywhere on the app window (a "Drop to upload" layer appears, and Upload opens with the files).
- **Android Share** from the gallery, WhatsApp or another app (up to 10 files at a time).
- All ways feed the same reading and the same checks. There is no email intake.

**Files:**
- Accepted types are images, PDF and CSV. A file can be up to 10 MB.
- Photos are made smaller on the phone before upload: 1,600 px (1,800 px for reading) at JPEG quality 0.74.
- Several photos of one paper are joined into one PDF (unless unticked).
- **The very same file again** isn't uploaded a second time (found by its fingerprint). The app says when it was uploaded and by whom, and opens it if it is still waiting.

### 14.2 Reading
- **Google Drive's own text reading** (free, Bangla and English) is always used.
- **Gemini** (free key, optional) is used for handwriting and poor photos (Setup → Reading documents, `intake.ai`): only for hard documents (the starting value: handwriting, poor photos, mixed Bangla); every receipt and bill; or never. The model is set by `intake.gemini_model` (falling back to another current model if Google retires the name). The key is kept in the script's properties, never in a sheet or a reply.
- **Staff papers are private.** No text is kept, and they are never sent to Gemini, except a **CV**: a tick on each CV upload decides whether Gemini may read it; otherwise only Google's free reading is used. What is read fills the applicant's standard form as suggestions to check.
- Customer cards use their own setting (section 12.5).
- **Unreadable photos.** A photo that can't be read, with no kind given, makes the app ask what the document is **before** anything is sent to Gemini.
- **Privacy note shown to owners:** on Gemini's free tier Google may use what is sent to improve its products, and people at Google may read it.
- **Web look-ups** (Open Library, Google Books) are on by default (`intake.web_lookup`), with a contact email sent with them (`intake.contact_email`).

### 14.3 Steps
1. **Reading.**
2. **Needs kind:** the app asks what it is, if it can't tell.
3. **Ready:** the check screen.
4. **Confirmed**, set aside (**discarded**, with a reason), or **removed**.

**How the kind is chosen**
- The kind is worked out from the text, and from what is open in the app: requisitions, café orders, unpaid bills, leave requests, entries already saved. The app also works out **why** the document was uploaded.

**The check screen**
- The scan is shown beside the prepared entries. A yellow box lists what the app was unsure of. Everything can be corrected. Each new entry shows the approval rule it will fall under.

**Confirm**
- **One Confirm** creates every entry, under the person's own permissions and the normal approval rules, as if typed. It files the document on each record. Nothing is saved before Confirm.

**After Confirm**
- A final list shows what was done and what is still to do. For example: "Change the Loyverse price of X to Tk 340"; a payment the person may not enter, in which case those who can are told.

### 14.4 Kinds
| Kind | What Confirm does |
|---|---|
| Book delivery or purchase from a publisher (challan) | The delivery against the requisition (or a direct purchase), with extra, short and damaged copies, commission, payment on delivery and delivery charge; new titles added |
| Café or vendor bill | The vendor purchase (on credit, or paid on the spot when marked "COD" or "Received") with its items going into café stock; linked to a café order if one matches |
| Utility bill | The expense with the bill details |
| Other expense (cash memo, rent, repairs …) | An expense |
| Money receipt for a payment we made | Attached to, or creates, the payment |
| Delivery service (courier) slip | The delivery service's bill, or an expense in a shipping or courier category; "To-Pay" means paid on arrival; the courier is found by name; the sender noted |
| Bank, bKash or Nagad slip | By the kind of transaction: cash out → a transfer from bKash to the cash drawer; bKash to bank → a transfer to the bank; cash in → a transfer from the drawer to bKash; received → income; merchant payment or send money → a vendor or publisher payment if the slip names one, otherwise an expense. The check screen says which it read. The TrxID is kept; bKash's charge can be typed as its own expense |
| Statement of account from a publisher or vendor | Kept and matched against what the app shows |
| Loyverse file or printed shift report | Fills the daily shift (figures shown; "Open the daily shift"; the report filed on the shift) or the book sales |
| Medical certificate or leave paper | Attached to the leave |
| Resignation letter | Starts the leaving steps |
| CV of a job applicant | Kept with the applicant; read only as 14.2 allows |
| NID, passport or certificate of an employee | Filed as a sensitive staff document |
| Other staff document | Filed on the staff record |
| Bank, bKash or Nagad account statement | Opens Match a statement with the file |
| Our order list sent to a publisher | A sent requisition, matched title by title on delivery |
| Our bill to a customer (book sale) | Book sales with the customer's discount, only if not also in Loyverse |
| Terms or agreement | Payment schedule, credit limit, discount and returns saved on the supplier |
| Quotation | Kept as a quotation, with an optional task for the owners |
| Shopping list for supplies | A café order for any shop |
| Membership card | A member, with the paper number |
| Loyalty card, full | One free drink |
| List or ledger of members / loyal customers | Members and cards, line by line |
| Anything else | Kept in the document library |

### 14.5 Reading rules (from the owners' real documents)
These must keep working. Test copies of the documents are redacted or made up: no personal bank statement, private phone number, name or account is kept in the code.
- Invoice rows that wrap over two or more lines are joined. The Bangla title and the ISBN are kept, and the total discount sits on its own line.
- When there is a printed total, the discount is taken from it.
- A publisher's row "printed price, commission %, copies, net amount" is read as such, and the row's own commission becomes that line's cost (rows at different commissions on one invoice).
- When a row has only copies and one figure, the printed total decides whether that figure is a price or the row's amount.
- ISBN digits are never prices. Sizes ("1L", "750ml") are not figures; counts ("20p", "2000 pcs") are quantities. A row number at the start of a line is dropped.
- Letterhead lines (including BIN), lines with "%" (terms), "Label : value" lines and dated lines are not items. "Bill To" is never joined to the date line.
- Delivery charges are charges, not a negative discount.
- A courier slip marked "To-Pay" means paid on arrival. A bill marked "COD" or "Received" is paid now.
- "pay every 2 months" is a terms line, not an amount paid.
- A label alone on its line (সর্বমোট, Amount) takes the figure on the next line; label and figure pairs split over lines are joined.
- The TrxID is found under "ট্রানজেকশন আইডি" or "Transaction ID"; the bill number from "No. :", "SL No." and "Consignment No.".
- A receipt's "TK 2000/-" is its total, and "বিকাশ", cheque or cash says how it was paid.
- Bangla vowel marks count as letters. "tk" is matched only as a whole word. Bangla digits are read as numbers.

### 14.6 Duplicates
- **The same bKash TrxID** is refused, and the app offers to attach instead.
- **The same challan or bill number, or about the same amount within 10 days,** is offered for attaching to the existing entry instead of entering it twice. **A matching challan or bill number** can't be entered again at all.
- **If only the amount and date match** (no number), the app asks whether it is a different document.
- **Another photo of the same paper** is flagged on its check screen. If the first is already confirmed, Confirm stops with "Already entered" and offers to attach the photo to that entry.
- **Confirming past a "maybe a duplicate" warning** makes the new entries wait for a shareholder.
- **Uploads use the same duplicate service** as typed entries (section 6.13).

### 14.7 Housekeeping
- Uploads never confirmed are set aside after 30 days on a schedule, the file kept in Drive's bin for recovery, and listed.
- "Set aside" drops an upload that isn't needed, with a reason.

---

## 15. Document library

- **What can carry documents.** Any entry: money entries, the daily shift, vendor and publisher entries, deliveries, requisitions, tasks. HR documents (staff documents, claims, payslips) appear in the same library, under the same permissions.
- **Kinds of document:** receipts, bills, memos, challans, bank and bKash slips, statements, agreements, signed salary receipts, quotations, and anything else.
- **One index of every file:** type, date, number, party, amount, note, record, uploader, and the text read from the scan. Text is read hourly, 12 files a run. Sensitive HR files are never read. Reading can be switched off (`files.read_text`).
- **Search** by party, number, amount or any word on the scan, with filters.
- **Viewing:** a grid of thumbnails (loaded as needed, kept for 6 hours); a viewer that zooms, rotates and pages through; download, print, email.
- **Several files:** choose several to print together, save as one PDF, or email.
- **Attaching:**
  - An attach box in every form: take a photo, choose a file, or pick from the library.
  - Uploaded before saving, a file is "staged" and cleared after a day if never attached. After saving, it is attached.
  - A document can be kept "not linked yet" and attached later.
- **Same file twice:** it isn't stored again. The person is told where it already is.
- **Removing a file** needs a reason. It keeps the index row, and sends the Drive copy to the bin (30-day recovery).
- **Who sees a document** = who may see its record. Staff identity and customer files are sensitive, served only to people with the permission, and every opening is logged.
- **Drive layout** (private, never shared): folders by module / record kind / year / year-month; file names `date_MODULE_TYPE_number_party_TkAmount.ext` (for example `2026-11-05_ACC_BILL_101_MilkVita_Tk3000.jpg`).
- **Expiry.** Files can have an expiry date, with reminders before it (30 days, `docs.expiry_warn_days`).

---
## 16. People (HR)

### 16.1 Staff records
- **Register an existing employee**, or hire through recruitment.
- **Staff numbers** are sequential and never reused: BIB0001 (`staff.number_prefix`, `staff.number_digits`).
- **A staff record holds:**
  - personal details: name (English and Bangla), father's and mother's names, date of birth, gender, blood group, marital status, present and permanent address, phone, another phone, email, photo;
  - skills, languages, computer skills;
  - department, designation, employment type, supervisor, joining date, probation;
  - work: usual hours, weekly days off, available shifts, required hours and flexibility (from the designation unless set);
  - identity (NID or passport: sensitive);
  - contacts (emergency; family: sensitive);
  - education, employment history, training, references;
  - salary history (sensitive);
  - documents (versioned, with expiry);
  - job descriptions (with revisions);
  - the sign-in it is linked to, and a punch PIN for the shop's punch device.
- **Own details.** People can change their own phone, email and address (`profile.self_edit`, on; can be set per person). The change waits until a manager approves it (a shareholder for a manager's own); the person is told.
- **Probation** (3 months, `leave.probation_months`) is confirmed by a manager. Home reminds managers of probation dates. Earned leave counts from confirmation.
- **Print staff file:** the CV page plus the person's documents, as one PDF.
- **Lists made at the first setup** (S3): departments, designations with their responsibilities, employment types, document categories.

### 16.2 Documents, job descriptions, procedures and letters
- **Staff documents** are filed by category (S3), each sensitive or not, visible to the staff member or not, with expiry or not, and needed at onboarding or not. Documents are versioned (a new version supersedes the earlier one); expiry is reminded (30 days, `documents.expiry_reminder_days`).
- **Job descriptions:** drafted from a designation's responsibilities, issued to the person, and signed; each change is a new revision, acknowledged again.
- **Procedures (SOPs):** published for everyone or chosen people; each person acknowledges them ("I have read and understood this"); changing one makes a new version, acknowledged again. Each person reads theirs under Notices.
- **Announcements:** published by managers for everyone, staff only, managers and shareholders only, or chosen people; they can ask for acknowledgement, carry attachments, and stay pinned on Home until a date. Opening one marks it read; managers see who has read or acknowledged.
- **Letters** from templates in Setup → Letters: offer; appointment; experience certificate (the conduct sentence can be changed or removed each time, `letters.experience_conduct`); release letter. Templates are plain text (the first line is the title, a blank line between paragraphs) with placeholders such as `{{name}}`, `{{position}}`, `{{joined_on}}`, `{{salary}}`, `{{hours}}`, `{{left_on}}`, `{{today}}`, filled from the record; a misspelt placeholder is refused when saving. An issued letter keeps its words and prints on the letterhead. Offer and appointment letters need staff editing; experience and release letters need the leaving permission and a last day.

### 16.3 Roster and shifts
- **Shifts** are named hours (templates made at the first setup: Morning 09:00–17:00, Day 11:00–19:00, Evening 15:00–23:00). Each shift can have **places** (a full shift refuses more people) and be **limited to designations**. Each person can have their **own list of shifts**; choosing others needs a manager.
- **The roster** is set by managers: a shift, a day off, or usual hours on any person's date. The week starts on Saturday. A roster can be generated, and schedules approved or cancelled.
- **Opening hours:** 11:00–23:00 (`attendance.shop_open`, `attendance.shop_close`), on the open days (`org.open_days`, every day). A shift outside these hours (opening prep, an evening event) needs approval (`hours.outside_hours_approval`: a manager to start; an owner; or none).
- **Expected work for a person on a day**, most important first:
  1. approved full-day leave (half-day leave halves the hours);
  2. a public holiday when the shop is closed;
  3. the roster for that date (including swaps and day-off moves);
  4. their usual hours and weekly days off.

  Attendance uses this, so leave and closed holidays never show as absent; someone working on a day off is never marked late.
- **Choosing shifts:**
  - Staff can choose a shift from tomorrow up to 7 days ahead (`selection.advance_days`), and are asked "Which shift tomorrow?" right after punching out. At 23:30 (`selection.reminder_time`) missing choices are flagged to managers. Staff can be stopped from choosing (`rota.self_select`).
  - **Every choice is confirmed** by a manager or a shareholder (a manager's own by a shareholder); nobody confirms their own.
  - **Short rest** (under 8 hours between shifts, `selection.min_rest_hours`) is a **warning only**, shown to the person choosing, the manager deciding, and a manager setting the roster. Rest counts from the actual punch out, else the planned end, and both sides are checked: before the chosen shift and before the next one.
  - **Unavailable days:** staff mark days or weekdays they can't work (`rota.self_unavailable`, on; can be set per person); a choice on one needs a manager's OK, and managers see it.
- **Shift swaps:** one person asks, the colleague agrees, then a manager decides; both days swap.
- **Weekly day-off moves:** to a working day in the same week, asked at least 1 day ahead (`exchange.min_notice_days`), decided by someone with the holiday-approval permission. A manager can assign, resolve or override them.
- **Public holidays:** a list per year (empty to start). On a holiday Biblion is open and only rostered staff work (`holidays.treatment` = open_scheduled); "closed" means nobody is expected and leave doesn't count those days; "normal" is an ordinary day.

### 16.4 Attendance
- **Punching:** punch in, take a break, back from break, punch out; from the person's **own phone**, on Home. Repeat taps within 120 seconds count once (`attendance.duplicate_window_sec`). On a break, "Back from break" is the main button and "Punch out" the smaller one.
- **The shop's punch device** (off to start, `attendance.device_enabled`): a shareholder can turn it on, and a manager then makes a tablet or phone a punch device. With nobody signed in, it shows everyone with a PIN. Each punch is signed with the device's secret and a key from the person's PIN (PBKDF2, then HMAC-SHA256); the PIN never leaves the device and the server keeps only its hash; 5 wrong PINs lock that person's PIN for 15 minutes. The device needs no location. People set their own PIN.
- **GPS:**
  - The distance to Biblion's location is measured. The location is set by standing inside Biblion and tapping "Use this device's current location".
  - The punch must be within **50 m** (`gps.radius_m`), with the reported accuracy within 100 m (`gps.max_accuracy_m`); a rougher fix counts as outside.
  - **Outside the area** (`gps.exception`): the punch is allowed with a reason and waits for a manager's check (starting value); or it is blocked and the person asks for a correction.
- **Punches outside opening hours** wait for a manager's check.
- **Time:** online punches use the server's time; the device's time and the difference are stored too.
- **Offline punches:** saved on the phone and sent later; the clock difference is measured and adjusted; differences over 5 minutes are flagged (`attendance.clock_skew_flag_min`); out-of-sequence punches are flagged; punches older than 7 days are refused but kept (`attendance.offline_max_age_days`). They stay **provisional** until a manager validates them, unless clean offline punches are accepted automatically (`attendance.offline_auto_validate`, off). Repeats are removed by id and by the short time window.
- **Breaks** are recorded and shown, and **paid** (`breaks.paid`, `breaks.mode` = recorded); other choices: not deducted, a fixed break after some hours (`breaks.fixed_minutes`, `breaks.min_work_for_fixed`), or the shift's planned break. **Out from a break** is allowed: the break ends at the punch out and is paid; it is flagged for a manager only when before the shift's end. A break never followed by anything is "No punch out".
- **Required hours** come from the designation (or the person's own setting), or from the shift length (`hours.required_basis`).
- **Flexibility** (for example the barista's ±1 hour, per designation; `hours.flex_mode`): not applied, the raw difference is reported (starting value); no shortfall or overtime within ±flex; only time beyond flex counts; or a start/finish window.
- **Lateness and early leaving:** grace 0 minutes (`attendance.late_grace_min`, `attendance.early_grace_min`); never measured for designations with a flexible start.
- **Incomplete punches.** "No punch out" 120 minutes after the shift's end (`attendance.incomplete_after_min`). An unfinished punch on a past day reports no shortfall until corrected.
- **The day's result:**
  - Punches are paired into sessions; an overnight session belongs to the day it started.
  - Required minutes count only on scheduled working days: half for approved half-day leave, zero for leave and holidays.
  - **Hours short and overtime** are summed separately, never netted, and never cut pay by themselves.
  - **Statuses:** present, absent, late, early departure, half-day; approved leave, weekly holiday, public holiday, off-day; incomplete punch, correction pending.
  - A half-day threshold is optional (`attendance.half_day_pct`, blank).
  - The average break taken (a day, or per day over a period) is shown.
- **Attendance is always worked out from the punches**, never stored as a summary, so it can't drift from them.
- **Corrections:** the person asks for a correction (a missing punch, or one replacing a wrong one) with the real time and a reason. A manager decides (a manager's own, a shareholder); nobody decides their own; "Not accepted" needs a note the person sees. A manager can add a missing punch directly. Nothing punched is ever changed: corrections add or void events through approved correction records, and validation decisions are stored beside the punch.
- **The attendance board** shows the team for today.

### 16.5 Leave and holidays
- **Leave types** (made at the first setup, S3; more can be added): each is paid or not, taken from the earned balance or not, allows half days or not, and requires an attachment or not (for example a medical certificate).
- **Half-day leave** is the first or second half of one day; it counts 0.5 and halves the hours expected.
- **Earned leave:**
  - **1.5 days a month** (`leave.rate`) after probation is confirmed;
  - credited by calendar month (`leave.timing` = calendar_month; the other choice is at the end of each service month);
  - part months: by days (`leave.partial`; other choices: the full 1.5 days, or none);
  - counted in **working days** (`leave.day_counting`), so days off and closed holidays don't count;
  - no negative balance (`leave.allow_negative`, off), counting waiting requests.
  - The balance is worked out when shown (earned + adjustments − approved leave from the balance), so re-runs and rule changes never double-credit.
- **Applying and deciding:** apply (with the attachment if the type requires it), cancel (until it starts; after that by someone who may decide it), decide (by the ladder), override a decision (a shareholder, with a reason). A manager's own leave goes to a shareholder. Leave overlapping other leave is refused. A manager can record leave for someone directly.
- **Balances** are adjusted only by shareholders, with a reason, never their own (for example opening balances: "Opening balance from the earlier HR records").
- **Leave calendar**, and each person's **overall leave record** (every application, decision, adjustment and balance).
- **Effect of approved leave:** it moves one-person tasks to the working day before (section 5.5).

### 16.6 Payroll
- **The month** is the accounting month (section 4.4).
- **Salary structure:** parts (basic, allowances by name), a food allowance rate of the person's own (optional), overtime (on or off for the person, with an hourly rate), the payment method and account (cash, bKash, bank), each change effective from a date. A salary change made by a manager waits for a shareholder.
- **Overtime** can be paid only when the shop allows it (`payroll.overtime_paid`, off) and it is on for the person; the hours to pay are chosen when issuing.
- **A payslip** per person and month:
  - divisor: the days in the period, or 30 (`payroll.unpaid_divisor`; "no adjustment" is a third choice);
  - base: the salary for a whole period employed (by the days of each salary when it changed); otherwise each employed day's salary ÷ divisor;
  - unpaid cut: salary ÷ divisor × (unpaid leave days and absent days the issuer chooses to cut); absences are never cut automatically;
  - overtime pay: hours chosen × the hourly rate;
  - payroll adjustments (one-off additions or cuts for the month, approved by a shareholder);
  - net = base − cut (never below zero) + overtime + adjustments.
- **Drafts and issued payslips:** a draft follows attendance and leave, recalculated nightly and on request. Once a shareholder issues it, its figures stay as they were; to change it, cancel it with a reason and issue it again. Nobody issues their own.
- **Each person's pay account:** what the shop owes them (opening + issued payslips + food allowance earned + settlement − pay given − deductions) and their advance (opening + advances − deductions), worked out when shown.
- **Payslips** as PDF and Excel, on the letterhead. **Paying:** once, on the money screen (Pay staff). **My pay** shows each person their payslips, pay account, food weeks and what has been paid, and anything overdue.

### 16.7 Performance
- **Reviews** on a 1–5 scale for each criterion (`performance.criteria`): Punctuality, Task completion, Work quality, Responsibility, Customer interaction, Teamwork, Communication, Policy compliance.
- A manager starts a review for a person and a period. If set (`performance.self_assessment`, on), the person first scores themselves.
- The reviewer scores each point with notes and a summary, beside the period's figures from attendance and tasks: days worked, late, absent, on leave, hours short and overtime, the average break, tasks done on time, not done and missed.
- Sharing keeps the figures as they were. The person sees the scores once shared, and acknowledges with a comment.
- Nobody reviews themselves, and a manager's review is a shareholder's.
- **Improvement plans** (goals with dates) and **recognitions**.
- **Disciplinary records** (warnings, actions) are sensitive.

### 16.8 Recruitment and onboarding
- **Vacancies** (optional): title, designation, openings, description, requirements, opening and closing dates.
- **Applicants:** name, phone, email, the vacancy or job, where they heard of it, the CV (kept as uploaded), a standard form filled by management (reading the CV as 14.2 allows), notes.
- **Stages:** new, screening, interview, reference check, selected, approved, onboarding, hired; or rejected, withdrawn (with a reason). Every move is kept with who, when and a note.
- **Interviews** (time, mode, interviewers, scores, recommendation) and **reference checks** (referee, outcome) are optional records.
- **Approved** is a shareholder's decision; the offer (salary, start date) and letters follow.
- **Onboarding:** a checklist (`onboarding.steps`) with the required documents (categories marked "needed at onboarding"); ticking records who and when; it shows whether the sign-in is linked and the punch PIN set. Activating it makes the staff record. Tasks held for the position are handed to the new person.
- Recruitment is for managers and shareholders (names and phones are personal).

### 16.9 Other records ("Assets & more")
All optional:
- **Assets:** name, category, serial, purchase date, value, condition, who has it.
- **Incidents and complaints:** what happened, who, severity, actions; customer complaints.
- **Training sessions:** title, date, trainer, attendees.
- **Expense claims:** paid through an expense (section 6.4).
- **Management notes** about a staff member (sensitive, owners).

### 16.10 People overview and reports
- **People overview:** headcount, who is in today, probation dates, leave, birthdays and alerts.
- **Former employees:** everyone who left, with their whole history and documents.
- **HR reports:** daily attendance; working hours, hours short and overtime; leave balances and transactions; weekly holidays and day-off moves; schedules; tasks; performance; payroll; staff list; employment (joins, leavers, headcount).

### 16.11 When a staff member leaves
- **Starting it.** A manager or owner records a resignation or termination, or the employee resigns from My settings → Resigning (notice date and last day). It is approved up the ladder (a staff member's by a manager or shareholder, a manager's by a shareholder). It can be withdrawn. Accepting sets the last day; pay counts up to it.
- **Notice required:** 30 days (`separation.notice_days`).
- **Step 1: hand over tasks.** Every open and repeating task of the person is listed. Each goes to a person, a role or a team; or is **held for the next person who joins in the same position** (given to them when their onboarding completes); or is cancelled (a repeating one ended) with a reason. The person can't be archived until every task has gone somewhere. Tasks are never made after the last day.
- **Step 2: final settlement**, from payroll and the money records:
  - salary and allowances owed to the last working day (every payslip up to it issued first);
  - food allowance owed;
  - **unused leave, decided case by case** (`separation.leave_encash` = ask): a shareholder chooses pay out (days × daily rate) or leave out, with a reason kept on the statement;
  - **notice not served, deducted** (days short × daily rate) (`separation.notice_deduct`); a shareholder can waive it for one person, with a reason;
  - adjustments a shareholder adds, with a reason;
  - less advances and dues owed to the business.

  "Confirm the settlement" puts the leave, notice and adjustment lines into the pay account. The net is paid with the usual staff pay kinds (a deduction for the advance, then Salary paid), offered filled in. The card shows "settled" once paid. A settlement can be reopened with a reason.
- **Step 3: clearance.** Equipment, money, documents, keys and access, each ticked off; "Open tasks handed over" ticks itself. An exit interview can be recorded (optional).
- **Step 4: closing documents:** settlement statement (PDF and Excel, any time); clearance certificate; experience certificate (a shareholder sees the conduct sentence first and can change or remove it); release letter, once clearance is complete. All are kept in the person's staff file.
- **Complete and archive** (after the last day) marks the person "Left", disables the sign-in, cancels future shifts, and skips or ends anything still open of theirs. Nothing is deleted: the person moves to Former employees with their whole history.
- People who left in the last four months stay on the leaving list, so their certificates can still be made.

### 16.12 My work (every staff member)
- My schedule (with shift choices, swap and day-off move requests, unavailable days).
- My attendance (with correction requests).
- My leave (balance, applications, overall record).
- My pay (payslips, pay account, food weeks, overdue).
- My profile (with detail changes and staff number), my documents, my PIN.
- My tasks; Notices (announcements, procedures, job description).

People always work with their own items without a permission, and never see anyone else's.

---
## 17. Reports and downloads

### 17.1 Reports
One Reports page, with tabs. Each person sees only the reports their permissions allow.

- **Accounts:**
  - daily report; monthly accounts (with profit by area and break-even);
  - shareholders' monthly report; salary; payroll; loan register; due and advance list;
  - all money in and out (every movement, with totals by account, kind and area; entries waiting for approval included and marked);
  - payables reconciliation (section 6.10);
  - Match a statement (section 6.14).
- **Books:** section 10.9.
- **Vendors and publishers:** vendor statement, vendor tracker, vendor purchases (9.1); publisher statement, publisher tracker (9.2).
- **Utility bills:** section 6.4.
- **HR:** section 16.10.

Reports stay whole, not paged, for printing and download. Every report can be a report-printing task.

### 17.2 One report, three ways
- Each report is built once on the server, as one model, and the screen, print, PDF and Excel all show that same model: the same columns, figures and totals.
- **One Download button everywhere**, which asks **PDF or Excel**. Excel keeps numbers as numbers (so they can be added up and filtered) and totals in bold; it is made by the app's own small writer, with no library.
- **Excel is offered for** every report and statement, requisitions, payslips, month-end reports and settlement statements. Letters, job descriptions and CVs stay PDF only.
- **PDFs** are made on the server from HTML, on the A4 letterhead: the Biblion logo; the shop's name and description; the address, phone and email (Setup → Business); signature lines where a report needs them. They use Bangla-capable fonts, keep column alignment, include totals rows, mark waiting entries with "*" and a footnote, and carry a marker on sensitive exports. Their colours come from the app's design tokens.
- **Printing** opens a new tab and prints. If pop-ups are blocked, the app says "Allow pop-ups to print". Printing from a report-printing task records the print, and the task can then be done.
- **Email.** Requisitions, library files, documents and reports can be emailed from the app.
- **WhatsApp** sharing is text only: café orders, customer "book arrived" messages.
- **CSV safety.** CSV exports put an apostrophe before cells that start with `=`, `+`, `-` or `@`.

---

## 18. Offline use, caching and sync

### 18.1 What works offline
- **Saved offline and sent later:** money entries; the daily shift; book sales; café counts and waste; customer orders; marking a task done and task comments; attendance punches (from phones and the punch device); own-detail changes.
- **Never offline:** approvals and closings; imports and deliveries; photos; anything that changes permissions.

### 18.2 The app on the phone
- **Installable** (Android: Install app; iPhone: Add to Home Screen). It needs HTTPS.
- **The app shell is cached:** the hashed script, stylesheet and images are served from the phone first; the page waits at most 2.5 seconds for the network, then uses the cached copy; server calls are never cached by the shell; a new release replaces the cache.
- **Version handshake.** The app sends its contract version with each call. An app too old for the server is told to update, and refreshes itself.
- **Quick start.** The app opens with the profile saved on the phone, and refreshes it in the background. A list page seen in the last 5 minutes comes back at once, then refreshes quietly. Fonts load without blocking.

### 18.3 Cached figures
- **What is cached:** the start-up data, Home, task lists, book lists and the café count sheet, kept per signed-in person and used when offline.
- **Age:** working from the cache shows "Figures from <time>". Offline forms don't rely on lists older than a set number of hours without saying so.

### 18.4 The queue
- **Each queued item** carries its own operation id, the owner, when it was made, the action, the details and a label, any record it depends on, tries so far and the next try time, its state (waiting, sending, needs input, failed or done), and the last error.
- **When an entry is saved offline** the person sees "Saved on this phone".
- **The connection light** on the top bar shows online or offline and the number waiting; orange while something waits; tapping it opens "Saved on this phone".
- **"Saved on this phone"** lists each item: send now, edit (the same form, filled in), remove (with a reason), and answer a question.

### 18.5 Sending
- **When:** when the connection returns, when the app comes back into view, and every 60 seconds while online.
- **Whose items:** only the signed-in person's own items, oldest first, one at a time, each with its original operation id.
- **No doubles:** only one tab sends at a time (a lock across tabs); **the operation id is stored on the record and kept for ever**, so an item is never applied twice, however old it is.
- **Every reply to a change has a clear status:** **saved** (with the record id), **needs input** (with the warnings and fields), or **rejected** (with the error).
- **"Needs input" keeps the item** and puts it in front of the person, with the same duplicate and approval dialog as when online. **Entries are never dropped.**
- **The same checks run** as when online: the duplicate guards, a Loyverse upload made meanwhile, a daily shift already entered for that date.
- **Corrections:** an offline correction of a record that was changed meanwhile fails clearly ("this entry was changed by X").
- **Order:** an item can depend on another; the server accepts an id made on the phone for a new record, so a correction queued after its original works.
- **Retries:** every call is retried twice on a network error (0.6 s, then 1.2 s) with the same id; after that, network errors wait longer each time; other errors are counted, and the item is marked failed after a set number of tries.
- **Messages:** "N entries saved offline were sent", and how many need attention; "Not saved: … (see Saved on this phone)".

### 18.6 Signing out and shared phones
- At sign-out, the app warns about unsent items, then clears everything that person's sign-in cached on the phone.
- On first launch after an update, pending items are sent or exported before stores are cleared.

### 18.7 Shared files
Files shared or dropped into the app wait on the phone until the upload page picks them up.

---

## 19. Live updates

- **For the person acting:** summaries and decisions update at once.
- **For others:** other open screens refresh within about 30 seconds (the free setup has no push service). The server keeps a change number for each area (money, books, café, HR, core); the app checks them every 30 seconds while visible, together with the unread notification count. When one moves, only what changed is redrawn, off-screen, keeping the scroll position.
- **Forms are never interrupted.** A page is never redrawn while a dialog is open, a field has focus, or a form has been changed.

---

## 20. Screens and how they behave

### 20.1 Menu (by the working day)
- **Top:** a "Go to…" box (type "leave" or "ছুটি" to jump to a page) · Home · Dashboard · Tasks · Documents · Reports.
- **Today**, in the order of the day: Daily shift · Book sales · Money in & out · Vendor bills · Café closing count · Day closing · Today's team.
- **Café:** Café stock (items, counts, expiry & waste) · Café orders · Events & bookings.
- **Books:** Book stock (with Record a stock change) · Book deliveries · Requisitions · Customer orders (with Stock-take as a tab) · Customers & cards (managers and shareholders).
- **Accounts:** Accounts overview · Pay staff · Publishers · Vendors · Shareholders · Month closing · Getting started (until done).
- **People:** People overview · Staff · Roster · Attendance · Leave & holidays · Payroll · Performance · Recruitment · Announcements · Former employees · Assets & more.
- **My work:** My schedule · attendance · leave · pay · profile. Staff see My work first.
- **Setup:** one item, opening a page of all settings grouped and searchable (business & policies, accounts setup, users & permissions, approvals, attendance, leave, payroll, books, café, reading documents, letters, the activity log, backup).

Each person sees only the sections and pages they may use. Actions live in the pages that use them: the Loyverse upload in Book sales, Daily shift and Café closing count; book approvals in Home → Waiting for you; staff documents on the staff profile and in Documents; reports on one Reports page. Page titles match the menu labels.

### 20.2 Phone
- **A bottom bar by role:** staff: Home, Tasks, Schedule, Count; managers and owners: Home, Dashboard, Tasks, and their first daily job.

### 20.3 States every page and list has
- **Loading:** the current content stays while reloading. Only the newest request may draw, so a slow earlier reply can't overwrite a newer one.
- **Empty:** a short sentence saying why the list is empty and what to do next.
- **Error:** a toast for actions; errors from saving a dialog in the dialog's footer; field errors beside the fields; when a form fails, the message stays and the busy state ends.
- **Offline:** section 18.
- **State chip** on every entry: Checked, To check, Waiting for a shareholder (with the reason), Cancelled, Replaced.
- **Busy buttons:** a button is turned off while its action runs, shows a busy label, then comes back.
- **Dialogs** stack. Escape closes only the top one.
- **Unsaved changes:** leaving a form with unsaved changes asks first.
- **Tooltips** explain fields, figures, chips and buttons wherever they help, in both languages.
- **Keyboard shortcuts** on a computer: N (new entry), / (search), G then H (Home), and a list on "?".

### 20.4 Long lists
- **The page bar:** "Page X of Y · N entries", First / Previous / a box to jump to a page / Next / Last, and 25, 50 or 100 a page: 25 to start on a phone, 50 on a computer; the choice is remembered on the device. The bar appears only when a list is longer than one page.
- **The server sends one page at a time**, newest first. Members stay in number order and customers A–Z.
- **The search box** looks through **every** entry, not only the page on screen. A new search or filter goes back to page 1. Every typed word must be found; words of 3 or more characters match anywhere (for example part of a mobile number); shorter words match whole words only ("bill 3" is not bill 30); dates can be typed as shown (5 Nov 2026) or as 2026-11-05; Bangla digits are read as numbers.
- **Back** returns to the same page, rows per page and search.
- **Paged lists:** activity log, money in & out, vendor bills, daily shifts; pay staff and owners, publishers; book sales, deliveries, requisitions, stock changes, book stock; café orders, documents; customers & cards; recent uploads, customer orders, earlier events; tasks (done, given by me, team); leave applications, attendance corrections, closed applicants, announcements.
- **Not paged:** short or fixed lists, fill-in screens and reports. Notifications keep "Load more".

### 20.5 Tables
- Dates, times, amounts, states and buttons stay on one line. A run of 25 or more characters without a space may break anywhere; other words never split.
- **No sideways scrolling at any width.** A table too wide for its space (reports included) becomes one card per row, each value labelled by its heading. Editable tables keep labels on every field.
- Tabs and segment buttons wrap onto a new line. The recruitment pipeline wraps into rows, and the roster shrinks on phones.

### 20.6 Look
- **Themes:** light, dark, or follow the device, plus an accent colour. Both are kept per person and follow them to any device.
- **Biblion's colour is dark green `#0F3D34`**, the starting accent, the top bar and the splash screen.
- **One set of colours** (design tokens) for both themes, with no hard-coded colours anywhere else.
- **Brand:** the only logo is the hand-and-book drawing with the word "Biblion", used on letterheads; app icons show the drawing only, black on white, with padding for Android's round crop.

### 20.7 Writing style
- Plain words a person who doesn't work with computers understands. Sentence case. "Café" with the accent.
- Money as "Tk 1,000" ("Tk 0"), with Bangladesh grouping (Tk 1,00,000).
- Dates as "Sat 21 Nov" in lists, and "21 Nov 2026" in documents.

### 20.8 Personal settings (`#/me`)
- Profile and own details; staff number; punch PIN.
- Password (if allowed); active sign-ins.
- Notifications and reminders: email on or off and the address, muted kinds, task reminder hours.
- Display: language, theme, colour, Home sections, the "Getting started" card, punch controls on Home.
- Work preferences (for example usual shift).
- Resigning (staff).

### 20.9 Setup
- **One settings system:** every setting has a starting value for everyone, and some can be set per person (marked "personal" in S1). Setup shows the starting value and anyone's personal values, with "reset to default".
- **Setup parts are granted separately:** business, HR policies, books, tasks, accounts setup, users, backup.
- **Accounts setup lists:** money accounts; expense categories (area, "always needs a shareholder"); vendors and publishers; shareholders; other people who take on due; recurring expenses; food allowance rates; staff owed at the start.

---

## 21. Languages

- **English and Bangla** on every screen, message, document, email and server reply. The switch is on the top bar (and in My settings).
- **The language is personal:** kept for the person, and remembered on the device. Emails go in the person's language.
- **Fonts:** Bangla switches the page language and the fonts.
- **Digits:** Latin digits for all calculations, entries and stored values; **Bangla digits** in text shown in Bangla (১,২৫০ টাকা). String values (names, codes, ids) are never changed.
- **Message ids:** every text has a stable message id (for example `money.kind.expense`). Changing the English never breaks the Bangla. Message ids are written out in full in the code, never built from pieces.
- **Placeholders:** numbers, amounts and dates sit in placeholders (`{amount}`, `{date}`) and are formatted for each language; month and weekday names are translated; plurals are handled.
- **Server replies:** the server sends **error codes and parameters**, not sentences. The app shows them in the person's language.
- **Wording rules:** Bangla sentences carry every detail the English carries (who, what, how many, today or yesterday). Agreed words include: counted → গণনা হয়েছে; done → সম্পন্ন; open (button) → খুলুন, (status) → খোলা; café stock → ক্যাফের স্টক; receipts by item → আইটেম অনুযায়ী রসিদ.

---

## 22. Scheduled jobs

One trigger runs every hour. Each job inside it runs once per period, so a missed or repeated hour never doubles a job:

- tasks: making repeating tasks; rechecking task dates (days off, leave, holidays); reminders and overdue alerts;
- recurring expense reminders;
- holiday exchanges; shift-choice reminders (23:30);
- payroll drafts recalculated; salaries kept in step with salary changes;
- automatic requisitions;
- the shareholders' daily warnings email (after closing) with the managers' finals;
- the weekly owner digest (Saturday morning);
- the forecasts (café and books), at about 03:00;
- the nightly check, between 01:00 and 06:00;
- document and supplier-agreement expiry reminders; probation reminders;
- upload housekeeping; staged files cleared;
- reading text from scans (12 files a run);
- purging old sign-ins and read notifications older than 12 months;
- storage check and monthly compaction of the spreadsheets;
- backups (daily, weekly, monthly with a restore test);
- archiving the activity log; the yearly archive of closed years.

---

## 23. Backups, restore, reset and storage

### 23.1 Backups
| Backup | When | Kept |
|---|---|---|
| Daily | Every day after 02:00 (`backup.daily_hour`) | Last 14 |
| Weekly | Every Friday after 03:00 (`backup.weekly_day`) | Last 8 |
| Monthly | The 11th after 04:00, followed by a restore test | Last 12 |
| Before changes | Automatically before a restore or reset | Last 10 |
| Manual | Backup → Back up now | Last 10 |

- **Light backups:** one compressed file of the **data only** (every table of every spreadsheet), with a checksum. Sign-ins are not included.
- **Documents** stay in their Drive folders, where Drive keeps its own history and bin. Each backup lists every document, so nothing can go missing unnoticed.
- **The restore test** rebuilds the latest backup into temporary spreadsheets, reads every table back, compares row counts and checksums, records the result, and bins the copies.
- **Every run** is listed with its rows, checksum and result. A failed backup or restore test alerts the owners (owner alert address).
- **Keeping a copy elsewhere.** Backups live in a private folder. Owners should share it (view only) with a second Google account, or download the monthly backup once a month. Downloading a backup asks for the password.

### 23.2 Restore (owners only)
1. Choose the backup, give the reason, type `RESTORE`, and enter the password.
2. A backup of the data as it is now is taken first.
3. The chosen backup's checksum is checked. A damaged or edited file is refused.
4. **New** spreadsheets are built, every table is written, read back and compared.
5. Only if everything matches does the app switch to them. The previous spreadsheets stay in Drive, and their ids are kept so the app can be switched back.
6. The activity log records who restored which backup and why. **Everyone signs in again.**

A restore from a downloaded file is also possible.

### 23.3 Reset and starting fresh
- Choose the parts to reset (for example only books, or everything), type `RESET`, enter the password; a backup is taken first. Owners only.

### 23.4 Storage and archives
- **Storage status** shows how much each spreadsheet and Drive use, against 15 GB.
- **Compaction.** The spreadsheets' grids are trimmed at setup and every month.
- **Yearly archive.** Each closed year is moved to its own archive sheets, keeping the app fast; a whole year can be downloaded as Excel.
- **Photo sizes.** Photos are reduced before upload.
- **Estimate:** about 20 years of data on 15 GB.

---

## 24. Security

| Concern | Rule |
|---|---|
| Passwords | PBKDF2-HMAC-SHA256 with a salt per user; the iteration count is stored with each hash, so it can be raised. Lock after 5 failures for 15 minutes. Asked again before risky actions (2.4). |
| Sign-ins | Random 96-hex tokens; only the SHA-256 of a token is stored. 30 days per device. Ended at sign-out, disable or leaving. Owners confirm a new device by an email code. Each person sees and ends their sign-ins. |
| Permissions | Every server action declares its permission and is refused without it. Record-level checks (own record or permission; sensitive sections) are inside. Sensitive fields are removed from replies. |
| Approvals | The approval ladder is enforced on the server (section 3). |
| Customer data | Managers and shareholders only, on the server. |
| Files | Private Drive folders, never shared. Served only after a permission check. Opening a sensitive file is logged. Allowed types only, 10 MB at most. |
| Input | Every field is checked on the server (the same checks as the browser). Cells are written as plain text, so text starting with `=` never becomes a formula. CSV cells are protected. |
| Audit | Every change, sign-in, failed sign-in, sensitive view and override is logged. |
| Owners | The Owner role can't lose permissions; the last active owner can't be disabled. |
| Location | GPS is evidence, not proof. It is recorded with accuracy and distance; suspicious or offline punches need a manager's validation. |
| Writes | Changes are made one at a time under a lock (a request that waits more than 30 seconds fails cleanly with BUSY). Each change runs inside a rollback journal, so an error part-way leaves no half-made records. A wrong password or PIN still counts towards the lockout. |
| Keys | The Gemini and Google Books keys are kept in the script's properties, never in the app, a sheet or a reply. |
| Two addresses | The app opened from GitHub Pages or from the Apps Script address uses the same sign-in and the same server checks; each keeps its own sign-in on the device. |

---

## 25. Data rules

- **Where the data lives:** five Google Spreadsheets, created on first use: core, accounts, books, café (with customers), HR.
- **Tables:** one sheet per table. Row 1 holds the column names, and every cell is plain text. Columns are read by name, so adding a column later is safe.
- **Base columns:** every row has id, created at, created by, updated at, updated by, and version.
- **IDs:** permanent, with a prefix (for example `TRX-…`); never taken from row numbers or names; records link to each other only by id.
- **Types:** number, true/false and JSON columns are typed.
- **One money ledger:** every money, vendor, publisher, staff pay, shareholder and daily shift entry is one row of the money table, with its kind; each kind's effect is defined once (section 6.3).
- **Fields that need care:**
  - **States:** status (active, cancelled, replaced, inactive …); approval (final or waiting) with the wait reasons; the duplicate reason; the cancel reason; "replaces" and "replaced by".
  - **Links:** a child row points to its parent (dues from a daily shift link to that shift; links for pay, receipts, records, loans and deliveries).
  - **Book stock:** the stock movements are the ledger. Balances are worked out from them and can be rebuilt at any time.
  - **Publisher settlement:** "covers up to" marks which sales a payment settles.
  - **Share history:** must cover every date, adding up to 100% on each.
  - **Setup data that is history:** money accounts (exactly one drawer), the areas of expense categories and vendors, and "always needs a shareholder".
  - **Uploads:** each keeps its prepared entries until confirmed.
  - **Logs:** sign-ins, the request record, notifications, backup runs, the activity log.
- **Big records** (a full stock-take) are stored one row per title and price, so they never pass the 50,000-character cell limit.
- **Speed on Google Sheets:** each table is read once per request; tables are cached for up to 10 minutes between requests (switchable), and a change never reads from the cache. Figures for closed months are frozen, so they aren't recalculated from all records. Closed years move to archive sheets.
- **Moving to another database later** (for example PostgreSQL): the data layer is the only part that touches Sheets, and backups are plain table data.

---

## 26. Server contract

- **One endpoint**, called with POST: `{action, payload, token, op_id, client_now, contract}`, sent as plain text so the browser needs no extra check before each call.
- **The reply** is `{ok:true, data}` or `{ok:false, error:{code, params, fields}}`.
- **Every change** carries an operation id and is applied once; the id is kept for ever.
- **Change replies** say `saved` (with the record id), `needs_input` (warnings and field messages) or `rejected` (the error).
- **The duplicate prompt:** warnings, each with a code, its parameters, the earlier entries and a fix; a reason is needed. The app sends again with the reason.
- **Paged lists:** `{q, offset, limit}` → `{items, total, offset, limit}`; an offset past the end gives the last page.
- **Errors** are codes with parameters, never sentences (section 21).
- **Public actions:** sign-in, first-owner setup, setup status, and a health check.
- **The action list** (every action, whether it changes data, its permission, its area and its payload rules) is one list in the code, read by the server's router, the app and the hygiene check. An action without a handler, or a handler without an action, fails the check.
- When the page is opened from the Apps Script address itself, it calls the server directly through the same router.

---

## 27. Hosting, configuration and deployment

### 27.1 Pieces
- **The engine:** a Google Apps Script web app, running as the owner's Google account. Time zone Asia/Dhaka; V8 runtime; Drive v3 advanced service. Access: anyone, because the app has its own sign-in. Scopes: spreadsheets, Drive, documents, send mail, triggers, outside requests (Gemini, Google Books, Open Library).
- **The app:** static files on GitHub Pages (HTTPS): installable, works offline, GPS punching works. The code is public; the data never is. The same app can also be opened from the Apps Script address on a computer (no offline, no install, GPS often blocked), so staff use the GitHub Pages app.
- **The data:** spreadsheets and a private Drive folder in Biblion's Google account. Browsers never touch Sheets or Drive directly.
- **Size:** about 2 requests and about 240 KB (gzipped) to load the app.

### 27.2 Configuration
- **The app's `config.js`:** the engine's `/exec` address.
- **Script properties:** the one-time setup code; the spreadsheet ids (and the previous ones after a restore); the cache switch; the Drive folder ids; the Gemini and Google Books keys; the last run of each scheduled job; the last nightly check result.
- **Settings:** table S1, edited in Setup.

### 27.3 Building and checking
- `./install.sh` builds the app and the server bundle, runs the hygiene check (unused exports, unused or untranslated messages, colours outside the tokens, actions without handlers, repeated CSS rules) and every test.
- **Automatic checks on GitHub:** every update runs the full tests and a browser walk-through, and publishing is blocked if anything fails.
- Work goes on a branch and reaches the main branch through a pull request the owners review. `clasp` may be used to deploy to Apps Script; it is never part of the app.

### 27.4 Deploying
1. Create the Apps Script project with the engine files. Turn on the Drive v3 service.
2. Deploy as a web app (execute as the owner; access: anyone). Copy the `/exec` address.
3. Run `initialize()`: it creates the spreadsheets, the Drive folders and the real setup lists (S3).
4. Use the setup code to create the first owner.
5. Optionally, add the Gemini and Google Books keys.
6. Create the hourly trigger (`jobHourly`). Google asks once for permission to send email.
7. Put the `/exec` address in `config.js` and publish the app on GitHub Pages.
8. Run `runSelfTest()` once in the Apps Script editor.
9. Try the app on staff phones: GPS punching, offline entries and sending them later.
10. Try real document photos with Google's reader and with Gemini.

---

## 28. Starting from a date (Getting started)

- **The start date.** The app starts fresh on a date (best an 11th). Past records stay where they were kept before, read-only, as history; the last month before the start is finished there.
- **Getting started** is one guided setup for shareholders, shown on Home until done. Each step opens the screen where its figures go; steps the app can see tick themselves, the rest are ticked by hand:
  1. business details (Setup → Business), the start date, Biblion's GPS location, users and access;
  2. money account balances;
  3. each shareholder: what the business owed him and what he owed it, the shop's cash he held (his "Cash with …" opening balance), and "salary from";
  4. open shareholder loans, entered as loans on the start date, with the account balance adjusted (section 6.6);
  5. other people's dues;
  6. vendor and publisher balances, with "owed since";
  7. staff owed to the business, and what the business owed them;
  8. leave balances (adjusted with the reason "Opening balance from the earlier HR records");
  9. opening book stock (deliveries of their own kind, approved like a delivery, in parts if needed);
  10. the first café closing count, on the start date's evening;
  11. staff and salaries, book stock and café items, as needed.
- **Opening figures** are taken as at the evening before the start date.
- **Corrections.** Opening figures and the start date can be corrected until the first new month is closed (with the password), then they lock.
- **Made at the first setup** (S3): the money accounts, expense categories, shareholders and shares, business details, HR lists, leave types, shift templates, task categories and the routine tasks.

---

## 29. Not part of the app

Left out by the owners:

- **A separate "Supplies list".** Supplies are part of café orders.
- **Membership expiry reminders on Home.**
- **Demo mode and sample data** in the app (sample data exists only in the local preview on a computer).
- **Demand stars.** The forecast replaced them.
- **AI forecasting.** The forecast is statistics.
- **Email intake of documents.** Documents come in by upload, drag and drop, and Share only.
- **A browser flag that skips a duplicate check.**
- **A single "money entries" approval switch.** It is replaced by the per-kind switches, the amount limit and the categories.
- **Phone push notifications.** They would need a paid or separate service.
- **An undo button** after saving (corrections and cancellations are the way to fix an entry).
- **A bill photo required above an amount**, and **a second person recounting** a big short or over.
- **A separate test copy** of the app, a **health page**, and an **offline safety file**.
- **Per-page help guides** (tooltips are used instead).

---

## 30. Limits of the free setup

- **Google Sheets is not a database.** Changes are made one at a time (about 1–4 seconds each for a café team). Each request has a 6-minute limit, and each script property about 9 KB. An error part-way is undone by the rollback journal. If Google kills a request at its time limit, the journal cannot run, so a stray row is possible. The phone then retries the change (same op_id), and the stray row stays visible in the activity log.
- **Gmail's daily limit** (about 100 emails a day on a normal account) bounds email notifications; a refused email never stops the others or the jobs.
- **Live updates** reach other people within about 30 seconds, not instantly.
- **GPS can be faked** by a skilled person. Such punches are provisional or flagged.
- **Reading quality depends on the photo.** Handwriting and poor Bangla photos are weaker, and every result is checked by a person. Handwriting needs the free Gemini key; without it, the person types the figures.
- **Loyverse column names** come from Loyverse's documentation; a real export from Biblion should confirm them.
- **PDFs** come from Apps Script's HTML-to-PDF converter: clean and printable, but simple layouts.
- **One events space.**
- **The duplicate check** on typing looks back 7 days; the nightly check looks back 60.

---

## 31. Open questions

- **Leaving policies:** 30 days' notice, notice not served deducted, unused leave decided case by case. The owners are checking these against Biblion's appointment letters and the law. The app applies whatever is set.

---
## 32. Reference tables

### S1. Settings, with starting values
"Personal" settings have a starting value for everyone and can be set for one person (section 20.9). Settings marked † are made with their real values at the first setup.

**Business**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| shop.name † | Name | Biblion | On the letterhead |
| shop.tagline † | Description | Bookstore café and cultural space | |
| shop.address † | Address | House# 1/2, Block# A (Ja), Avenue# 5, Section# 6, Mirpur, Dhaka 1216 | |
| shop.phone † | Phone | +880 1339-697905 | |
| shop.email † | Email | biblion.bacc@gmail.com | |
| attendance.shop_open | Opens at | 11:00 | Punches outside the hours are checked |
| attendance.shop_close | Closes at | 23:00 | |
| org.open_days | Open days | every day | |
| hours.outside_hours_approval | Shifts outside opening hours | manager | manager / owner / none |
| staff.number_prefix | Staff number prefix | BIB | |
| staff.number_digits | Staff number digits | 4 | BIB0001 |
| notify.owner_email | Owner alert address (backup failures, overrides) | (blank) | |

**Accounting and approvals**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| accounting.month_start_day | The accounting month starts on day | 11 | 1–28; named by the month it starts in |
| accounting.start_date | The app's records start on | (blank) | Set in Getting started; locked after the first close |
| approve.money_limit | Amount limit per money entry (Tk) | 2000 | A manager's entry above it waits |
| approve.rule.expense / .income / .transfer / .vendor / .publisher / .daily | A manager's entries of that kind | (same as other) | same as other / final (can be flagged) / shareholder |
| approve.rule.other | Other money entries (dues, loans, salaries, owner pay) | shareholder | final / shareholder |
| approve.books_delivery | Book deliveries and direct purchases | final | final (can be flagged) / shareholder |
| approve.books_stock | Book stock changes | final | final / shareholder |
| approve.books_sales | Book sales typed by a manager | final | final / shareholder (checks each day) |
| approve.cafe_order | Café orders by a manager | final | final / shareholder |
| approve.waiting_days | Remind about entries waiting longer than (days) | 1 | |
| acc.limited_account_kinds | Accounts people without full money access may use | drawer, bKash | Unless set for the person |
| closing.day_steps | Day closing steps that must be done | daily shift, cash count, café count, deliveries, tasks | |
| closing.month_steps | Month closing steps that must be done | days closed, salaries, vendor balances, publisher balances, café stock, utilities, reports, data check | |
| notify.after_close_min | Daily warnings email, minutes after closing | 60 | |

**Pay**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| payroll.overdue_days | Salaries and profit shares due within (days after the month ends) | 7 | |
| payroll.unpaid_divisor | A day's pay for cuts | period_days | days in the period / 30 / no adjustment |
| payroll.overtime_paid | Overtime can be paid (then on per person) | false | |
| food.rates | Food allowance a day, from each date | Tk 100 from the start | Dated rates; a person's own rate overrides |
| food.unpaid_rule | Food allowance on unpaid leave and absence | every_day | every day / not unpaid leave / not unpaid leave or absent / only days punched in |
| food.week_starts | Food allowance weeks start on | Saturday | |

**Attendance and rota**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| gps.lat, gps.lng | Biblion's position | (blank) | "Use this device's current location" |
| gps.radius_m | Punch within (metres) | 50 | |
| gps.max_accuracy_m | Least precise position accepted (metres) | 100 | |
| gps.exception | Outside the area | check | check (allowed with a reason, a manager checks) / block (ask for a correction) |
| attendance.late_grace_min, attendance.early_grace_min | Grace (minutes) | 0, 0 | |
| attendance.incomplete_after_min | "No punch out" after the end (minutes) | 120 | |
| attendance.duplicate_window_sec | Repeat taps within (seconds) | 120 | |
| attendance.clock_skew_flag_min | Flag a phone clock off by (minutes) | 5 | |
| attendance.offline_max_age_days | Refuse offline punches older than (days) | 7 | |
| attendance.offline_auto_validate | Accept clean offline punches automatically | false | |
| attendance.device_enabled | The shop's punch device | false | |
| attendance.half_day_pct | Half-day below this % of required hours | (blank) | Blank: only approved half-day leave |
| hours.flex_mode | Meaning of flexibility | informational | not applied / no shortfall within ±flex / only beyond flex / start-finish window |
| hours.required_basis | Required hours from | designation | designation / shift |
| breaks.mode | Breaks | recorded | not deducted / recorded / fixed / scheduled |
| breaks.paid | Breaks are paid | true | |
| breaks.fixed_minutes, breaks.min_work_for_fixed | Fixed break, after working (minutes) | 0, 360 | |
| rota.self_select | Staff may choose shifts | true | |
| selection.advance_days | Choose shifts up to (days ahead) | 7 | |
| selection.min_rest_hours | Warn when rest is under (hours) | 8 | A warning, never a block |
| selection.reminder_time | Flag missing choices at | 23:30 | |
| exchange.min_notice_days | Day-off move notice (days) | 1 | |
| holidays.treatment | Public holidays | open_scheduled | closed / open_scheduled / normal |
| rota.self_unavailable | People may mark days they can't work | true | personal |

**Leave, reviews, leaving and letters**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| leave.probation_months | Probation (months) | 3 | Confirmed by a manager |
| leave.rate | Earned a month (days) | 1.5 | |
| leave.timing | Credited | calendar_month | calendar_month / service_month |
| leave.partial | Part months | prorate_days | by days / the full rate / none |
| leave.day_counting | Count leave in | working | working / calendar days |
| leave.allow_negative | Allow beyond the balance | false | |
| performance.criteria | Review criteria (1–5) | Punctuality, Task completion, Work quality, Responsibility, Customer interaction, Teamwork, Communication, Policy compliance | |
| performance.self_assessment | Self-assessment first | true | |
| onboarding.steps | Onboarding checklist | (seven steps) | |
| separation.notice_days | Notice (days) | 30 | Open question (31) |
| separation.notice_deduct | Deduct notice not served | true | A shareholder can waive it per person |
| separation.leave_encash | Unused leave when leaving | ask | ask / not paid / paid |
| letters.offer, .appointment, .experience, .release | Letter templates | (written templates) | Plain text with placeholders |
| letters.experience_conduct | Conduct sentence | During this time, their conduct was satisfactory. | Changeable each time |
| documents.expiry_reminder_days | Remind before a staff document expires (days) | 30 | |

**Tasks**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| tasks.days_ahead | Make repeating tasks ahead (days) | 1 | |
| tasks.remind_hours | Remind before a task is due (hours) | 24 | personal |

**Books**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| books.req_auto | Automatic requisition drafts | off | off / weekly / every two weeks / monthly |
| books.req_days | A first requisition looks back (days) | 30 | |
| books.lead_days | Publishers take to deliver (days) | 7 | |
| books.order_cover_days | Order enough for (days) | 30 | |
| books.forecast_weeks | Weeks of sales for the forecast | 12 | |
| books.rating_days | Rate demand over | 180 | 30 / 90 / 180 / 365 / 730 |
| books.low_stock | Low stock at (copies) | 1 | Per-title override |
| books.slow_days | Slow seller after (days unsold) | 90 | |
| books.sell_discount | Standard shop discount (%) | (blank) | Blank: no selling-price check |
| books.price_check_pct | Flag a price difference over (%) | 2 | |
| pos.book_categories | Loyverse categories that are books | Books, Book | |
| pos.payment_map | Loyverse payment types | Cash → cash, bKash → bkash, Card → card, Due → due | |
| pos.date_order | Dates in Loyverse files | auto | auto / mdy / dmy |

**Café**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| cafe.expiry_warn_days | Warn about items expiring within (days) | 2 | |
| cafe.min_history_days | Days of counts before suggestions | 14 | 7–60 |
| cafe.supply_cover_days | Supplies: buy for (days) | 30 | |
| cafe.service_level | Avoid running out (%) | 90 | 50–99 |
| cafe.max_delivery_share | Delivery charge at most (% of an order) | 10 | |
| forecast.events | Planned events (from, to, factor, note) | (none) | |

**Customers**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| members.min_purchase | Membership card with a purchase of (Tk) | 2000 | |
| members.discounts | Membership discounts | 5% off books, 7% off food, 10% off drinks | Given in Loyverse |
| members.valid_years | Card valid for (years) | 2 | |
| loyalty.drinks_per_free | Drinks for one free drink | 10 | |
| members.ai | Gemini may read handwritten cards | yes | |

**Documents and reading**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| intake.ai | When Gemini reads | hard | hard / always / never |
| intake.gemini_model | Gemini model | gemini-flash-latest | Falls back if retired |
| intake.web_lookup | Web look-ups | true | |
| intake.contact_email | Contact email for look-ups | (blank) | |
| files.read_text | Read text from scans | true | |
| docs.expiry_warn_days | Remind about supplier documents expiring (days) | 30 | |

**Security, backup and display**

| Key | Setting | Start | Choices / notes |
|---|---|---|---|
| auth.session_days | Stay signed in (days) | 30 | |
| auth.max_failed, auth.lock_minutes | Lock after failures, for (minutes) | 5, 15 | |
| auth.self_password | May change own password | false | personal |
| profile.self_edit | May change own phone, email, address (approved) | true | personal |
| backup.daily_hour | Daily backup hour | 2 | |
| backup.weekly_day | Weekly backup on | Friday | |
| backup.keep_daily / weekly / monthly | Backups kept | 14 / 8 / 12 | |
| audit.archive_years | Archive activity older than (years) | 2 | |
| lang | Language | en | personal |
| theme | Theme | system | personal: light / dark / system |
| accent | Colour | #0F3D34 | personal |
| home_hidden | Home sections hidden | (none) | personal |
| attendance.home_controls | Punch controls on Home | true | personal |
| notify.email_enabled, notify.email | Email notifications, address | off, (blank) | personal |
| notify.muted | Muted notification kinds | (none) | personal |

### S2. Permissions
✓ = in the role to start. The Owner role has every permission.

| Permission | What it allows | Area | Kind | Staff | Manager |
|---|---|---|---|---|---|
| staff.view | View staff records | HR | view | | ✓ |
| staff.edit | Create and edit staff records; approve detail changes | HR | manage | | ✓ |
| staff.emergency | Emergency contacts | HR | view | | ✓ |
| staff.family | Family contacts (sensitive) | HR | view | | |
| staff.identity | NID, passport, date of birth (sensitive) | HR | view | | |
| salary.view | Salaries (sensitive) | HR | view | | |
| salary.edit | Salary changes (sensitive) | HR | manage | | |
| documents.view | Staff documents | HR | view | | ✓ |
| documents.manage | Upload and issue documents | HR | manage | | ✓ |
| documents.sensitive | Sensitive documents (identity, performance, payslips) | HR | view | | |
| responsibilities.manage | Job descriptions and procedures | HR | manage | | ✓ |
| recruitment.manage | Recruitment and onboarding | HR | manage | | ✓ |
| separation.manage | Leaving and former employees | HR | manage | | ✓ |
| extras.manage | Assets, incidents, complaints, training, expense claims | HR | manage | | ✓ |
| notes.manage | Management notes (sensitive) | HR | manage | | |
| attendance.view | All attendance | HR | view | | ✓ |
| attendance.manage | Correct and validate attendance | HR | manage | | ✓ |
| schedule.view | All schedules | HR | view | | ✓ |
| schedule.manage | Roster; decide shift choices and swaps | HR | manage | | ✓ |
| holiday.approve | Decide day-off moves | HR | approve | | ✓ |
| leave.approve | Decide leave | HR | approve | | ✓ |
| leave.adjust | Adjust leave balances | HR | edit | | |
| performance.manage | Reviews | HR | manage | | ✓ |
| performance.sensitive | Sensitive performance and disciplinary records | HR | manage | | |
| payroll.view | Payroll (sensitive) | HR | view | | |
| payroll.manage | Payslips, adjustments, openings | HR | manage | | |
| announcements.manage | Announcements | HR | manage | | ✓ |
| reports.view | HR reports | HR | view | | ✓ |
| dailyops.view | Today's team | HR | view | | ✓ |
| tasks.create | Give one-off tasks | Tasks | create | | ✓ |
| tasks.manage | Repeating tasks, teams, reassign, cancel, allow without a form | Tasks | manage | | ✓ |
| tasks.view_all | Everyone's tasks | Tasks | view | | ✓ |
| tasks.verify | Check completed tasks | Tasks | approve | | ✓ |
| acc.entry | The money screen | Accounts | create | | ✓ |
| acc.expense | Pay expenses from usable accounts | Accounts | create | | ✓ |
| acc.transfer | Move money between usable accounts | Accounts | create | | ✓ |
| acc.daily | The daily shift | Accounts | create | | ✓ |
| acc.vendor.purchase | Vendor purchases | Accounts | create | | ✓ |
| acc.income | Other income | Accounts | create | | |
| acc.dues | Dues taken and collected | Accounts | create | | |
| acc.loans | Loans with shareholders | Accounts | create | | |
| acc.vendor.pay | Vendor payments and credit notes | Accounts | manage | | |
| acc.publisher.pay | Publisher payments, refunds, write-offs, bought with cash | Accounts | manage | | |
| acc.staffpay | Staff pay kinds | Accounts | manage | | |
| acc.shareholders | Shareholders: pay, shares, loans, statements | Accounts | manage | | |
| acc.view_all | All money: balances, what is owed, every entry | Accounts | view | | |
| acc.reports | Accounts reports and the Dashboard's money figures | Accounts | view | | |
| acc.approve | Approve entries made by others | Accounts | approve | | |
| acc.setup | Accounts setup lists | Accounts | manage | | |
| closing.day | Day closing (skip a step with a reason) | Closing | manage | | ✓ |
| closing.month | Close and reopen months | Closing | manage | | |
| books.view | Book list and stock (no costs) | Books | view | ✓ | ✓ |
| books.order | Take a customer's special order | Books | create | ✓ | ✓ |
| books.orders | The special orders list | Books | view | | ✓ |
| books.catalog | Add and edit titles | Books | edit | | ✓ |
| books.sell | Book sales and customer returns | Books | create | | ✓ |
| books.requisition | Requisitions | Books | create | | ✓ |
| books.receive | Deliveries | Books | create | | ✓ |
| books.approve | Approve deliveries, discrepancies and stock changes | Books | approve | | ✓ |
| books.adjust | Stock changes and stock-takes | Books | edit | | ✓ |
| books.import | Loyverse uploads | Books | create | | ✓ |
| books.reports | Books reports | Books | view | | ✓ |
| cafe.view | Café stock, expiry, forecasts | Café | view | | ✓ |
| cafe.count | Daily closing count and waste | Café | create | ✓ | ✓ |
| cafe.order | Café orders | Café | create | | ✓ |
| cafe.approve | Approve café orders | Café | approve | | ✓ |
| cafe.receive | Receive café items | Café | create | | ✓ |
| cafe.setup | Café items | Café | manage | | |
| customers.manage | Customers, cards, bookings lists | Customers | manage | | ✓ |
| events.manage | Event bookings | Customers | manage | | ✓ |
| intake.upload | Upload a document | Administration | create | | ✓ |
| settings.manage | Setup: business | Administration | manage | | |
| setup.hr | Setup: HR policies, attendance, shifts, HR lists | Administration | manage | | |
| setup.books | Setup: books | Administration | manage | | |
| setup.tasks | Setup: task categories and rules | Administration | manage | | |
| users.manage | Users, roles, passwords and permissions | Administration | manage | | |
| audit.view | Activity log | Administration | view | | |
| backup.manage | Backup, restore, reset, storage | Administration | manage | | |
| owner.override | Override decisions | Administration | approve | | |

Every person also works with their own items without a permission: their tasks, schedule and requests, leave, punches and corrections, payslips, profile and documents, and reading what is addressed to them.

### S3. Starting lists (made at the first setup)

**Money accounts:** Cash drawer, bKash, Bank, and "Cash with …" for each shareholder.

**Expense categories** (area to set; editable): Café supplies (milk, ingredients, groceries, packaging); Utilities (electricity, gas, water, internet, phone); Rent; Taxes & govt fees (VAT, income tax, holding tax); Repair & maintenance; Marketing & events; Transport & delivery; Bank & bKash charges; Miscellaneous; Customer refunds.

**Shareholders:** Mizanul Islam Nasim (Nasim) 46%, owner salary Tk 10,000; Mushfiqul Karim (Mushfiq) 44%, Tk 10,000; Shourov Kabir (Shourov) 10%, Tk 10,000.

**Business details:** name Biblion; description "Bookstore café and cultural space"; address House# 1/2, Block# A (Ja), Avenue# 5, Section# 6, Mirpur, Dhaka 1216; phone +880 1339-697905; email biblion.bacc@gmail.com.

**Departments:** Café (coffee bar, kitchen and service); Bookstore (books, shelves and sales); Management (operations and administration).

| Designation | Department | Required hours | Flexibility (h) | Flexible start | Late applies | Break (min) | Days a week |
|---|---|---|---|---|---|---|---|
| Barista | Café | 8 | 1 | no | yes | 0 | 6 |
| Manager | Management | 8 | 0 | yes | no | 0 | 6 |
| Service person | Café | 12 | 0 | no | yes | 0 | 6 |

**Job responsibilities:**
- Barista: beverage preparation to Biblion recipes and standards; coffee machine cleaning and daily maintenance; ingredient stock checks and reorder requests; food safety and hygiene; opening and closing duties for the coffee bar; customer service; reporting equipment problems promptly.
- Manager: daily operations and staff supervision; roster, attendance and leave approvals; cash, sales and stock oversight; customer issues and escalations; opening and closing control.
- Service person: table service and cleaning; washroom checks; bookshelf tidying; supporting opening and closing; customer service.

**Employment types:** Full-time, Part-time, Contract, Intern.

**Shift templates:** Morning 09:00–17:00, Day 11:00–19:00, Evening 15:00–23:00.

| Leave type | From the earned balance | Paid | Half days | Attachment required |
|---|---|---|---|---|
| Annual leave | yes | yes | yes | no |
| Casual leave | yes | yes | yes | no |
| Sick leave | yes | yes | yes | no |
| Emergency leave | yes | yes | yes | no |
| Unpaid leave | no | no | yes | no |
| Half-day leave | yes | yes | yes | no |

**Task categories:** checklists: Opening, Closing, Table cleaning, Washroom check, Fridge temperature, Sales & cash, Stock, Coffee machine, Bookshelves, Equipment, Food safety; tasks: General, Events, Meeting, Accounts, Books, Follow-up.

**Routine tasks:** café closing count (daily, staff); day closing (daily, managers); the electricity bill (monthly, with the utility bill form); print the monthly accounts (the 12th); month closing (the 12th, an owner).

| Document category | Sensitive | Staff can see | Has expiry | Needed at onboarding |
|---|---|---|---|---|
| CV | no | yes | no | yes |
| Photograph | no | yes | no | yes |
| NID (front) | yes | yes | no | yes |
| NID (back) | yes | yes | no | yes |
| Passport | yes | yes | yes | no |
| Educational certificate | no | yes | no | no |
| Training certificate | no | yes | yes | no |
| Offer letter | no | yes | no | no |
| Appointment letter | no | yes | no | no |
| Signed offer / appointment | no | yes | no | yes |
| Job description | no | yes | no | no |
| Signed responsibilities | no | yes | no | no |
| Agreement | no | yes | yes | no |
| Confidentiality agreement | no | yes | no | no |
| Performance record | yes | no | no | no |
| Warning letter | yes | yes | no | no |
| Resignation | no | yes | no | no |
| Clearance | no | yes | no | no |
| Experience certificate | no | yes | no | no |
| Release letter | no | yes | no | no |
| Final settlement | yes | yes | no | no |
| Payslip | yes | yes | no | no |
| Other | no | yes | yes | no |

**Common café items:** a checklist of 38 (19 stock, 19 supplies) with Bangla names, units, shelf life and usual cover, added only when ticked.

**Onboarding steps:** copy of NID received; appointment letter signed; sign-in made and linked to the staff record; punch PIN set; job description and procedures read; shown around the shop and the café; first week working beside a colleague.

**States:**
- Requisitions: draft, sent, part received, received, closed, cancelled.
- Café orders: draft, approved, part bought, bought, cancelled.
- Uploads: reading, needs kind, ready, confirmed, discarded, removed.
- Offline items: waiting, sending, needs input, failed, done.
- Applicants: new, screening, interview, reference check, selected, approved, onboarding, hired, rejected, withdrawn.
- Money entries: final, waiting, cancelled, replaced (shown as Checked, To check, Waiting for a shareholder, Cancelled, Replaced).

**Book stock movements:** delivery received, opening stock, count correction (more), customer return; sold, damaged, lost, returned to publisher, count correction (fewer).
