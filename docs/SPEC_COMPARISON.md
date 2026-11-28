# The specification compared with v2 (28 Nov 2026)

`BIBLION_SPECIFICATION.md` (the full specification) was compared with v2 as built. Two lists:

- **D: done differently.** v2 does it another way. For each, the owner chooses: keep v2's way, or change to the specification's.
- **M: in the specification, not in v2.** For each, the owner chooses: build it, or leave it out.

Where an earlier owner decision (`DECISIONS.md`) already settled a point, it says so. The owner's choice for every item is recorded at the end.

---

## D. Done differently

### People, roles and permissions
- **D1 Shareholders and staff.** Spec: shareholders are not staff; an owner's sign-in is linked to their shareholder record. v2: no link between sign-ins and shareholders; an owner may have a staff record (it is left out of staff pay in the month's figures).
- **D2 Permission list.** Spec: 70 permissions, each with an area and a kind. v2: its own list of 66, without areas or kinds.
- **D3 Manager permissions.** Spec: managers can't enter dues (they need full money access). v2: managers have "dues".
- **D4 Staff permissions.** Spec: staff have only the café count among shared permissions. v2: staff also have "see the book list" and "take customer orders".

### Approvals
- **D5 Approval switches.** Spec: switches for book deliveries, book stock changes, book sales and café orders ("final for a manager, who can flag it", to start); money switches (expense, income, transfer, vendor, publisher, daily) default to "same as other money entries", and other money entries (dues, loans, salaries, owner pay) need a shareholder. v2: no book switches; every money switch, "other" included, starts as "final for a manager".
- **D6 A second decision.** Spec: refused, saying who decided and when. v2: refused with "changed by someone else", without the name.

### Records, locks and months
- **D7 Deleting setup items.** Spec: shareholders can delete setup items that have no records. v2: nothing is deleted; items are made inactive.
- **D8 How a month is named.** Spec: by the month it ends in ("December 2026" = 11 Nov – 10 Dec). v2: by the month it starts in ("2026-11" = 11 Nov – 10 Dec).
- **D9 The month lock.** Spec: a closed month locks Accounts, Books, HR and Café. v2: it locks money and book entries only.

### Home, notifications and tasks
- **D10 The punch card.** Spec: for managers and staff, not owners. v2: for anyone with a staff record, owners included.
- **D11 Notifications.** Spec: one notification system: priority, area, read or unread, a bell, history for 12 months with search and filters, "mark all read", muting kinds, task reminders; email optional per person, plus a separate owner alert address. v2 (owner decision 28 Nov): messages on Home until dismissed, and the shareholders' daily email.
- **D12 Owner's own task done.** Spec: the owner who gave it is told. v2: nobody is told.
- **D13 Marking a task done.** Spec: tick "I confirm this task is done", then Mark complete. v2: a Done button (with the checklist, photos or note when the task asks).

### Money
- **D14 Accounts made at first setup.** Spec: Cash drawer, bKash, Bank, and "Cash with …" for each shareholder. v2: none; the owner adds them (rule: no dummy data).
- **D15 Expense categories made at first setup.** Spec: Café supplies; Utilities; Rent; Taxes & govt fees; Repair & maintenance; Marketing & events; Transport & delivery; Bank & bKash charges; Miscellaneous; Customer refunds. v2: none.
- **D16 Salary adjustment.** Spec: a "Salary adjustment" kind (bonus + / cut −). v2: "Bonus paid" (money out) and "Salary deduction".
- **D17 Loan interest.** Spec: worked out monthly on the average daily balance × yearly rate ÷ 12, rounded. v2: day by day on each day's balance × yearly rate ÷ 365, to the paisa.
- **D18 Food allowance rules.** Spec choices: every calendar day / not on unpaid-leave days / not on unpaid-leave days or days absent. v2 choices: every day / not on unpaid leave / only days the person punched in.
- **D19 What is owed: status.** Spec: each item Paid, Pending, Partially paid or Overdue (with days late). v2: overdue or not, with the amount.
- **D20 Book cost.** Spec: printed price less the publisher's discount; no averaging. v2: the average cost of the copies received (opening stock included), or the publisher's discount rule before any.
- **D21 Profit: written-off advances.** Spec: publisher advances written off count as book cost. v2: they raise what is owed to the publisher but aren't in the month's profit.
- **D22 Separate ledgers.** Spec: vendor and publisher entries in their own supplier ledger, and daily shifts in their own table. v2: one money table for all (the same figures).

### Daily shift, day and month closing
- **D23 Books sales on the shift.** Spec: left blank, it is taken from that day's book sale entries. v2: typed on the shift.
- **D24 Day closing steps.** Spec: which steps must be done is a setting (daily shift, cash count, café count, deliveries, tasks), and a manager may go ahead without one by giving a reason. v2: fixed steps; only the shift blocks; the rest are warnings.
- **D25 Month closing steps.** Spec: every day closed; salaries paid or noted; vendor and publisher balances reviewed; café stock valued; utility bills entered; the month-end reports; the data check clean. Owners may go ahead without a step, with a reason. v2: the month has ended and every day is closed.
- **D26 Month-end files.** Spec: monthly accounts, shareholders, salary and **payroll**. v2: monthly, shareholders and salary.
- **D27 Before closing.** Spec: profit shares shown as "provisional". v2: "Not closed yet: the figures can still change".

### Shareholders
- **D28 Shareholders made at first setup.** Spec: Mizanul Islam Nasim (Nasim) 46%, Mushfiqul Karim (Mushfiq) 44%, Shourov Kabir (Shourov) 10%, owner salary Tk 10,000 each. v2: entered by hand; nothing pre-filled.
- **D29 Owner salary.** Spec: from a "salary from" date; a part month by days. v2: a full salary for every closed month.
- **D30 Shares changing mid-month.** Spec: the month is shared by days at each split. v2: the split on the month's first day applies to the whole month.

### Books
- **D31 Stock per price.** Spec: stock is counted per title and printed price. v2: per title.
- **D32 Deliveries.** Spec: only approved deliveries add stock; a delivery is never approved automatically. v2: a delivery adds stock when saved.
- **D33 Opening book stock.** Spec: a delivery of its own kind, approved like a delivery, in parts (a shelf or a publisher at a time). v2 (owner decision 27 Nov): a stock-take sheet sent for approval, done once.
- **D34 Stock-take.** Spec: titles not counted can be treated as missing (0) or left; several people count at once; corrections approved as usual. v2: titles not counted are left as they are; applied at once.
- **D35 Stock movement kinds.** Spec: delivery received, opening stock, count correction (more / fewer), customer return, sold, damaged, lost, returned to publisher. v2: received, opening, stock-take, sold, damaged, lost, **found**, returned.
- **D36 Automatic requisitions.** Spec: off, weekly, every two weeks, monthly. v2: off, weekly, monthly.

### Café
- **D37 Café forecast.** Spec: weighted daily use, weekday pattern, out-of-stock days ignored, safety stock at a 90% service level, delivery charge kept near 10% of the order (from each vendor's last 10 deliveries), shelf-life cap; supplies from on-hand checks and bills with 15% extra until 3 periods are known; planned events scale demand; worked out nightly at 03:00, with reasons. v2: the average use over the last 28 days, with lead time, minimum order, multiples and shelf life.

### Uploads
- **D38 Gemini setting.** Spec: only for hard documents (to start) / every receipt and bill / never. v2: every receipt and bill / off (to start).

### People (HR)
- **D39 Staff number.** Spec: BIB-0001. v2: BIB0001.
- **D40 Outside the GPS area.** Spec (to start): the punch is blocked and the person asks for a correction. v2 (owner decision 4): allowed with a reason, then checked by a manager.
- **D41 The ±1 hour flexibility.** Spec: not applied; the raw difference is reported (4 choices of meaning). v2: a "flex" band in minutes (0 to start).
- **D42 Leave types made at first setup.** Spec: Annual, Casual, Sick, Emergency, Unpaid, Half-day, each can require an attachment. v2 (owner decision): Paid and Unpaid built in, others added by shareholders; no "attachment required".
- **D43 When leave is credited.** Spec (to start): at the end of each service month, from probation confirmed. v2 (owner decision): by calendar month, the first part month by days, after the probation months.
- **D44 Partial months of leave.** Spec choices: by days / a full 1.5 days / none. v2: by days / none.
- **D45 Probation.** Spec: confirmed by a manager; no leave until then. v2: ends by itself after the set months.
- **D46 Review criteria.** Spec: Punctuality, Task completion, Work quality, Responsibility, Customer interaction, Teamwork, Communication, Policy compliance. v2: Punctuality, Task completion, Work quality, Teamwork, Customer care.
- **D47 Applicant stages.** Spec: new, screening, interview, reference check, selected, approved, onboarding, hired, rejected, withdrawn. v2: new, interview, offered, hired, rejected, withdrawn.
- **D48 Handing over a leaver's tasks.** Spec: each task to a person, role or team, or held for the next person in the same position, or cancelled with a reason. v2: all to one person.
- **D49 Own profile, availability, password.** Spec: personal settings (per person). v2: one setting for everyone (self-edit, unavailable days); own password is a per-person grant.

### Reports and documents
- **D50 Reports page.** Spec: tabs for accounts, books, vendor purchases, utility bills and HR. v2: one list of reports.
- **D51 PDF and Download.** Spec: one Download button asking PDF or Excel; PDFs made on the server on the A4 letterhead; printing opens a new tab. v2: "Print or save as PDF" (the browser) and "Download Excel".
- **D52 Letterhead details.** Spec: House# 1/2, Block# A (Ja), Avenue# 5, Section# 6, Mirpur, Dhaka 1216; +880 1339-697905; biblion.bacc@gmail.com, set at first setup. v2: blank until typed in Settings → Shop.
- **D53 Wide tables.** Spec: no sideways scrolling at any width; a wide table becomes cards. v2: report tables scroll sideways on a narrow screen.

### Screens
- **D54 The menu.** Spec: Top (Home, Dashboard, Tasks, Documents, Reports); Today; Café; Books; Accounts; People; My work; and Setup as one item holding all settings, users, the activity log and backup. v2: Today, Money, Books, Café, People, Settings (with a menu item per settings page).
- **D55 The phone's bottom bar.** Spec: staff: Home, Tasks, Schedule, Count; managers and owners: Home, Dashboard, Tasks, their first daily job. v2: Home, Daily shift, Café count, Money (as allowed).
- **D56 Entry state chips.** Spec: Checked, To check, Waiting for a shareholder (with the reason), Cancelled. v2: Final, Waiting, Cancelled, Replaced.
- **D57 Theme and colour.** Spec: kept per device; the app's colour #0F3D34. v2: kept per person (follows them); #4f46e5.
- **D58 Language switch.** Spec: on the top bar. v2: in My settings.
- **D59 Rows per page.** Spec: 50 to start (at most 200 from the server). v2: 25 to start (25, 50 or 100).

### Data, server and setup
- **D60 Spreadsheets.** Spec: four (Core, Accounts, Books with café and customers, People). v2: five (core, accounts, books, café, HR).
- **D61 Big stock-takes.** Spec: one row per title, so no cell passes 50,000 characters. v2: one stock-take's counts in one cell (a risk with thousands of titles).
- **D62 Sign-in tokens.** Spec: 96 hex characters. v2: 64.
- **D63 Busy wait.** Spec: a request waits up to 30 seconds for its turn, then BUSY. v2: 20 seconds.
- **D64 Opening figures date.** Spec: as at the evening before the start date. v2: "as of the start date".
- **D65 Correcting opening figures.** Spec: until the first new month is closed. v2: opening amounts can be changed any time; only the start date is locked after a close.
- **D66 The shop's punch device.** Spec: removed ("every punch is from a person's own phone"). v2 (owner decision 3): kept, off by default.
- **D67 Daily warnings address.** Spec: one list of addresses in settings (`alerts.emails`). v2 (owner decision 28 Nov): each shareholder's own address in My settings.

---

## M. In the specification, not in v2

### People, roles and permissions
- **M1** Custom roles (level 1 or 2).
- **M2** Per-person permission grants and denies in Users (v2 has only "may change own password").
- **M3** Managers' money accounts: the accounts each person may use (set per user, else cash drawer and bKash); an owner's "Cash with …" never usable by others; switching "pay expenses" or "move money" off for one manager; only usable accounts offered.
- **M4** Staff see only their own entries, and only the last 7 days.
- **M5** Sensitive HR sections removed from replies for people without them (v2 does salary, NID and family; to add: sensitive performance, disciplinary, payroll and management notes).

### Approvals
- **M6** Flag a final entry for a shareholder, with a reason; the manager is told when it was looked at.
- **M7** Every evening, shareholders get what managers made final that day (21:00).
- **M8** Shareholders told at once when an entry waits for them (v2: on Home and in the evening email).
- **M9** Before Confirm on an upload, show which approval rule each new entry will fall under.
- **M10** Tell shareholders about entries waiting longer than a day (`approve.waiting_days`).

### Records
- **M11** Activity log archive: entries older than 2 years moved monthly into a checked file in Drive, still searchable.
- **M12** Log every opening of sensitive records and files.

### Home and Dashboard
- **M13** Home alerts: suppliers over their credit limit; documents expiring; probation dates; event bookings.
- **M14** A "Getting started" card by role (the places this person uses most), hideable per device.
- **M15** Hide Home sections (personal).
- **M16** Dashboard: what needs doing now; sales against the same day last month and the projected month; takings by books and café and by weekday; where money went, on hand, owed; staff today and tomorrow; tasks; café stock; best-selling books; nightly check card; what managers made final; every chart also as a table.
- **M17** Today's team: who is working, late, on a break, on leave or absent; today's checklists; tasks to check.

### Tasks
- **M18** "Weekdays" repeat, and custom day, week or month intervals.
- **M19** Reminders before a task's due time (personal, 24 hours) and alerts when overdue.
- **M20** Task categories (checklists: Opening, Closing, Table cleaning, Washroom check, Fridge temperature, Sales & cash, Stock, Coffee machine, Bookshelves, Equipment, Food safety; tasks: General, Events, Meeting, Accounts, Books, Follow-up).
- **M21** Task forms: stock count, utility bill, vendor delivery.
- **M22** Daily routine tasks made at first setup: café closing count (daily, staff); day closing (daily, managers); electricity bill (monthly); print the monthly accounts (12th); month closing (12th, an owner).
- **M23** Tasks rechecked every hour for leave approved later (v2 moves them when leave is approved).

### Money
- **M24** "Bought with cash" (a publisher kind).
- **M25** Pay staff page: one line per person (this month's salary and food, paid this month, owed or paid ahead), and tapping an amount owed opens the money screen filled in. The same for Vendor bills.
- **M26** Choosing an expense category by typing a new one in the form (v2: only in Setup), with "Use it" for a similar name.
- **M27** Utility bills: utility, bill period, units used (kWh, m³), amount, late fee, due date, meter reading; the Utility bills report (units, cost, cost per unit, % change).
- **M28** Recurring expenses (name, category, account, amount, day of the month).
- **M29** Expense claims by staff, paid through an expense; guard G (an amount equal to an open claim).
- **M30** Dues taken by a staff member or an owner (v2: only people in the dues list); a staff member's dues deducted from salary; an owner's from what is owed to him.
- **M31** Loan lines without a loan number listed for fixing.
- **M32** Open loans at the start date, with the account's opening balance adjusted.
- **M33** Food allowance "week starts on" setting (v2: always Saturday), and "paid up to" date.
- **M34** Owed items: loan interest owed to a shareholder and a share buyout, tracked like salaries.
- **M35** Break-even sales by area.
- **M36** Duplicate guards E and E2 (Loyverse upload against typed sales) and H (a paper uploaded but not entered).
- **M37** Matching a bank, bKash or Nagad statement (CSV, Excel, photos or PDF; three lists; add the missing lines).
- **M38** Nightly check (01:00–06:00): duplicates over 60 days, balances below zero, typed sales on Loyverse days, the data check, entries waiting more than a day; shareholders told only when something is found.
- **M39** Data check (broken links, mismatched figures, missing pieces), also a month closing step.

### Daily shift and closing
- **M40** Fill the daily shift from Loyverse CSV reports (shifts, sales summary, payment types, categories) (v2: the printed slip only).

### Shareholders
- **M41** Change of shares: joining, leaving or transfer; proposed by one shareholder, confirmed by a different one (never the leaver); the exit month by days; the leaver's settlement; buyout (at once, in parts, or privately); complete when his "Cash with …" is at 0, then his sign-in is disabled; settlement statement and share transfer record as PDF.

### Vendors and publishers
- **M42** Vendor details: contact, email, what they supply, expense category, pay within days or every N months, credit limit, usual discount, terms note, opening amount "since when".
- **M43** Delivery services (for example Pathao): the delivery charge on the vendor's bill, or a delivery service's own linked bill (paid now or owed), or none; cancelling or correcting the purchase does the same to it; the usual arrangement remembered.
- **M44** Item lines on a vendor purchase (café item or other, quantity, unit, rate, expiry) making café stock batches; a purchase opened from an approved café order with the items filled.
- **M45** Vendor payments set against the bill they name, else the oldest bill.
- **M46** Vendor and supplier documents with expiry dates and reminders (30 days).
- **M47** Vendor report with quantities, average rate, first and last rate and % change, delivery charges, full cost, and a delivery services table.
- **M48** Vendor tracker (due and overdue for vendors). (Owner decision 28 Nov: publishers only. Listed to confirm.)
- **M49** Publisher details: contact, email (for requisitions), terms, credit limit, opening amount "since when".
- **M50** Publisher terms: fixed payment months (for example Dyu: March, June, September, December, the 5th–10th), every N days, credit limit with a Home warning; saving terms needs the Accounts setup permission.
- **M51** Late sales: a sale dated in a period already settled by a payment or covered by a sent requisition is flagged.

### Books
- **M52** Per title: its own low-stock level, Loyverse name, SKU and price, notes, "from the web" marks.
- **M53** Low stock (1 copy or fewer) and slow sellers (unsold 90 days).
- **M54** Standard shop discount (`books.sell_discount`) for the selling price.
- **M55** A customer discount on a sale line.
- **M56** A sale with no stock flagged, offering "add as opening stock".
- **M57** Other names learnt when someone corrects a match (on an upload, a list or a customer bill).
- **M58** Web look-ups (Open Library, Google Books) to fill an empty author or ISBN, marked "from the web".
- **M59** Loyverse "Receipts by item" upload for book sales (columns recognised, date order, book categories, payment map); it replaces typed sales; typing after an upload needs a reason and is flagged.
- **M60** Customer returns (stock back, money handled).
- **M61** Our own bill to a customer, uploaded as book sales with the discount.
- **M62** Loyverse item list import, listing titles whose Loyverse price differs by more than 2%.
- **M63** Requisitions: quantities suggested from the forecast with a reason; titles to reorder within a week added; sent by email with PDF and Excel kept in Documents; the printed requisition (SL, title, author, quantity, ISBN).
- **M64** Our own order list uploaded as a sent requisition (title-only lines), matched on delivery.
- **M65** Requisition reports: outstanding; ordered against received.
- **M66** A duplicate challan number blocked.
- **M67** Delivery checks decided by an authorised person: title or ISBN mismatch, price differences.
- **M68** A payment on delivery the person may not enter goes to the to-do list of those who can.
- **M69** The publisher's price found from the challan in order (price per copy, % on the line, % for the challan, "Less 350", totals, else the usual discount), each title showing "x% off", "Discount on all titles", and a difference over 2% to accept.
- **M70** Book forecast (Croston weekly method, 12 weeks, lead 7 days, cover 30 days, at least 4 weeks of sales) and selling strength over 30–730 days.
- **M71** Books reports: current stock by publisher and by title; discrepancies; stock movements; low and out of stock.

### Café
- **M72** Item details: category, usual stock level, selling price, Loyverse name, "counted daily or not", notes, sort order.
- **M73** Type-to-find items with "+ Add … as a new item" in place, a similar name offered first; other names learnt from corrections.
- **M74** "Bought, but not in the item list": names typed on bills, one tap to make or link an item, linking past bills.
- **M75** Loyverse "receipts by item" compared with café use; gaps flagged.
- **M76** A changed order quantity needs a reason.
- **M77** Send a café order as PDF, Excel or WhatsApp text.
- **M78** Items typed by name on an order become supply items when it is approved.
- **M79** A shopping list photo becomes a café order for any shop.
- **M80** Café stock page with tabs (items, counts, expiry & waste, orders) and a café overview.

### Customers, cards and events
- **M81** Customers (name, mobile, email, note; picked on orders, bookings and bills; a page per customer; search; managers and shareholders only).
- **M82** Membership cards (Tk 2,000 purchase; 5% books, 7% food, 10% drinks; valid 2 years; renewals; paper numbers kept; history; cards ending soon; no Home reminders).
- **M83** Loyalty cards (a free drink after 10; one per full card uploaded or "Record a free drink"; a second on the same day asked about).
- **M84** Reading cards and the old ledger (Gemini for handwriting if allowed); Customers & cards list with PDF and Excel.
- **M85** Events and bookings (deposit and fee as other income, refund as an expense; clashes flagged; upcoming on everyone's Home).

### Uploads and documents
- **M86** Upload kinds not yet in v2: supplier statement of account; medical certificate or leave paper; resignation letter; CV; NID, passport or certificate; other staff document; other document; account statement; our order list; our bill to a customer; terms or agreement; quotation; shopping list; membership card; full loyalty card; members ledger; Loyverse files.
- **M87** Several photos of one paper joined into one PDF; CSV accepted.
- **M88** Gemini model setting, web look-ups setting, contact email for look-ups.
- **M89** Uploads never confirmed tidied up on a schedule.
- **M90** Document library: one index of every file (type, date, number, party, amount, record, uploader, text read from the scan hourly); search; thumbnails; a viewer that zooms, rotates and pages; download, print, email; several files as one PDF; an attach box in every form (photo, file, or from the library); files kept "not linked yet"; removing needs a reason (Drive bin, 30 days); Drive folders by module, record kind, year and month with descriptive file names; expiry dates with reminders.

### People (HR)
- **M91** Staff profile: father's and mother's names, gender, blood group, marital status, permanent address, another phone, photo, skills, languages, computer skills, supervisor; education, employment history, training, references.
- **M92** Departments (Café, Bookstore, Management), designations (Barista, Manager, Service person, with hours, flexibility, flexible start, late applies, break), employment types (Full-time, Part-time, Contract, Intern), with the job responsibilities listed for each designation.
- **M93** Staff documents with categories (23, with sensitivity, staff-visible, expiry, needed at onboarding), versions and expiry; print the staff file (CV page plus documents, one PDF).
- **M94** Shift templates made at first setup: Morning 09:00–17:00, Day 11:00–19:00, Evening 15:00–23:00.
- **M95** Open days (`org.open_days`) and shifts outside opening hours needing a manager's approval.
- **M96** Choosing tomorrow's shift after punching out, with a reminder at 23:30 for missing choices.
- **M97** Break rules: break deduction (none, recorded, fixed, scheduled), a fixed break after 6 hours; required hours from the designation or the shift.
- **M98** Attendance statuses half-day and correction pending; a half-day threshold.
- **M99** Leave applications with an attachment where the type requires one; a leave calendar; overriding a decision.
- **M100** Payroll recalculated on a schedule and on request; payroll adjustments with approval; payslips as Excel; salary changes approved, with payment method and account.
- **M101** Overtime as a global switch (`payroll.overtime_paid`), and "no adjustment" as an unpaid-leave choice.
- **M102** Reviews: acknowledged by the person; improvement plans; recognitions; disciplinary records (sensitive); figures from attendance and tasks.
- **M103** Recruitment: vacancies, interviews (with scores), reference checks; the CV kept with a standard form; onboarding checklist with required documents; tasks held for the position handed to the new person.
- **M104** Assets; incidents and complaints; training sessions; management notes (sensitive).
- **M105** People overview; Former employees page.
- **M106** HR reports: daily attendance; hours, deficits and overtime; leave balances and transactions; weekly holidays and exchanges; schedules; tasks; performance; payroll; staff list; employment (joins, leavers, headcount).
- **M107** Leaving: a shareholder can waive the notice deduction for one person, with a reason; settlement adjustments with a reason; clearance (equipment, money, documents, keys, access); clearance certificate; settlement statement as PDF and Excel; the release letter only once clearance is complete; exit interview; future shifts cancelled; people who left in the last four months still listed.

### Reports, export and offline
- **M108** Reports: vendor tracker (see M48), utility bills, vendor purchases, books (M71), HR (M106), profit by area with break-even, Match a statement.
- **M109** Excel for requisitions, payslips and settlement statements.
- **M110** Waiting entries marked "*" in PDFs; sensitive exports marked.
- **M111** "Allow pop-ups to print" when printing is blocked.
- **M112** Email requisitions, library files and documents.
- **M113** WhatsApp text for café orders.
- **M114** CSV safety (cells starting with = + - @), once there are CSV exports.
- **M115** "Saved on this phone": edit an item before sending.

### Settings and setup
- **M116** One settings system: per-person overrides of settings, shown in Setup with "reset to default".
- **M117** Setup parts granted separately: business, HR policies, books, tasks, accounts setup, users, backup.
- **M118** Personal settings: notifications and reminders, Home sections, "Getting started", work preferences; punch controls on Home on or off.
- **M119** Owner alert address for backup failures and overrides.

### Backups and storage
- **M120** Backups: daily (02:00, keep 14), weekly (Friday 03:00, keep 8), monthly (11th 04:00, keep 12, with a restore test), before changes (10), manual (10); data-only file with a checksum; every document listed; failures alert the owners.
- **M121** Restore (owners; reason; type RESTORE; backup first; checksum; rebuilt and compared before switching; everyone signs in again; also from a downloaded file).
- **M122** Reset (choose parts; type RESET; backup first).
- **M123** Storage status, and monthly compaction of the spreadsheets.

### Data and server
- **M124** Tables cached for up to 10 minutes between requests (switchable).
- **M125** A rollback journal, so a failure part-way leaves no half-made records.
- **M126** Text starting with "=" stored so it can never become a formula. (To check: v2 writes plain text, which may already cover it.)
- **M127** The page opened from the Apps Script address calls the server directly (a convenience for managers).
- **M128** `initialize()` making the spreadsheets, folders and real setup lists, and `runSelfTest()` to run once.
- **M129** Opening figures: shareholders' "salary from", vendors' and publishers' "owed since", leave adjustments with the reason "Opening balance from the old HR app"; first-day setup also sets the GPS location and users.

### Open decisions in the specification
- **M130** Bangla digits: shown in Bangla when the app is in Bangla (v2 does), or Latin digits.
- **M131** Leaving policies: to be checked against Biblion's appointment letters and the law.

---

## The owner's choices

Asked one by one on 28 Nov 2026.

### Done differently
- D1 Spec: link owners' sign-ins to shareholder records; owners have no staff record and no punch card.
- D2 Spec's areas and kinds shown in Users; add the spec's permissions as their features are built; keep v2 names that mean the same.
- D3 Spec: a manager's separate due entries are requests a shareholder approves; dues inside the daily shift stay allowed.
- D4 Keep v2: staff see the book list (no costs) and take customer orders.
- D5 Spec: book switches (deliveries, stock changes, sales, café orders; final for a manager who can flag it); money kinds start "same as other money entries", which starts "a shareholder confirms".
- D6 Spec: a second decision says who decided and when.
- D7 Spec: a shareholder can delete a setup item with no records (logged); otherwise inactive.
- D8 Keep v2: a month is named by the month it starts in.
- D9 Spec: a closed month locks everything (attendance corrections, leave, payroll, café counts and orders, books, money, tasks).
- D10 Spec: no punch card for owners.
- D11 Spec: one notification system (bell, priority, area, read/unread, 12-month history with search and filters, mark all read, mute kinds, task reminders, email optional per person, owner alert address); Home messages and the daily email become part of it.
- D12 Spec: the owner who gave a task is told when an owner's own task is done.
- D13 Keep v2: one Done button.
- D14 Spec: first setup makes Cash drawer, bKash, Bank and "Cash with …" per shareholder.
- D15 Spec: first setup makes the 10 expense categories (area to set, editable).
- D16 Both: Salary adjustment (+/−, paid with the salary) and Bonus paid (handed over at once).
- D17 Keep v2: loan interest day by day ÷ 365.
- D18 All four food allowance choices: every day; not on unpaid leave; not on unpaid leave or absent days; only days punched in.
- D19 Spec: Paid / Pending / Partially paid / Overdue N days for each item owed.
- D20 Keep v2: book cost is the average cost of copies received.
- D21 Spec: publisher advances written off count as book cost in the month's profit.
- D22 Keep v2: one money table.
- D23 Spec: books sales on the shift filled from that day's book sale entries; can be typed if not entered yet.
- D24 Spec: required day-closing steps are a setting (daily shift, cash count, café count, deliveries, tasks); a manager may skip one with a reason, kept and logged.
- D25 Spec: month closing steps as a setting (days closed; salaries paid or noted; vendor and publisher balances reviewed; café stock valued; utility bills entered; month-end reports; data check clean); owners may skip with a reason.
- D26 Spec: add the payroll report to the month-end files.
- D27 Spec: "Provisional" until the month is closed.
- D28 Spec: first setup makes Nasim 46%, Mushfiq 44%, Shourov 10%, owner salary Tk 10,000 each (editable).
- D29 Spec: owner salary from a "salary from" date; part months by days (also for leaving).
- D30 Spec: a month with a share change is shared by days.
- D31 Spec: book stock per title and printed price.
- D32 Spec: a delivery adds stock only once approved (the D5 switch decides when a manager's is final).
- D33 Spec: opening book stock as deliveries of their own kind, in parts, each approved like a delivery.
- D34 Spec: stock-take uncounted titles missing (0) or left, chosen at finish; several counters; corrections follow approvals.
- D35 Spec's stock movement kinds (found → count correction (more); add count correction (fewer), customer return).
- D36 Add "every two weeks" to automatic requisitions.
- D37 Spec's café forecast (weighted, weekdays, stock-outs ignored, 90% service level, delivery share 10%, shelf cap, supplies from checks and bills, events, nightly 03:00, reasons).
- D38 Spec's Gemini choices (hard only / every receipt and bill / never), starting "hard only".
- D39 Keep v2: BIB0001.
- D40 Keep v2: outside the GPS area allowed with a reason, checked by a manager (block stays a choice).
- D41 Spec: 4 meanings of flexibility (per designation), starting "not applied".
- D42 Spec: six leave types at first setup (Annual, Casual, Sick, Emergency, Unpaid, Half-day), with "attachment required"; more can be added.
- D43 Keep v2: leave credited by calendar month (service month stays a choice).
- D44 Add "the full 1.5 days" for partial months (by days stays the start).
- D45 Spec: a manager confirms probation; earned leave counts from confirmation; Home reminds of probation dates.
- D46 Spec's eight review criteria.
- D47 Spec's ten applicant stages.
- D48 Spec: a leaver's tasks handed over one by one (person, role, team, held for the next in the position, or cancelled with a reason); no archiving until all are placed.
- D49 Spec: profile editing, unavailable days and own password per person, with a shop-wide starting value.
- D50 Spec: Reports page in tabs.
- D51 Spec: one Download button (PDF or Excel), server-made A4 PDFs, Print opens a new tab.
- D52 Spec: letterhead address, phone and email set at first setup (editable).
- D53 Spec: wide report tables become cards on narrow screens.
- D54 Spec's menu by the working day, improved: only sections a person uses (staff see My work first); a "Go to…" box in English or Bangla; Today in the order of the day; Setup one item opening a grouped, searchable settings page.
- D55 Spec: bottom bar by role (staff: Home, Tasks, Schedule, Count; managers/owners: Home, Dashboard, Tasks, first daily job).
- D56 Spec's words (Checked / To check / Waiting for a shareholder with why / Cancelled), keeping Replaced.
- D57 Per person, Biblion green #0F3D34 by default.
- D58 Spec: language switch on the top bar (also in My settings).
- D59 25 rows on phones, 50 on computers; 25/50/100 remembered per device.
- D60 Keep v2: five spreadsheets.
- D61 Spec: stock-take counts one row per title and price.
- D62–63 Spec: 96-character sign-in tokens; 30-second wait before BUSY.
- D64 Spec: opening figures as at the evening before the start date.
- D65 Spec: opening figures lock once the first new month is closed.
- D66 Keep v2: the shop's punch device kept, off by default.
- D67 Keep v2: each person's own email address (part of D11 notification settings).

### Not in v2
- M1 Build: custom roles at level 1 or 2.
- M2 Build: per-person grants and denies (owners never lose any).
- M3 Build: each person's usable accounts (drawer + bKash to start); "Cash with …" never others'; owners can switch pay expenses / move money off per manager; only usable accounts offered, server refuses others.
- M4 Build: staff see only their own entries from the last 7 days.
- M5 Build: hide sensitive performance, disciplinary, payroll and management notes from people without the permission.
- M6 Build: "Flag for a shareholder" on any final entry by a manager, with a reason; shown in Waiting for you; the manager told when looked at.
- M7 Build: what managers made final each day, in the evening email and on the Dashboard.
- M8 Build: shareholders notified at once when an entry waits for them.
- M9 Build: upload check screen shows each entry's approval rule before Confirm.
- M10 Build: remind shareholders of entries waiting more than 1 day (setting).
- M11 Build: activity log archive after 2 years, monthly, searchable.
- M12 Build: log openings of sensitive records and files.
- M13 Build all four Home alerts: suppliers over credit limit, documents expiring, probation dates, event bookings.
- M14 Build: Getting-started card on Home by role, hideable per device.
- M15 Build: hide Home sections (My settings).
- M16 Build the Dashboard, improved (see M16 improvements).
- M16 improvements: tap any figure to open what's behind it; cash ahead (on hand vs due in 14 days); same weekday last week; urgent first with who it waits on.
- M17 Build: Today's team page.
- M18 Build: "weekdays" and every N weeks repeats.
- M19 Build: task reminders (personal hours, 24) and overdue alerts to doer and giver.
- M20 Build: task categories at first setup (editable).
- M21 Build: utility bill and vendor delivery forms inside tasks.
- M22 Build: routine tasks at first setup (café count daily staff; day closing daily managers; electricity bill monthly; print monthly accounts 12th; month closing 12th owner).
- M23 Build: hourly recheck of tasks for day-off and holiday changes.
- M24 Build: "Bought with cash" publisher kind.
- M25 Build: Pay staff and Vendor bills pages with tap-to-pay filled in.
- M26 Build: new category typed in the expense form (setup permission; others ask), "Use it" for similar names.
- M27 Build: utility bills (details, read from uploads) and the Utility bills report.
- M28 Build: recurring expenses in Setup, filled in on the day as a task/reminder, saved by a person.
- M29 Build: staff expense claims (receipt, approval, paid through an expense; guard G).
- M30 Build: dues taken by staff (recovered from salary, fully or partly) and owners (set against what is owed to them).
- M31 Build: loan lines without a loan listed for fixing.
- M32 Build: open loans at the start date in Getting started, account opening adjusted.
- M33 Build: food week start setting; "paid up to" date; oldest week first; paid ahead covers next days.
- M34 Build: loan interest owed and share buyouts tracked like salaries (four statuses).
- M35 Build: break-even sales by area in the monthly report (for break-even only, shared costs shared by sales; profit by area still not split).
- M36 Build: guards E, E2 (Loyverse) and H (uploaded but not entered).
- M37 Build: Match a statement (bank, bKash, Nagad; CSV/Excel/photos/PDF; three lists; add missing lines).
- M38 Build: nightly check 01:00–06:00, told only when found, Dashboard card with Check now.
- M39 Build: Data check (also a month-closing step).
- M40 Build: daily shift filled from Loyverse CSV reports as well as the slip.
- M41 Build: change of shares (propose, confirm by another, never the leaver; exit month by days; settlement; buyout at once/parts/privately; complete at Cash-with 0, sign-in disabled; settlement statement and share transfer record PDFs).
- M42 Build vendor details: contact, email, what they supply; expense category; pay within / every N months, credit limit, usual discount, terms note; opening owed since; plus ADDRESS (owner's addition).
- M43 Build: delivery services and linked delivery bills.
- M44 Build: item lines on vendor purchases making café batches; purchase opened from an approved café order.
- M45 Build: vendor payments and credit notes against the named bill, else oldest first; bills show paid / part paid.
- M46 Build: supplier documents with expiry reminders (30 days).
- M47 Build: vendor purchases report (quantities, rates, % change, delivery charges, full cost, delivery services table).
- M48 Build: vendor tracker and Home overdue for vendors too (replaces the 28 Nov "publishers only").
- M49 Build publisher details: contact and email; terms and credit limit; opening owed since; address and phone.
- M50 Build: fixed payment months with a day range, every N days, read from terms letter/challan; terms need Accounts setup.
- M51 Build: late sales flagged.
- M52 Build per title: own low-stock level; Loyverse name, SKU and price; notes; "from the web" marks.
- M53 Build: low stock (≤1, per-title override) and slow sellers (90 days).
- M54 Build: standard shop discount setting.
- M55 Build: customer discount on a sale line.
- M56 Build: sale with no stock flagged, offering "add as opening stock".
- M57 Build: other names learnt from corrections (books and café items).
- M58 Build: web look-ups (Open Library, Google Books) for empty author/ISBN, marked, setting to turn off.
- M59 Build: Loyverse "Receipts by item" upload for book sales, replacing typed sales after confirm; typed after upload needs a reason, flagged.
- M60 Build: customer returns (stock back, refund as Customer refunds expense or against a new sale).
- M61 Build: our own bill to a customer as book sales with the discount, warning about Loyverse doubling.
- M62 Build: Loyverse item list import with the >2% price check.
- M63 Build: suggested quantities with reasons; send by email with PDF and Excel kept; printed requisition (SL, title, author, quantity, ISBN).
- M64 Build: our own order list uploaded as a sent requisition, matched on delivery.
- M65 Build: outstanding requisitions and ordered-against-received reports.
- M66 Build: duplicate challan number blocked.
- M67 Build: delivery checks (title/ISBN mismatch, price differences) decided before approval.
- M68 Build: payment on delivery the person can't enter goes to those who can, notified.
- M69 Build: the full six-step publisher price rule with explanations, "Discount on all titles", >2% difference accepted.
- M70 Build: book forecast (12 weeks, lead 7, cover 30, 4 weeks minimum) and selling strength over 30–730 days.
- M71 Build books reports: current stock (with value), discrepancies, stock movements, low and out of stock.
- M72 Build café item details: category and usual stock level; selling price and Loyverse name; counted daily or not; notes and sort order.
- M73 Build: one café item picker (English, Bangla, other names, "+ Add as a new item", similar names first).
- M74 Build: "Bought, but not in the item list".
- M75 Build: Loyverse receipts-by-item compared with café use, gaps flagged.
- M76 Build: changed order quantity needs a reason.
- M77 Build: send café orders as PDF, Excel or WhatsApp text.
- M78 Build: typed names on an order become supply items on approval.
- M79 Build: shopping list photo becomes a café order for any shop.
- M80 Build: Café stock page with tabs and an overview.
- M81 Build: customers (managers and shareholders only).
- M82 Build: membership cards as the spec (no Home reminders).
- M83 Build: loyalty cards as the spec.
- M84 Build: reading cards and the old ledger (Gemini for handwriting allowed to start); Customers & cards list with PDF/Excel kept sensitive.
- M85 Build: events and bookings as the spec.
- M86 Build all new upload kinds (money, staff, books/café, customer papers), and accept ANY other document (kept in the library) — owner added "Anything".
- M87 Build: several photos joined into one PDF; CSV accepted.
- M88 Build: Gemini model (with fallback), web look-ups on/off, contact email.
- M89 Build: unconfirmed uploads tidied after 30 days (set aside, recoverable).
- M90 Build: the document library as the spec.
- M91 Build staff profile: personal details; skills; supervisor; background (education, employment, training, references).
- M92 Build: departments, designations (with responsibilities), employment types at first setup; replace free-text position.
- M93 Build: staff documents with 23 categories, versions, expiry reminders, print staff file.
- M94 Build: shift templates Morning, Day, Evening at first setup.
- M95 Build: open days; shifts outside opening hours approved (manager to start).
- M96 Build: choose tomorrow's shift after punching out; 23:30 missing-choice flag.
- M97 Build: break and hours settings, starting as today (recorded, paid).
- M98 Build: half-day and correction-pending statuses; optional half-day threshold (blank).
- M99 Build: leave attachment where required; leave calendar; override a decision with a reason; plus an OVERALL LEAVE RECORD per staff member (owner's addition).
- M100 Build: payroll recalculated nightly and on request; payroll adjustments approved by a shareholder; payslips as Excel; salary changes approved and each person's payment method and account.
- M101 Build: overtime master switch (off to start) and "no adjustment" unpaid-leave choice.
- M102 Build: reviews acknowledged; improvement plans and recognitions; disciplinary records (sensitive); figures from attendance and tasks; plus AVERAGE BREAK taken (today, or per day) (owner's addition).
- M103 Build: vacancies; interviews and reference checks; CV + standard form; onboarding with documents and held tasks; plus READ CVs AUTOMATICALLY (owner's addition; the spec had ruled it out) — how: see follow-up.
- M103 CV reading: ask each time (a tick on each upload decides whether Gemini may read it; otherwise Google's free reading only); fills the standard form as suggestions.
- M104 Build: assets; incidents and complaints; training sessions; management notes (sensitive).
- M105 Build: People overview and Former employees.
- M106 Build all HR reports: attendance and hours; leave and holidays; tasks, performance, payroll; staff and employment.
- M107 Build: waive notice / adjustments with reasons; clearance + certificate, release after clearance; settlement statement PDF and Excel; exit interview; future shifts cancelled; leavers of last 4 months listed.
- M108–109 Build: utility bills, vendor purchases, books, HR reports, profit by area with break-even, Match a statement in Reports; Excel for requisitions, payslips, settlement statements.
- M110–113 Build: waiting entries marked "*" and sensitive marker; "Allow pop-ups to print"; email documents; WhatsApp café orders.
- M114 Build: CSV safety for any CSV export.
- M115 Build: edit an entry in "Saved on this phone" before sending.
- M116 Build: one settings system with per-person overrides and "reset to default".
- M117 Build: setup parts as separate permissions.
- M118 Build: personal settings (notifications and reminders, Home sections, Getting started card, work preferences, punch controls on Home).
- M119 Build: owner alert address.
- M120 Build: backups as the spec.
- M121 Build: restore, behind the owner's password (see password list).
- M122 Build: reset (start fresh / clear parts), behind the owner's password.
- M123 Build: storage status and monthly compaction.
- M124–125 Build: 10-minute table cache (switchable) and rollback journal.
- M126 Test that "=" text never becomes a formula; fix if it does.
- M127 Both: GitHub Pages for everyone, plus the Apps Script address as a second way in for computers (same sign-in and server checks).
- M128 Build: initialize() with the real setup lists, and runSelfTest().
- M129 Build: opening-figure extras in Getting started (salary from; owed since; leave openings with the reason; GPS location and users).
- M130 Bangla digits in Bangla (as now).
- M131 Leaving policies: the owner will check against the appointment letters and the law; kept as settings until then.

### Added by the owner while answering
- Optional extras: vacancies, exit interviews, reference checks, interview scores, training and asset records are optional and never block; only what the owner marks required blocks (closing steps, leave attachments by type, onboarding documents marked needed).
- Password again for risky actions (owner's addition): restore, reset, start fresh; download a backup; users and permissions (making an owner, roles, permissions, resetting a password, disabling an owner); money-critical steps (reopening a closed month, confirming a change of shares, changing the start date or opening figures, turning off backups).
