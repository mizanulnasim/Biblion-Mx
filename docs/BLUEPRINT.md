# Biblion Management v2 — Rewrite Blueprint

Written 24 Nov 2026 from the v1 code at commit `3cacbf7`. v1 has 59 backend modules (Google Apps Script, about 13,600 lines) and 15 frontend page modules plus 12 shared scripts (plain JavaScript, about 7,300 long lines). The data lives in 4 Google Sheets and Google Drive. v2 replaces every file. This document says **what v2 must do and keep**. It doesn't say how.

How to read it:
- **MUST** is a requirement.
- **v1 friction** is something v2 has to fix by design.
- **Keep** means v1 got it right, and the idea should carry over.
- The appendices at the end are generated from the v1 code: every table, setting, API action and permission. Use them for data migration.

Hard constraints carried over from the owner:
- Everything runs on free services: Google Apps Script, Sheets and Drive, GitHub Pages, and an optional free Gemini key.
- English and Bangla everywhere.
- Permissions are enforced on the server, not only by hiding buttons.
- No dummy data in the real database.
- Customer data is for managers and shareholders only.
- Tests are never reported as passed unless they were run.
- No existing requirement is changed without the owner's approval.

---

## 1. Core Workflows & Operational Guardrails

### 1.1 Roles and the approval model (applies to every flow)
- Roles have levels:
  - Shareholder / owner: level 3
  - Manager: level 2
  - Staff: level 1
- On top of the role, each person can be given extra permissions or have some taken away. The full list is in A4.
- Nobody approves their own entry.
- A shareholder's own entries are final.
- A manager's own requests (leave, corrections, shift swaps, expense claims) always go to a shareholder.
- Approvals for books, café and stock are set per kind in Setup → Approvals. Each kind is either "final for a manager (can be flagged)" or "a shareholder confirms".
- **Money approvals** (decided 21 Nov 2026):
  - Each money entry is checked against an amount limit of **Tk 2,000**, which is a setting. A manager's entry above it waits for a shareholder.
  - Expense categories can be ticked "always needs a shareholder".
  - There is a separate switch per kind: expense, other income, transfer, vendor, publisher, daily shift, and other money entries.
  - A daily shift is final for a manager only if the cash drawer balances against the app's own figure. Any short or over, however small, waits for a shareholder.
  - Staff entries wait for a manager or a shareholder. Over the limit or in a ticked category, they need a shareholder.
  - Anything saved past a duplicate warning waits for a shareholder, together with the reason given.
  - A kind outside the person's permissions can be sent as a **request**. It is saved and counted now, marked "waiting", and only a shareholder approves it. Staff pay and owner pay can't be requested.
- Shareholders see each waiting entry on Home under "Waiting for you", with the reason it waits. They are notified at once.
- **v1 friction:** the approval decision is spread over `Review.isFinal`, `Perm.approveCheck`, `MoneyRules.decide` and checks inside each module.
  - **MUST:** v2 has one policy function, `decide(actor, entry) → {final, needsShareholder, reasons[]}`, used by every write and every approval screen.

### 1.2 Corrections, cancellation and audit (keep exactly)
- Money and stock records are **append-only**:
  - A correction creates a new record with `replaces = old id` and cancels the old one with a reason.
  - A cancellation needs a reason.
  - Nothing is deleted.
- Closed months are locked. Re-opening one is a shareholder action, done with a reason.
- Every write is recorded in the activity log with: who, when, action, table, record, before and after, reason, and request id.
  - Log entries older than 2 years are archived to Drive every month and can still be searched.
- **v1 friction:** a person who sent a request can't correct it, because they lack the permission for that kind.
  - **MUST:** the person who entered an entry may correct or cancel it while it is still waiting.

### 1.3 Standardised document intake (Upload a document)
How a document gets in:
- The upload button at the top of every screen.
- The Home page.
- **Android Share** from another app. This uses the web-app share target: files are kept in the service-worker cache, then picked up by `#/upload?shared=1`.
- Accepted files are images, PDF and CSV. Photos are made smaller before upload. PDFs can be up to 10 MB, and several photos can be joined into one PDF.

The pipeline, as states:
1. `reading`
2. `needs_kind` (the app asks what the document is, before anything goes to Gemini)
3. `ready`
4. `confirmed`, `discarded` or `removed`

How reading works:
- Text is read by Google Drive's free text reading.
- The free Gemini key is optional. It is used only for receipts and bills (and for handwriting on cards if the setting allows it), never for staff papers.
- The kind is worked out from the text and from what is currently open in the app: requisitions, café orders, unpaid bills, leave requests, and entries already saved.

Kinds (24): `book_delivery`, `vendor_bill`, `utility_bill`, `expense`, `payment_receipt`, `courier_slip`, `bank_slip`, `statement`, `loyverse`, `staff_leave`, `staff_resignation`, `staff_cv`, `staff_identity`, `staff_other`, `other`, `account_statement`, `requisition_list`, `customer_sale`, `agreement`, `quotation`, `shopping_list`, `membership_card`, `loyalty_card`, `customer_list`.

The check screen:
- The scan is shown beside the prepared entries.
- A list shows what the app was unsure of.
- **One Confirm** creates every entry under the normal approval rules and files the document on each record.
- A final list shows what was done and what is still to do.

Rules learned from the owner's 18 real documents (they must keep working):
- Invoice rows that wrap onto two lines are joined.
- When there is a printed total, the discount is taken from it.
- ISBN digits are not prices.
- Letterhead lines are not items.
- A courier slip marked "To-Pay" means paid on arrival. A bill marked "COD" or "Received" is paid now.
- "pay every 2 months" is a terms line, not an amount paid.
- Bangla vowel marks count as letters.
- "tk" is matched only as a whole word.

Duplicate handling for uploads:
- The same file uploaded twice is refused.
- The same bKash TrxID is refused.
- The same challan or bill number, or about the same amount within 10 days, is offered for attaching instead.
- Confirming an upload past a "maybe duplicate" warning makes its entries wait for a shareholder.

**v1 friction:**
- The intake has its own duplicate rules, separate from the ones for typed entries.
  - **MUST:** one duplicate service, used both by intake and by typed entries.
- The typed-entry check in v1 ignores the `removed` status (a small v1 bug).
- Staff papers are private: no text is kept.

### 1.4 Money in & out — the one money screen
- "What is this?" picks the kind. The form then changes to fit. The kinds are:
  - **Money:** Expense, Other income, Due taken, Due collected, Loan to shareholder, Loan from shareholder, Loan repayment, Transfer
  - **Vendors:** Purchase on credit, Purchase paid on the spot, Payment to vendor, Credit note / goods returned
  - **Publishers:** Payment to publisher, Bought with cash, Refund from publisher, Advance written off
  - **Staff pay:** Salary paid, Food allowance paid, Advance given, Salary deduction
  - **Shareholders:** Owner salary paid, Profit share paid, Owner withdrawal, Advance given, Salary deduction
- Each kind is still saved into its own ledger:
  - `Transactions` for money and pay
  - `Supplier_Transactions` for vendors and publishers
- **Why publisher and vendor payments are not Expenses.** Book cost is counted as copies sell; a vendor's cost is counted when the goods are bought. A payment only pays off what is owed. If it were entered as an Expense:
  - the cost would count twice;
  - the publisher or vendor would still show as owed;
  - publisher statements would lose "Covers sales up to".

  **MUST:** v2 keeps the ledgers separate behind one screen.
- The Vendor bills, Publishers, Pay staff and Shareholders pages are **views**: balances, statements and lists. Their add buttons, and tapping an amount owed, open the one screen with the kind already chosen and the figures filled in.
- Payment to a publisher:
  - Shows what is owed now and what is settled so far.
  - Suggests "Covers sales up to" as the latest date the amount fully settles. The person can change it.
- Expense specifics:
  - The category can be chosen from the list or typed as a new one. A name close to an existing one ("Utility" when "Utilities" exists) offers "Use it".
  - A utility bill has its own fields.
  - An expense can pay an expense claim, which marks the claim paid.
  - The bill photo can be attached.
- **Duplicate and wrong-total guards** run on the server, before saving. Each guard either warns or blocks:
  - **A.** Same kind, the same party or category, and the same amount within 7 days: warn. Saving needs a reason.
  - **D.** The same vendor bill number for the same vendor (ignoring case and spaces): **blocked**, with a link to the earlier entry.
  - **B.** An expense that matches a vendor bill within 7 days, or names a vendor: warn, with "Make it a vendor entry".
  - **C.** An expense that names a publisher: warn, with "Make it a publisher payment".
  - **F.** A due already in a daily shift, and a separate "Due taken" for the same due: warn, both ways.
  - **G.** An amount equal to an open expense claim: offer to link it. A claim already paid: warn.
  - **H.** A paper for the same party and amount was uploaded but not entered: offer to open the upload.
  - **I.** An expense and an income of the same amount on the same day in two of Biblion's accounts, or an expense that mentions bKash, bank, cash out or deposit: warn, with "Make it a transfer". This cancels the paired entry.

  When a guard offers to switch, the switch carries the figures over to the new kind.
- **v1 friction:**
  - The one screen was built by embedding older page functions inside the money page.
    - **MUST:** v2 builds one form component with a section for each kind.
  - Field errors come back as a single toast message.
    - **MUST:** the server returns `{field: message}` and the form marks the fields.

### 1.5 Daily operations
- **Daily shift:**
  - One per date (a second one is refused).
  - Sales come from the Loyverse report upload or are typed.
  - The cash, bKash and card split is recorded.
  - Dues are recorded by person.
  - Cash handed to a shareholder is recorded.
  - Short or over is worked out against the app's expected cash. The Loyverse (till) difference is shown beside it.
  - A photo of the shift slip can be attached. The app reads the slip.
- **Day closing:** the checklist for the day.
- **Month closing:** profit, profit shares, the lock, and re-opening with a reason.
- **Café:**
  - The daily closing count, waste with reasons, and expiry by batch.
  - Items are either café stock (counted every day) or supplies (checked when ordering).
  - Common items can be added from a checklist of 38, with Bangla names. Names typed on bills that aren't in the item list are listed so they can be linked.
- **Café orders** (one workflow for stock and supplies):
  1. The app suggests quantities from a forecast. It takes into account "Buy for" (1 week to 3 months, the item's own default, or Automatic) and shelf life.
  2. If the quantity is changed, a reason is required.
  3. Approval.
  4. The order goes out as PDF, Excel or WhatsApp text.
  5. One or more bills are entered, from the vendor or from several shops.
  6. The order becomes "part bought" or "bought", or the rest is closed with a reason.
- **Books:**
  - **Deliveries:**
    - Damaged copies are returned, kept at full cost, or kept at a lower cost.
    - Extra copies are kept or returned.
    - Short copies are still expected, or not coming.
    - The commission is read from the challan.
    - Payment on delivery and the delivery charge are handled.
  - **Requisitions:** drafts are made automatically on a chosen period. A delivery is matched against the requisition title by title.
  - **Stock changes**, each with a reason.
  - **Full stock-take.**
  - **Loyverse item import**, with a "change in Loyverse" list of differences.
  - **Special orders for customers:** these go into the next requisition and are marked arrived on delivery. The customer is told by WhatsApp with one tap.
  - **Selling price:** each publisher has a "shop discount to customers %". A title can have its own price. There is an optional standard discount.
  - **Other names:** titles and café items can have other names (Bangla spellings, romanised names, names on memos). The app learns a name when someone corrects a match.
- **Loyverse sales vs typed sales:** an upload *replaces* sales typed for the same title and day. Those typed sales are cancelled with a reason, after the person confirms. Typing sales for a day already uploaded needs a reason and is flagged to the shareholders.
- **Customers and cards** (managers and shareholders only, enforced on the server):
  - Membership card: valid 2 years by default (a setting). The paper card numbers are kept, and the next free number is suggested.
  - Loyalty card: one upload of a full card means one free drink.
  - The old ledger can be uploaded.
  - Search by any detail.
  - The lists can be exported as PDF or Excel, marked sensitive.
  - Staff can type a customer on an order but can't look customers up.
- **Events and bookings:** a deposit when confirmed and the rest when done, both as Other income. A refund is an expense.
- **HR:**
  - Staff records, with sensitive parts (identity, family, emergency contacts, salary) behind permissions.
  - Job descriptions and SOP acknowledgements.
  - Roster, with shift swaps and holiday exchanges.
  - Attendance:
    - punching from a personal phone with GPS;
    - a shared kiosk device that signs each punch;
    - corrections.
  - Leave (applications, accrual) and holidays.
  - Payroll, which feeds Accounts → Pay staff.
  - Performance, recruitment (stages and applicants), announcements, onboarding.
  - Staff leaving: notice, unused leave decided case by case, settlement, handover of tasks, and four documents.
- **Shareholders:**
  - Dated share history. Shares must add up to 100% on every date.
  - Changes of shares: one shareholder proposes and another confirms (never the one leaving).
  - Exit settlement.
- **Tasks:** recurring and one-off. Task forms can open a money or vendor entry directly. Tasks move when leave is approved. Reminders.
- **Expense claims, recurring expenses, profit by area, matching a bank or bKash statement** (CSV, Excel, photo or PDF).
- **Nightly check:**
  - What it runs:
    - the data check;
    - possible duplicates over the last 60 days;
    - balances below zero;
    - typed sales on days already uploaded;
    - entries waiting more than `approve.waiting_days` (1).
  - It notifies shareholders only when it finds something. It also has a card on the Dashboard with a "Check now" button.

### 1.6 Terminal actions (print / export / send)
- One **Download** button everywhere, which asks: PDF or Excel.
- PDFs are made on the server from HTML (letterhead with the Biblion logo and address). Excel files are made by v1's own `.xlsx` writer on both server and client.
- Printing opens a new tab and calls print. If pop-ups are blocked, the app says "Allow pop-ups to print".
- Some documents can be emailed.
- WhatsApp sharing is text only.
- Reports (Accounts): Daily, Monthly, **All money in and out** (by account, kind and area; waiting entries marked), Payables reconciliation, statements, profit by area, vendors, utilities, Books reports, HR reports.
- **MUST:** every export uses the same column definitions as the screen. In v1, report HTML is built separately from the screens.

### 1.7 Guardrails v2 must add (v1 gaps)
1. **An unsaved-changes guard** when leaving a form. v1 only stops live refresh while someone is typing.
2. **Per-field validation from the server.** In v1 the client marks required fields, but most rules live only on the server and come back as one message.
3. **Offline entries go through the same duplicate and approval dialog** when they sync (see §2, bug S1).
4. **One duplicate service** for typed entries, uploads, Loyverse imports and the nightly check.
5. **Idempotency longer than any offline period.** v1 keeps request ids for 30 days (see §2).
6. **Logout clears every cached business datum** on the device: the IndexedDB read cache, cached meta and the staff dashboard.
7. **A conflict check on every edit** (the record's `version`). v1 checks it only on staff, job description, user and role edits. Money and stock records are append-only, so their check is "has this already been corrected or cancelled?".
8. Before Confirm on an upload, **show which approval rule each new entry will fall under**.

---

## 2. Offline, Caching & Sync Requirements

### 2.1 v1 behaviour (what exists)
**App shell (service worker):**
- Cache name: `biblion-management-<date><letter>`. It changes every release, and the build rewrites the shell list to the hashed bundle names.
- On install, the shell is cached and the new worker activates at once (`skipWaiting`). On activate, old caches are deleted (except `bm-shared`) and open pages are taken over (`clients.claim`).
- Fetch rules:
  - Hashed `.min.js`, `.min.css` and `.png` files: cache first.
  - Everything else: network first. If the network takes longer than **2.5 s**, the cached copy is used, and `index.html` is the last fallback.
  - API calls go to the Apps Script URL (another origin) and are never cached.

**Share target:**
- `POST ./share-target` puts up to 10 files into the `bm-shared` cache under `./shared/<ts>-<i>`, with the header `X-Name`, then redirects to `./#/upload?shared=1`.

**API client:**
- Every request carries a `request_id`. The server stores the reply under `Requests` with id `REQ-<request_id>` and returns the stored reply when the same id comes again.
- Every call (reads and writes) is retried 2 times on network errors (600 ms, then 1,200 ms) with the same id.

**Read cache:**
- Reads listed in `CACHE_READ` (`meta.get`, `acc.boot`, `books.boot`, `cafe.boot`, `cafe.count.sheet`, `books.list`, `home.get`, `tasks.list`) are copied to IndexedDB.
- The key is `r:<last 10 chars of token>:<action>:<payload JSON>`.
- When offline, the copy is returned with `_offline` set.

**Offline queue:**
- Actions allowed offline (`OFFLINE_OK`): `acc.save`, `books.sales.save`, `cafe.count.save`, `cafe.waste.save`, `books.order.save`, `tasks.complete`, `tasks.comment`.
- After the retries fail, the call is put in IndexedDB `biblion-hr`, store `queue`. The person sees "saved on this phone".
- Attendance punches use a separate batch route, `attendance.sync`. Kiosk punches are signed (PBKDF2 → HMAC-SHA256 over `id|staff_id|type|device_ts|lat|lng|accuracy|device_id`) so a shared device can't forge them.

**When sync runs:**
- Triggers: the `online` event, the tab becoming visible, and every 60 s while online.
- It sends only the signed-in person's own items, oldest first, one at a time, with the original `request_id`.
- A network error stops the loop. Any other error marks the item `failed`; it is listed on `#/offline` ("Saved on this phone") for the person to resend or remove.

**Live updates:**
- `sync.version` is polled every 30 s and also returns the unread notification count. The change number sits in the Apps Script cache (`SYNC_V`, kept 6 hours).
- When the server's change number moves, list pages listed in `App.LIVE` redraw off-screen and swap in, keeping the scroll position.
- A page is never redrawn while a dialog is open, a field has focus, or a form has changed.

**Reconnection feedback:** a connection dot in the top bar showing online or offline and the number queued. Toasts: "N entries saved offline were sent" and "Not saved: … (see Saved on this phone)".

### 2.2 v1 sync bugs and lessons (MUST be designed out)
- **S1. Entries lost silently (live bug in v1).** When a queued `acc.save` or `books.sales.save` is replayed, the server may answer `{confirm, needs_reason}` (a duplicate warning). The sync loop treats any non-error reply as success and deletes the item. **The entry is never saved.**
  - **MUST:** a write reply has an explicit status: `saved | needs_input | rejected`.
  - `needs_input` keeps the item and puts it in front of the person with the same dialog as when online.
- **S2. Idempotency window.** Request ids are deleted after 30 days (`Requests` purge). An item queued for longer, or replayed from an old device, is applied twice.
  - **MUST:** the dedupe key is stored with the record itself (for example `client_op_id` on the row, unique per table) and never deleted.
- **S3. Shared devices.** Items belong to the person who made them and are sent only when that person is signed in. Another person's items wait indefinitely. Logout doesn't clear the read cache, which holds `acc.boot` and other business data, nor `bhr.dash` (the staff dashboard).
  - **MUST:** at logout, warn about unsent items; then clear all caches belonging to that person.
- **S4. One mutex per tab.** Two open tabs sync at the same time; only the request id saves them from doubles.
  - **MUST:** a cross-tab lock (Web Locks API or BroadcastChannel).
- **S5. No backoff or attempt count.** `attempts` is stored but never incremented. A failed item waits for a person.
  - **MUST:** exponential backoff for network errors, and a counted number of tries before an item is marked failed.
- **S6. Order and dependencies.** Items are replayed in queue order, but nothing links them. A correction queued before its original reaches the server fails.
  - **MUST:** an item can depend on another (`depends_on: op_id`), and the server accepts a client-made id for a record that is new.
- **S7. Conflicts with the server.** Money and stock records are append-only, so an offline correction of a record that was meanwhile corrected or cancelled on the server must fail clearly ("this entry was changed by X") and must not create a second replacement.
- **S8. Business conflicts are not just duplicates.** Typed book sales queued offline can clash with a Loyverse upload made in the meantime. A queued daily shift can clash with a shift for the same date. The replay path MUST run the same guards (§1.4) and return `needs_input`.
- **S9. Stale reads.** The read cache has no age limit and no notice of age.
  - **MUST:** show "figures from <time>" when working from the cache.
  - **MUST:** write forms that work offline must not depend on lists more than N hours old without saying so.
- **S10. Service worker.** The network-first 2.5 s race can show an old shell with a newer cached API contract after a release.
  - **MUST:** a version handshake. The app sends its build id, the server rejects incompatible clients with an "update the app" response, and the client refreshes the shell.

### 2.3 v2 offline contract (minimum)
- **Queue record:**
  - `op_id` (client UUID), `owner_user_id`, `created_at`, `action`, `payload`, `client_record_id?`, `depends_on?`, `attempts`, `next_try_at`, `status (pending|sending|needs_input|failed|done)`, `last_error`, `label`
- **Server reply for a write:** `{status, record_id?, prompt?: {warnings[], fields{}}, error?}`
- **Feedback:**
  - A queue badge.
  - A "Saved on this phone" page listing each item: send now, edit, remove (with a reason), and answer a prompt.
  - A toast when the connection is back: how many were sent and how many need attention.
- **Offline-capable actions:** keep v1's list, plus attendance punches with signing.
  - Don't allow offline approvals, closings, imports, or anything that changes permissions.

---

## 3. UI, Ergonomics & `i18n` Contract

### 3.1 Required UI states (every page and list)
- **Loading.** Keep the current content while reloading (v1's `load()` does this). Only the newest request may draw, so a slow old reply can't overwrite a newer one. On error, keep the content and show a message with `role="alert"`.
- **Empty.** A short sentence saying why the list is empty and what to do next (for example "No orders here.").
- **Error.**
  - A toast for actions.
  - Errors from saving a dialog appear in the dialog's footer.
  - When a form fails, **the message is kept** and the busy state ends.
- **Offline.** A connection dot with the queued count, and a notice that figures come from the cache, with their age. Entries saved offline show "saved on this phone".
- **Waiting / approval state.** Every entry carries a state chip: Checked, To check, Waiting for a shareholder (with the reason), Cancelled.
- **Busy buttons.** A button is turned off while its action runs, with a busy label, and turned back on afterwards.
- **Dialogs.** They stack; Escape closes only the top one. The duplicate dialog shows each warning, the earlier entries (each a link), a button for each fix, and a required reason.
- **Long lists.** Page bar: "Page X of Y · N entries", First / Previous / jump to a page / Next / Last, and 25, 50 or 100 a page.
  - The server sends one page at a time, newest first.
  - The search covers every entry. Within the search:
    - words of 3 or more characters match anywhere;
    - shorter words match whole words only;
    - ISO dates count as one word;
    - Bangla digits are read as numbers.
  - The page is remembered so that Back returns to it.
  - Notifications keep "Load more".
- **Tables.**
  - Dates, times, amounts, states and buttons stay on one line.
  - Long codes may break anywhere.
  - **No sideways scrolling at any width.** A table too wide becomes one card per row, with each value labelled.
  - Tabs wrap onto a second line.
- **Themes.** Light, dark, or follow the system (`bm.theme`), with an accent colour (`bm.accent`). One set of design tokens for both themes; no hard-coded colours.
- **Phone.** A bottom bar by role:
  - staff: Home, Tasks, Schedule, Count;
  - managers and owners: Home, Dashboard, Tasks, their first daily job.
- **Print and export formatting.**
  - A4 letterhead (logo, address).
  - Bangla-capable fonts.
  - Tables keep column alignment.
  - Totals rows.
  - "Marked *" footnotes for waiting entries.
  - Sensitive exports carry a marker.
- **Writing style.** Sentence case. "Café" with the accent. Money as "Tk 1,000". Dates as "Sat 21 Nov" in lists and "21 Nov 2026" in documents. Page titles match menu labels.

### 3.2 i18n contract
**How v1 works, and why not to repeat it:**
- The English sentence is the key.
- A `MutationObserver` translates the page as it is drawn: text, `placeholder`, `aria-label` and `title`.
- Sentences are split on `. ? !` and on `" · "`.
- Then 372 regular-expression patterns are tried.
- A lookup changes "Café" to "Cafe" so older translations still match.

This makes every change of English wording break the Bangla. Server messages are translated on the client by matching the English text.

**MUST for v2:**
- **Stable message ids**, for example `money.kind.expense`, and ICU-style placeholders for numbers and dates (`{amount}`, `{date}`).
- The server sends error **codes plus parameters**, not English sentences.
- Numbers and dates are formatted for each language. v1 translates month and weekday names (`bn.months.json`) but keeps Latin digits; whether to use Bangla digits is the owner's choice.

**Files in the starter (`locales/`):**

| File | What it holds | Count |
|---|---|---|
| `bn.json` | English → Bangla. Phrases whose English is found literally in v1's source (frontend, backend messages, help texts). Use it as the source to assign message ids. | 2,506 |
| `bn.patterns.json` | v1's sentence patterns (regular expression → replacement with `$1`), by namespace: core 16, ops 258, accounts 98. Each should become a parameterised message. | 372 |
| `bn.months.json` | Bangla month names | — |
| `bn.help.json` | Field help texts and the help for each money type, English and Bangla | — |
| `bn.unverified.json` | Phrases whose English no longer appears literally anywhere in v1. Most are obsolete; a few may be built from pieces at run time. Check them before discarding. Not loaded by anything. | 370 |

Translation areas in v1 (keep the split as namespaces):
- `core` (shell, sign-in, Home)
- `accounts`
- `ops`: books, café, events, customers, uploads, paging, money rules
- `server` (messages the server returns)

The language is personal: the setting is `ui.lang` per user, and the device keeps `bm.lang`. The `<html lang>` attribute and a `bn` body class switch the fonts.

---

## 4. Data Schemas & External Contracts

### 4.1 Data store (migrate)
- There are 4 Google Spreadsheets ("groups"), whose ids are kept in Script Properties as `DB_ID_<group>`:
  - `core`
  - `accounts`
  - `books`
  - `hr`
- There are 107 tables. **Every table and column is listed in Appendix A1.**
- Every row has `id, created_at, created_by, updated_at, updated_by, version`.
- IDs are permanent, have a prefix (for example `TRX-…`), and are never taken from row numbers or names. Records link to each other only by id.
- v2 MUST keep the existing ids so that Drive files, the audit log, notifications and documents still resolve.
- Fields that change meaning or must be migrated with care:
  - **Status fields:** `status` (`active | void | rejected | inactive …`), `approved_by` (empty = waiting), `wait_top` (only a shareholder approves), `wait_reason`, `dup_reason`, `void_reason`, `replaces`.
  - **Link fields:** `src` links a child row to its parent, for example `daily:<shift id>` for dues from a daily shift, and `pay:`, `rcp:`, `rec:`, `dlv:`.
  - **Book stock:** `Stock_Movements` is the ledger: `ref_type` (`loyverse | receipt | …`), `unit_cost`, `sale_amount`. `Stock_Balances` is derived from it.
  - **Publisher settlement:** `Supplier_Transactions.covers_up_to` marks which publisher sales a payment settles.
  - **Share history:** `Share_History` must cover every date, with shares adding up to 100% on each date.
  - **Setup data that is history, not configuration:** `Money_Accounts` (account `kind`: `drawer | bkash | bank | owner`; exactly one drawer) and `Expense_Categories.area` (`books | cafe | shared`) and `needs_shareholder`. Keep them.
  - **Uploads:** `Intake_Docs.proposal` (JSON) holds the prepared entries. Pending uploads must migrate with it.
  - **Logs:** `Requests` (idempotency, purged after 30 days) and `Sessions` are logs. `Audit_Logs` has to be migrated or kept readable.

### 4.2 Files (Google Drive)
- Folders are created by path and their ids cached in Script Properties as `FOLDER:<path>`, under the root `FOLDER_ROOT`.
- Every file has a `Files` row: `drive_id`, `owner_type/owner_id`, `module`, `doc_type`, `sensitive`, `checksum` (used for duplicate detection), and more.
- Staff identity and customer files are `sensitive` and are served only to people with the permission.

### 4.3 Configuration, secrets and environment (names only)
- **Frontend `config.js`:**
  - `window.BIBLION_CONFIG.API_URL` (the Apps Script `/exec` URL)
  - `MODE` (`api` for GitHub Pages; `gas` when served by Apps Script)
- **Apps Script Script Properties:**
  - `SETUP_CODE`: a one-time first-owner setup code, deleted after use
  - `DB_ID_<group>`, `DB_PREV_<group>`, `DB_CACHE_OFF`
  - `FOLDER_ROOT`, `FOLDER:<path>`
  - `GEMINI_KEY`, `GOOGLE_BOOKS_KEY`
  - `JOB_<job>`: the last period each scheduled job ran
  - `MONEY_NIGHTLY`: the last nightly check result, about 9 KB at most
- **Apps Script settings:** time zone `Asia/Dhaka`; runtime V8; Drive v3 advanced service; deployed to run as the deploying user, with anonymous access because the app has its own sign-in.
  - Scopes: spreadsheets, drive, documents, `script.send_mail`, `script.scriptapp`, `script.external_request`.
- **Scheduled job:** `jobHourly`, one trigger every hour. Each job inside runs once per period, guarded by `JOB_*`:
  - tasks and reminders
  - leave accrual
  - holiday exchanges
  - purge: sessions, requests older than 30 days, notifications older than 12 months
  - storage
  - monthly compaction
  - document expiry
  - roster selection
  - accounts daily
  - payroll lines
  - books daily
  - automatic requisitions
  - manager summary (21:00)
  - café daily
  - forecast (03:00)
  - task dates
  - backups: daily, weekly, and monthly with a restore test
  - log archive
  - upload housekeeping
  - money nightly check (01:00–06:00)
- **Settings:** 131 keys in `System_Settings`, per business. Personal settings are kept in `User_Settings`. All keys and defaults are in **Appendix A2**. Keep the key names or map them.

### 4.4 API contract (v1)
- One endpoint. The request is a `POST` with the JSON body `{action, payload, token, request_id, client_now, device?}`. The reply is `{ok:true, data}` or `{ok:false, error:{code, message, details}}`.
- Error codes in use: `AUTH`, `AUTH_REQUIRED`, `BACKUP`, `BAD_REQUEST`, `BALANCE`, `CONFLICT`, `CORRUPT`, `DUPLICATE`, `FORBIDDEN`, `GEOFENCE`, `GEOFENCE_REASON`, `HOLIDAY`, `INCOMPLETE`, `IN_USE`, `LOCATION_REQUIRED`, `LOCKED`, `MAYBE_DUPLICATE`, `MONTH_CLOSED`, `NOT_FOUND`, `NOT_INITIALIZED`, `RESET`, `RESTORE`, `SEQUENCE`, `TYPED_SALES`, `VALIDATION`.
- Duplicate prompt: `{confirm, warnings:[{code, text, existing:[{table, id, text, link}], fix:{kind, type, …}}], needs_reason:true}`. The client sends again with `dup_reason`.
  - Warning codes: `twin`, `due_in_shift`, `due_entered`, `vendor_bill`, `vendor`, `publisher`, `transfer`, `transfer_pair`, `claim`, `claim_paid`, `upload`, `loyverse_day`.
- Paged lists: `{q, offset, limit}` → `{items, total, offset, limit}`. Some v1 lists use `rows` instead of `items`.
- **All 289 actions, with write flags and permissions, are in Appendix A3.** The 70 permissions and the default roles are in **A4**.
- **Auth:**
  - Usernames and passwords are hashed with PBKDF2 (`pass_hash`, `kdf_salt`, `kdf_iter`).
  - Sessions are kept in `Sessions`; the token lives in `localStorage` under `bhr.token`; sessions last `auth.session_days` (30).
  - A kiosk device registers and signs punches.

### 4.5 Browser storage (migrate or clear on first v2 load)

| Where | Key | Holds |
|---|---|---|
| localStorage | `bhr.token` | session token |
| localStorage | `bhr.meta` | cached `meta.get`: user, permissions, settings |
| localStorage | `bhr.device` | kiosk device registration |
| localStorage | `bhr.devid` | this device's id, used in punch signing |
| localStorage | `bhr.dash` | staff dashboard cache (**clear on logout**) |
| localStorage | `bhr.wizard` | first-run wizard done |
| localStorage | `bm.lang` | `en` or `bn` |
| localStorage | `bm.theme` | `light`, `dark` or unset (follow system) |
| localStorage | `bm.accent` | accent colour (hex) |
| localStorage | `bm.pageSize` | 25, 50 or 100 |
| localStorage | `bm.gs.hidden.<userId>` | "Getting started" dismissed |
| localStorage | `bm.token`, `bm.meta` | demo-mode leftovers (delete) |
| sessionStorage | `bm.page:<listKey>` | `{offset, limit, q, sig}` for Back |
| IndexedDB `biblion-hr` v1, store `queue` (keyPath `op_id`) | | offline queue items: `kind`, `owner`, `action`, `payload`, `request_id`, `label`, `queued_at`, `attempts`, `failed`, `error`, plus `event` and `signature` for punches |
| IndexedDB `biblion-hr` v1, store `kv` | `r:<token10>:<action>:<payload>` | read cache |
| Cache Storage | `biblion-management-<version>` | app shell |
| Cache Storage | `bm-shared` | files shared into the app, waiting for the upload page |

**MUST:** on first launch, v2 sends any pending v1 queue items, or exports them, before it deletes the v1 stores.

---

## 5. Abandoned Features & Anti-Patterns (Do Not Port)

### 5.1 Dead or obsolete
- **Demo mode** (`CFG.MODE === 'demo'`, `DemoBackend`, `DemoBar`, `DEMO_LOCATION`, the `bm.token`/`bm.meta` cleanup). It is referenced, but the code it calls was removed.
- **Supplies list** (`56_Supplies.js`, `#/cafe/supplies`). It was merged into Café orders on 21 Nov 2026. `tests/e2e` (`docs_e2e`) still opens the old route.
- **The old single "Money entries" approval switch.** It now only covers "other money entries" and the fallback for the per-kind switches. v2 seeds the per-kind values when migrating and drops the fallback.
- **Membership expiry reminders on Home.** The owner removed them; `Members.expiring` is no longer used.
- **The "Do not enter publisher payments here; they go under Books" help text.** Replaced by the one money screen.
- **Actions with no caller in the v1 frontend.** Check each before dropping:
  - `pos.cafe_lines`
  - `attendance.today`
  - `leave.preview_days`
  - `settings.checklist`
  - `tasks.generate` (the hourly job does this)
  - `review.open`, `review.summary`
  - `schedule.cancel`
  - `documents.archive`
  - `jd.list`
  - `sop.status`
  - `staff.file`
  - `performance.metrics`
  - `acc.month.close` (closing goes through `#/closing/month`)
  - `reset.run`, `reset.scopes` (a destructive reset; if kept, owner-only behind a typed confirmation)
  - `ping` (health check; keep a public health endpoint)
- **The `bhr.` prefix** on storage keys and the `biblion-hr` database name, left over from the separate HR app. v2 uses one prefix.
- **`allow_duplicate` from the browser.** Stripped by the server since 21 Nov. v2 has no client flag that skips a check.
- **About 370 Bangla phrases** whose English no longer exists (`locales/bn.unverified.json`).

### 5.2 Architectural mistakes not to repeat
1. **English-as-key i18n translated by watching the DOM.** It breaks with every wording change, costs CPU on every redraw, and misses text built from pieces. Use ids (§3.2).
2. **Hand-written DOM helpers and global namespaces** (`h()`, `page()`, `Acc`, `App`, …) **and string-concatenated HTML** for reports and print (`document.write`). Use components, escape by default, and one table definition for screen, print and Excel.
3. **Page functions embedded inside other pages** (the one money screen calls `vendorsPage`, `publishersPage` and `payPage` with an `emb` flag). Build forms as components with an explicit API.
4. **Business rules spread across modules.**
   - Approvals (§1.1).
   - Duplicate checks: typed entries, uploads, POS import and the nightly check each have their own.
   - Cash-effect signs: the engine has a `CASH` table, and the money report has a copy.

   v2 needs one rules module per concern, with tests.
5. **Write replies whose meaning hides in their shape** (`{confirm}` and `{id}` both count as success). Use an explicit status (§2.2 S1).
6. **Google Sheets as a database:**
   - every request reads whole tables into memory;
   - a single script lock serialises every write;
   - the 6-minute execution limit;
   - a ~9 KB limit per Script Property;
   - accounting figures are recalculated from all records on each request (`AccData.load`).

   If v2 stays on free Google services, it needs: append-only ledgers with stored running balances per month, indexes kept in memory per request only, and closed months frozen into snapshot rows.
7. **Idempotency with a time limit** (`Requests` purged after 30 days). Store the client operation id on the record itself.
8. **A read cache keyed by part of the token, never cleared.** Key it by user, give it an age, and clear it on logout.
9. **Live refresh by polling a global change number every 30 s and redrawing whole pages.** Use a change number per area (money, books, café, HR) and redraw only what changed.
10. **Optimistic version checks on only a few edits.** Apply them to every editable record (§1.7).
11. **The build rewriting the service worker** (regular expressions over `SHELL` and `VERSION`). Generate the service worker from the build manifest.
12. **Tests run in a Node mock of Google services** (`dev/gas-mock.js`) plus a self-test inside the Apps Script editor (`90_Tests.js`). The approach worked. Keep the idea of one fake backend for tests and screenshots (`dev/shot-server.js`), but don't ship test code in the production bundle.

### 5.3 What was solid (keep the idea; don't over-engineer)
- Append-only money and stock records, with corrections that replace, cancel reasons and the audit log.
- The accounts engine:
  - profit counts book cost when copies sell;
  - publishers are paid either when copies sell or on delivery;
  - drawer short/over against the app's own figure;
  - profit share by days.
- The upload → prepare → one Confirm pipeline, and its rules from real documents (§1.3).
- Server-side paging and search (§3.1). Permission checks on the server for every action. The customer-data restriction.
- The free-only stack: GitHub Pages PWA plus Apps Script, with Drive text reading and an optional Gemini key.

---

## Starter package contents
- `REWRITE_BLUEPRINT.md`: this file
- `locales/bn.json`, `bn.patterns.json`, `bn.months.json`, `bn.help.json`, `bn.unverified.json`: v1's translations, extracted from its JavaScript (v1 has no separate locale files)
- `assets/icon-192.png`, `assets/icon-512.png`: the app icons
- `assets/biblion-logo.png`: the letterhead logo, 125×150, taken out of the v1 code
- `assets/manifest.v1.webmanifest`: v1's manifest (name, colours `#0F3D34`, share target), for reference

---

## Appendices (generated from v1 code)
### A1. Tables (Google Sheets, 4 spreadsheets). Base columns on every table: id, created_at, created_by, updated_at, updated_by, version:n. Suffix :n number, :b boolean, :j JSON.


**core**

| Table | ID prefix | Columns |
|---|---|---|
| System_Settings | SET | value:j, confirmed:b, confirmed_by, confirmed_at |
| Counters | CNT | value:n |
| Roles | ROL | name, description, permissions:j, level:n, is_system:b, status |
| Users | USR | username, display_name, role_id, staff_id, shareholder_id, email, phone, perm_grants:j, perm_denies:j, money_accounts:j, pass_hash, kdf_salt, kdf_iter:n, status, failed_attempts:n, locked_until, last_login_at |
| User_Settings | UST | user_id, key, value:j, set_by, set_at |
| Sessions (log) | SES | user_id, expires_at, kind, device_info, revoked:b, staff_id |
| Requests (log) | REQ | user_id, action, response:j |
| Audit_Logs (log) | AUD | ts, user_id, user_name, action, entity, record_id, before:j, after:j, reason, request_id |
| Intake_Docs | INT | file_id, status, kind, hint, private:b, read_how, ai_used:b, ocr_text, extracted:j, proposal:j, web:j, confidence:n, questions:j, uploaded_by, confirmed_by, confirmed_at, result:j, discard_reason, error |
| Review_Flags | FLG | module, table_name, record_id, text, link, note, flagged_by, status, reviewed_by, reviewed_at, review_note |
| Notifications (log) | NTF | user_id, staff_id, type, module, priority, title, body, link, link_type, link_id, dedupe_key, read_at, emailed:b |
| Backup_Logs (log) | BAK | kind, started_at, finished_at, status, location_id, tables:n, rows:n, bytes:n, checksum, message |
| Files | FIL | drive_id, name, mime, size:n, checksum, folder_key, owner_type, owner_id, sensitive:b, uploaded_by, uploaded_at, module, doc_type, title, doc_date, doc_number, party_key, party_label, amount:n, note, record_label, search, ocr_text, ocr_status, status, removed_by, removed_at, removed_reason, expiry_date, expiry_notified |
| Log_Archives | LGA | file_drive_id, name, from, to, rows:n, bytes:n |
| Day_Closings | DCL | date, status, steps:j, closed_by, closed_at, overrides:j, reopened_by, reopen_reason |
| Month_Closings | MCL | period_key, status, steps:j, closed_by, closed_at, overrides:j, reopened_by, reopen_reason |

**accounts**

| Table | ID prefix | Columns |
|---|---|---|
| Shareholders | SHR | name, full_name, share:n, salary:n, opening_payable:n, cash_opening:n, salary_from, phone, status, sort:n, salary_to, exit_date |
| Bookings | BKG | number, date, start_time, end_time, title, kind, customer_id, organiser, phone, email, people:n, fee:n, deposit:n, status, deposit_txn_id, balance_txn_id, refund:n, refund_txn_id, note, created_by, cancel_reason |
| Share_History | SHH | shareholder_id, effective_from, share:n, change_id, status |
| Share_Changes | SHC | number, kind, effective_from, leaver_id, new_split:j, newcomer:j, buyout_by, buyout_amount:n, buyout_due, buyout_terms, note, status, proposed_by, confirmed_by, confirmed_at, completed_by, completed_at, cancel_reason, documents:j |
| Money_Accounts | MAC | name, kind, opening:n, shareholder_id, status, sort:n |
| Expense_Categories | EXC | name, status, sort:n, area, needs_shareholder:b |
| Due_Contacts | DUC | name, phone, opening_due:n, status |
| Utility_Bills | UTB | utility, transaction_id, period_from, period_to, units_used:n, unit_label, bill_amount:n, late_fee:n, due_date, paid_date, paid_amount:n, meter_reading:n, note, status, entered_by |
| Recurring_Expenses | RCE | name, category_id, account_id, amount:n, day_of_month:n, status |
| Suppliers | SUP | kind, name, contact, phone, email, supplies, delivery_service, category_id, usual_discount:n, sell_discount:n, pay_every_months:n, pay_every_days:n, pay_months, credit_limit:n, terms_note, liability, opening_due:n, opening_due_date, status |
| Supplier_Transactions | STX | date, supplier_id, type, amount:n, delivery_charge:n, delivery_by, courier_id, courier_paid, items_total:n, order_id, account_id, bill_no, for_bill, covers_up_to, receipt_id, ref, note, src, status, void_reason, voided_at, voided_by, replaces, approved_by, entered_by, wait_top:b, wait_reason, dup_reason |
| Transactions | TRX | date, type, category_id, party_type, party_id, account_id, to_account_id, amount:n, rate:n, loan_no, for_period, installments:n, payroll_line_id, claim_id, src, ref, note, status, void_reason, voided_at, voided_by, replaces, approved_by, entered_by, wait_top:b, wait_reason, dup_reason |
| Daily_Shifts | DSH | date, net_sales:n, books_sales, cash:n, bkash:n, due:n, card:n, expected_cash:n, actual_cash:n, handed_to, handed_amount:n, note, source, status, void_reason, voided_at, voided_by, replaces, approved_by, entered_by, wait_top:b, wait_reason, dup_reason |
| Food_Allowance_Rates | FAR | from, amount:n, note |

**books**

| Table | ID prefix | Columns |
|---|---|---|
| Cafe_Items | CIT | name, aliases, kind, shop, cover_days:n, vendor_id, unit, category_id, shelf_life_days:n, lead_time_days:n, min_order_qty:n, order_multiple:n, par_level:n, sale_price:n, unit_cost:n, pos_name, count_daily:b, status, sort:n, notes |
| Cafe_Batches | CBT | item_id, purchase_line_id, received_date, expiry_date, qty_received:n, qty_left:n, unit_cost:n, status |
| Cafe_Counts | CCT | date, item_id, counted_qty:n, wasted_qty:n, expired_qty:n, received_qty:n, used_qty:n, pos_sold_qty:n, gap_qty:n, stockout:b, note, counted_by, task_id |
| Purchase_Lines | PLN | stx_id, vendor_id, date, item_id, item_name, qty:n, unit, rate:n, amount:n, expiry_date, status |
| Cafe_Orders | COR | number, kind, vendor_id, date, status, lines:j, bought:j, stx_ids:j, cover_days:n, expected_date, delivery_charge_est:n, items_value:n, note, created_by, approved_by, approved_at, stx_id, cancel_reason |
| Customers | CUS | name, phone, phone_key, email, note, status, created_by |
| Customer_Cards | CRD | customer_id, kind, number, start_date, expiry_date, valid_years:n, status, free_drinks:n, last_free_date, source, file_id, note, created_by |
| Card_Events | CEV | card_id, customer_id, kind, date, from_date, to_date, detail, file_id, created_by |
| Supply_Checks | SCK | item_id, date, on_hand:n, order_id, checked_by |
| Demand_Forecasts | DFC | item_key, computed_at, method, days_of_data:n, daily_rate:n, weekday_factors:j, sd:n, trend:n, stockout_days:n, waste_rate:n, on_hand:n, incoming:n, reorder_point:n, suggested_qty:n, order_by, cover_days:n, confidence, basis |
| Books | BOK | title, aliases, author, isbn, publisher_id, printed_price:n, low_stock:n, pos_name, pos_sku, status, notes, sell_price:n, pos_price:n, pos_price_at, web_source |
| Special_Orders | SPO | number, date, customer_id, customer_name, phone, book_id, title, author, publisher_id, qty:n, advance:n, status, requisition_id, receipt_id, note, taken_by, arrived_at, told_at, told_by, collected_at, cancel_reason |
| Stock_Take_Counts | STC | stock_take_id, key, counted |
| Stock_Takes | STK | number, date, scope, publisher_id, status, counts:j, started_by, submitted_by, submitted_at, applied_by, applied_at, note, result:j |
| POS_Items | PIT | name, sku, barcode, category, price:n, cost:n, book_id, cafe_item_id, imported_at, status |
| Requisitions | RQN | number, publisher_id, date, sales_from, sales_to, status, sent_at, sent_by, note, closed_reason |
| Requisition_Lines | RQL | requisition_id, book_id, title, author, isbn, printed_price:n, expected_price:n, sold:n, extra:n, qty:n, sort:n, cancelled_qty:n, cancel_note |
| Receipts | RCP | number, kind, publisher_id, receipt_no, date, requisition_id, status, total:n, paid_amount:n, paid_account_id, note, recorded_by, approved_by, approved_at, decision_note |
| Receipt_Lines | RCL | receipt_id, book_id, title, author, isbn, printed_price:n, qty:n, unit_price:n, req_line_id, accepted_qty:n, match, sort:n |
| Receipt_Discrepancies | RCD | receipt_id, line_id, kind, expected, actual, message, decision, decided_by, decided_at, note |
| Stock_Movements | STM | date, book_id, printed_price:n, kind, qty:n, unit_cost:n, sale_amount:n, customer_discount:n, receipt_line_id, ref_type, ref_id, stmt_date, order_date, reason, status, flagged:b, flag_note, approved_by, approved_at, entered_by, void_reason, voided_at, voided_by, replaces |
| Stock_Balances | SBL | book_id, printed_price:n, received:n, sold:n, returned:n, out_other:n, on_hand:n, last_at |

**hr**

| Table | ID prefix | Columns |
|---|---|---|

### A2. Settings keys (System_Settings), with defaults

| Key | Group | Type | Default |
|---|---|---|---|
| org.name | Business | text | "Biblion" |
| org.tagline | Business | text | "Bookstore café and cultural space" |
| org.address | Business | textarea | "" |
| org.phone | Business | text | "" |
| org.email | Business | text | "" |
| org.open_time | Operating hours | time | "11:00" |
| org.close_time | Operating hours | time | "23:00" |
| org.open_days | Operating hours | weekdays | [0,1,2,3,4,5,6] |
| hours.outside_hours_approval | Operating hours | select | "manager" |
| id.staff_prefix | Business | text | "BIB" |
| id.staff_digits | Business | number | 4 |
| reporting.start_day | Reporting cycle | number | 11 |
| gps.lat | Attendance & GPS | number | "" |
| gps.lng | Attendance & GPS | number | "" |
| gps.radius_m | Attendance & GPS | number | 50 |
| gps.max_accuracy_m | Attendance & GPS | number | 100 |
| gps.exception | Attendance & GPS | select | "correction" |
| attendance.late_grace_min | Attendance & GPS | number | 0 |
| attendance.early_grace_min | Attendance & GPS | number | 0 |
| attendance.incomplete_after_min | Attendance & GPS | number | 120 |
| attendance.duplicate_window_sec | Attendance & GPS | number | 120 |
| attendance.clock_skew_flag_min | Attendance & GPS | number | 5 |
| attendance.offline_max_age_days | Attendance & GPS | number | 7 |
| attendance.offline_auto_validate | Attendance & GPS | bool | false |
| attendance.half_day_pct | Attendance & GPS | number | "" |
| hours.flex_mode | Working hours | select | "informational" |
| hours.required_basis | Working hours | select | "designation" |
| breaks.mode | Working hours | select | "recorded" |
| breaks.fixed_minutes | Working hours | number | 0 |
| breaks.min_work_for_fixed | Working hours | number | 360 |
| breaks.paid | Working hours | bool | true |
| selection.auto_confirm | Next-day shift selection | select | "never" |
| selection.auto_shift_ids | Next-day shift selection | shifts | [] |
| selection.min_rest_hours | Next-day shift selection | number | 8 |
| selection.reminder_time | Next-day shift selection | time | "23:30" |
| selection.advance_days | Next-day shift selection | number | 7 |
| exchange.min_notice_days | Weekly holidays | number | 1 |
| holidays.treatment | Public holidays | select | "open_scheduled" |
| leave.probation_months | Leave | number | 3 |
| leave.rate | Leave | number | 1.5 |
| leave.timing | Leave | select | "service_month" |
| leave.partial | Leave | select | "prorate_days" |
| leave.day_counting | Leave | select | "working" |
| leave.allow_negative | Leave | bool | false |
| tasks.days_ahead | Tasks | number | 1 |
| payroll.currency | Payroll | text | "Tk" |
| payroll.overtime_paid | Payroll | bool | false |
| payroll.unpaid_divisor | Payroll | select | "period_days" |
| performance.criteria | Performance | list | ["Punctuality","Task completion","Work quality","Responsibil |
| performance.self_assessment | Performance | bool | true |
| documents.expiry_reminder_days | Documents | number | 30 |
| separation.leave_encash | Leaving | select | "ask" |
| separation.notice_days | Leaving | number | 30 |
| separation.notice_deduct | Leaving | bool | true |
| letters.experience | Documents | html | "<h2>Experience certificate</h2><p>Date: {{today}}</p><p>Thi |
| letters.experience_conduct | Documents | text | "During this time, their conduct was satisfactory." |
| letters.release | Documents | html | "<h2>Release letter</h2><p>Date: {{today}}</p><p>To {{name_e |
| approve.books_delivery | Approvals | select | "final_flag" |
| approve.books_stock | Approvals | select | "final_flag" |
| approve.books_sales | Approvals | select | "final_flag" |
| approve.cafe_order | Approvals | select | "final_flag" |
| approve.money_limit | Approvals | number | 2000 |
| approve.money_expense | Approvals | select | "" |
| approve.money_income | Approvals | select | "" |
| approve.money_transfer | Approvals | select | "" |
| approve.money_vendor | Approvals | select | "" |
| approve.money_publisher | Approvals | select | "" |
| approve.money_daily | Approvals | select | "" |
| approve.waiting_days | Approvals | number | 1 |
| approve.money | Approvals | select | "shareholder" |
| letters.offer | Documents | html | "<h2>Offer of employment</h2><p>Date: {{today}}</p><p>Dear { |
| letters.appointment | Documents | html | "<h2>Appointment letter</h2><p>Date: {{today}} &nbsp; Staff  |
| notify.email_enabled | Notifications | bool | false |
| notify.owner_email | Notifications | text | "" |
| auth.session_days | Security | number | 30 |
| auth.max_failed | Security | number | 5 |
| auth.lock_minutes | Security | number | 15 |
| backup.daily_hour | Backup | number | 2 |
| backup.weekly_day | Backup | weekday | 5 |
| backup.keep_daily | Backup | number | 14 |
| backup.keep_weekly | Backup | number | 8 |
| backup.keep_monthly | Backup | number | 12 |
| acc.first_month_start | Accounting | date | "" |
| acc.pay_within_days | Accounting | number | 7 |
| alerts.emails | Accounting | text | "" |
| food.per_day | Food allowance | number | 100 |
| food.week_starts | Food allowance | weekday | 6 |
| food.unpaid_rule | Food allowance | select | "every_day" |
| intake.ai | Reading documents | select | "hard" |
| intake.gemini_model | Reading documents | text | "gemini-flash-latest" |
| intake.web_lookup | Reading documents | bool | true |
| intake.contact_email | Reading documents | text | "" |
| files.read_text | Document library | bool | true |
| books.rating_days | Books | select | "180" |
| cafe.expiry_warn_days | Café stock | number | 2 |
| members.valid_years | Customer cards | number | 2 |
| members.min_purchase | Customer cards | number | 2000 |
| members.discounts | Customer cards | text | "5% off books, 7% off food, 10% off drinks" |
| loyalty.drinks_per_free | Customer cards | number | 10 |
| members.ai | Customer cards | select | "yes" |
| cafe.supply_cover_days | Café stock | number | 30 |
| cafe.service_level | Café stock | number | 90 |
| cafe.max_delivery_share | Café stock | number | 10 |
| cafe.min_history_days | Café stock | number | 14 |
| acc.limited_account_kinds | Accounts | json | ["drawer","bkash"] |
| books.lead_days | Books | number | 7 |
| forecast.events | Café stock | json | [] |
| books.forecast_weeks | Books | number | 12 |
| books.order_cover_days | Books | number | 30 |
| docs.expiry_warn_days | Document library | number | 30 |
| closing.day_steps | Closing | list | ["daily_shift","cash_count","cafe_count","deliveries","tasks |
| closing.month_steps | Closing | list | ["day_closings","salaries","vendor_balances","publisher_bala |
| books.low_stock | Books | number | 1 |
| books.slow_days | Books | number | 90 |
| audit.archive_years | Backup | number | 2 |
| books.req_auto | Books | select | "off" |
| books.sell_discount | Books | number | "" |
| books.price_check_pct | Books | number | 2 |
| pos.book_categories | Books | list | ["Books","Book"] |
| pos.payment_map | Books | json | {"Cash":"cash","bKash":"bkash","Card":"card","Due":"due"} |
| pos.date_order | Books | select | "auto" |
| ui.lang | Display | select | "en" |
| ui.home_hidden | Display | list | [] |
| notify.muted | Notifications | list | [] |
| tasks.remind_hours | Notifications | number | 24 |
| attendance.home_controls | Attendance & GPS | bool | true |
| auth.self_password | Security | bool | false |
| profile.self_edit | Staff records | bool | true |
| hr.self_availability | Next-day shift selection | bool | true |
| month.closed_through | Month end | date | "" |
| ui.accent | Display | color | "#4f46e5" |

### A3. API actions (POST {action, payload, token, request_id, client_now}; reply {ok, data} or {ok:false, error:{code, message, details}})

`*` = write (needs request_id, applied once). [perm] = permission checked by the router; most also check inside.

- **acc**: acc.approve* [acc.approve], acc.areas, acc.areas.set*, acc.boot, acc.cancel*, acc.datacheck [acc.setup], acc.email, acc.entry, acc.food_rate.add*, acc.food_rate.remove*, acc.month.close* [month.close], acc.month.reopen* [month.close], acc.pdf, acc.publisher.suggest, acc.recent, acc.report, acc.save*, acc.setup.save*, acc.staff_opening, acc.staff_opening.save*, acc.statement, acc.statement.import*, acc.statement.read*, acc.unpaid_cut* [acc.staffpay]
- **announcements**: announcements.ack*, announcements.list, announcements.read*, announcements.save*, announcements.status
- **applicants**: applicants.list, applicants.save*, applicants.stage*
- **attendance**: attendance.board [attendance.view], attendance.correction*, attendance.correction_decide*, attendance.corrections, attendance.events, attendance.punch*, attendance.range, attendance.sync*, attendance.today, attendance.validate*
- **audit**: audit.archive.view [audit.view], audit.archives [audit.view], audit.list [audit.view]
- **auth**: auth.change_password*, auth.login* (public), auth.logout*
- **backup**: backup.download, backup.list [backup.manage], backup.restore*, backup.restore_test* [backup.manage], backup.run* [backup.manage]
- **books**: books.adjust.decide* [books.approve], books.adjust.save*, books.book.save*, books.boot, books.flag.resolve* [books.approve], books.ledger, books.list, books.move.cancel*, books.order.act*, books.order.save*, books.orders, books.receipt.cancel* [books.approve], books.receipt.decide* [books.approve], books.receipt.get, books.receipt.save*, books.recent, books.report, books.req.build, books.req.close*, books.req.get, books.req.save*, books.sales.check* [books.approve], books.sales.save*, books.stocktake.cancel*, books.stocktake.get, books.stocktake.save*, books.stocktake.start*, books.stocktake.submit*, books.stocktakes
- **cafe**: cafe.boot, cafe.count.save*, cafe.count.sheet, cafe.expiry, cafe.item.quick*, cafe.item.save*, cafe.items.search, cafe.order.close*, cafe.order.decide* [cafe.approve], cafe.order.document*, cafe.order.get, cafe.order.save*, cafe.orders.page, cafe.pos.compare*, cafe.starter, cafe.starter.add*, cafe.suggestions, cafe.unlinked, cafe.unlinked.link*
- **closing**: closing.day, closing.day.close*, closing.day.reopen*, closing.month, closing.month.close* [month.close], closing.month.confirm*, closing.override*
- **customers**: customers.get, customers.save*, customers.search
- **dailyops**: dailyops.get
- **dashboard**: dashboard.get, dashboard.management, dashboard.staff
- **documents**: documents.archive*, documents.expiring [documents.view], documents.letter*, documents.list, documents.upload*
- **entity**: entity.archive*, entity.decide*, entity.list, entity.save*
- **events**: events.list, events.save*, events.status*
- **exchange**: exchange.assign*, exchange.cancel*, exchange.decide*, exchange.list, exchange.override*, exchange.request*, exchange.resolve*, exchange.upcoming
- **files**: files.attach*, files.email*, files.for, files.get, files.remove*, files.search, files.thumbs, files.update*, files.upload*
- **forecast**: forecast.run*
- **home**: home.get
- **intake**: intake.confirm*, intake.discard*, intake.get, intake.key_set*, intake.keys, intake.list, intake.read, intake.upload*
- **jd**: jd.draft*, jd.issue*, jd.list, jd.save*, jd.signed*
- **leave**: leave.accrue* [leave.adjust], leave.adjust*, leave.applications, leave.apply*, leave.balances, leave.calendar, leave.cancel*, leave.decide*, leave.override*, leave.preview_days, leave.summary
- **members**: members.export*, members.free_drink*, members.free_drink.cancel*, members.list, members.renew*, members.save*
- **meta**: meta.get
- **money**: money.nightly, money.nightly.run*
- **notifications**: notifications.list, notifications.read*, notifications.unread*
- **onboarding**: onboarding.activate*, onboarding.get [recruitment.manage], onboarding.list, onboarding.mark*, onboarding.start*
- **payroll**: payroll.history, payroll.mine, payroll.payslip*, payroll.recalc*, payroll.view
- **performance**: performance.ack*, performance.list, performance.metrics [performance.manage], performance.save*, performance.self*
- **ping**: ping (public)
- **pos**: pos.cafe_lines, pos.import_catalog*, pos.import_sales*, pos.preview, pos.shift_photo*
- **report**: report.utilities, report.vendor_purchases
- **reports**: reports.list, reports.pdf, reports.run
- **reset**: reset.run*, reset.scopes [backup.manage]
- **review**: review.done*, review.flag*, review.open, review.summary
- **roles**: roles.list [users.manage], roles.save*
- **salary**: salary.save*
- **schedule**: schedule.approve*, schedule.assign*, schedule.board, schedule.cancel* [schedule.manage], schedule.generate*, schedule.range
- **selection**: selection.options, selection.submit*
- **separation**: separation.complete*, separation.decide*, separation.doc_preview, separation.document*, separation.handover, separation.handover_one*, separation.list, separation.settlement, separation.settlement_confirm*, separation.settlement_edit*, separation.settlement_reopen*, separation.submit*, separation.update*, separation.withdraw*
- **settings**: settings.checklist, settings.confirm*, settings.describe, settings.personal, settings.personal_reset*, settings.personal_set*, settings.set*
- **setup**: setup.owner* (public), setup.status (public)
- **shares**: shares.cancel*, shares.complete*, shares.confirm*, shares.document*, shares.get, shares.list, shares.propose*
- **sop**: sop.ack*, sop.mine, sop.status [announcements.manage]
- **staff**: staff.file, staff.get, staff.list, staff.probation*, staff.save*
- **storage**: storage.compact* [backup.manage], storage.status [backup.manage]
- **swap**: swap.decide* [schedule.manage], swap.list, swap.request*, swap.respond*
- **sync**: sync.version
- **tasks**: tasks.comment*, tasks.complete*, tasks.create*, tasks.generate* [tasks.manage], tasks.get, tasks.list, tasks.not_completed*, tasks.reassign*, tasks.report_printed*, tasks.start*, tasks.template_end*, tasks.template_pause*, tasks.template_save*, tasks.templates [tasks.manage], tasks.to_check, tasks.verify*
- **users**: users.create*, users.list, users.update*

### A4. Permissions and roles

- **Staff** (ROL-STAFF, level 1): cafe.count
- **Manager** (ROL-MANAGER, level 2): acc.expense, acc.transfer, cafe.view, cafe.count, cafe.receive, cafe.order, cafe.approve, closing.day, staff.view, staff.edit, staff.emergency, recruitment.manage, tasks.create, tasks.view_all, documents.view, documents.manage, responsibilities.manage, attendance.view, attendance.manage, schedule.view, schedule.manage, holiday.approve, tasks.manage, tasks.verify, dailyops.view, leave.approve, performance.manage, announcements.manage, separation.manage, extras.manage, reports.view, acc.daily, acc.vendor.purchase, books.view, books.sell, books.requisition, books.receive, books.approve, books.adjust, books.import, books.reports
- **Owner / shareholder** (ROL-OWNER, level 3): staff.view, staff.edit, staff.emergency, staff.family, staff.identity, salary.view, salary.edit, recruitment.manage, documents.view, documents.manage, documents.sensitive, responsibilities.manage, attendance.view, attendance.manage, schedule.view, schedule.manage, holiday.approve, owner.override, tasks.create, tasks.manage, tasks.view_all, tasks.verify, dailyops.view, leave.approve, leave.adjust, performance.manage, performance.sensitive, payroll.view, payroll.manage, announcements.manage, separation.manage, extras.manage, notes.manage, reports.view, acc.home, acc.daily, acc.money, acc.expense, acc.transfer, acc.vendor.purchase, acc.vendor.pay, acc.publisher.pay, acc.staffpay, acc.shareholders, acc.approve, acc.reports, acc.setup, month.close, books.view, books.sell, books.requisition, books.receive, books.approve, books.adjust, books.import, books.reports, cafe.view, cafe.count, cafe.receive, cafe.order, cafe.approve, cafe.setup, closing.day, settings.manage, setup.hr, setup.books, setup.tasks, users.manage, audit.view, backup.manage

All permissions: staff.view, staff.edit, staff.emergency, staff.family, staff.identity, salary.view, salary.edit, recruitment.manage, documents.view, documents.manage, documents.sensitive, responsibilities.manage, attendance.view, attendance.manage, schedule.view, schedule.manage, holiday.approve, owner.override, tasks.create, tasks.manage, tasks.view_all, tasks.verify, dailyops.view, leave.approve, leave.adjust, performance.manage, performance.sensitive, payroll.view, payroll.manage, announcements.manage, separation.manage, extras.manage, notes.manage, reports.view, acc.home, acc.daily, acc.money, acc.expense, acc.transfer, acc.vendor.purchase, acc.vendor.pay, acc.publisher.pay, acc.staffpay, acc.shareholders, acc.approve, acc.reports, acc.setup, month.close, books.view, books.sell, books.requisition, books.receive, books.approve, books.adjust, books.import, books.reports, cafe.view, cafe.count, cafe.receive, cafe.order, cafe.approve, cafe.setup, closing.day, settings.manage, setup.hr, setup.books, setup.tasks, users.manage, audit.view, backup.manage
