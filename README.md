# Biblion Management

Accounts, books, café, staff and documents for Biblion bookstore café, in English and Bangla.

This is version 2, a completely new app. It runs on free services only: Google Apps Script with Sheets for the server and data, and GitHub Pages for the app. It works on phones, can be installed as an app, and keeps working without a connection.

- `docs/DECISIONS.md` lists the owner's decisions. They win over the blueprint.
- `docs/BLUEPRINT.md` is the feature checklist.

## Install and check (one step)

You need [Node.js](https://nodejs.org) 22 or newer. There is nothing else to install: the project has no dependencies.

macOS or Linux:

```bash
./install.sh
```

Windows:

```bat
install.bat
```

The install step:
1. builds the app;
2. runs the hygiene check;
3. runs every test and reports the real pass and fail counts.

Add `--preview` to start the app afterwards.

## See the whole app on this computer

```bash
npm run preview
```

Open http://localhost:8080. The preview runs the real server code on a local stand-in for Google's services. Its data is kept in `.preview/` and never touches a real spreadsheet.

It starts with three users, so you can see each role:

| Username | Password |
|---|---|
| `owner` | `preview-owner` |
| `manager` | `preview-manager` |
| `staff` | `preview-staff` |

To try first-owner setup instead, start an empty preview with `npm run preview:fresh`. It prints the one-time setup code.

There is no text recognition on this computer, so the preview reads uploaded files only if you tell it what they say. For example:

```bash
curl -X POST localhost:8080/preview-ocr -d '{"name":"bill.jpg","text":"Milk Vita\nMemo No: 5521\nTotal 900\nCOD"}'
```

Photos are uploaded as `.jpg`.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Builds `dist/web` (the app) and `dist/gas` (the Apps Script project) |
| `npm run check` | Hygiene check (see below) |
| `npm test` | All tests |

## How the code is laid out

```
shared/        Rules used by both the browser and the server (no I/O)
  contract/    The list of API actions, error codes, the three write answers
  schema/      Roles and permissions, settings and their defaults
  lib/         Validation (per-field errors), list search
server/        Google Apps Script
  kernel/      Router: version check, sign-in, permission, payload check,
               write-once by op_id, activity log; paging; crypto
  store/       Tables over Google Sheets: version check on every edit,
               automatic activity log, text kept as text
  modules/     One file per area: setup, auth, meta, users, audit
  platform.js  The only file that touches Apps Script services
client/        The app (PWA)
  src/core/    API, router, state, language, dates, live updates
  src/offline/ Phone storage and sending entries saved offline
  src/ui/      Small components: html (escapes by default), forms,
               dialogs, lists with paging, toasts, page states
  src/pages/   One file per page
  styles/      tokens.css (the only colours) and app.css
locales/       Messages by id: en/ and bn/, one file per area
tools/         Build, bundler, hygiene check, install, preview, the
               stand-in for Google services
tests/         shared, server (the real bundle on the stand-in), client
```

## Rules the build enforces

`npm run check` fails the build on any of these:
- a source file nothing uses;
- an export nothing imports;
- `console.*` or `debugger` in shipped code;
- a colour value outside `tokens.css`;
- a message id that is:
  - unused or missing;
  - in only one language;
  - empty;
  - using different placeholders in each language;
  - left untranslated in Bangla;
- an action without a server handler, or the other way round.

## Offline

Each entry made offline goes to **Saved on this phone** and is sent later:
- **Only a "saved" answer removes an entry.** If the server asks a question, the entry stays until the person answers it.
- **Each entry carries an id that the server keeps for good,** so sending it twice never saves it twice.
- **Only one open tab sends at a time.**
- **Failed sends back off and are counted.**
- **An entry can wait for another entry it depends on.**
- **Signing out removes the person's copies of business data from the phone.**

Lists show "Figures from …" when they come from the phone's copy.

## Deploying (outline; a deploy command comes in a later milestone)

1. Build with the Apps Script address:
   ```bash
   node tools/build.mjs --api https://script.google.com/macros/s/…/exec
   ```
2. Push `dist/gas` to an Apps Script project with `clasp`. Deploy it as a web app that runs as you, with anyone allowed to access it (the app has its own sign-in). The project uses the Drive advanced service (v3) and asks to read and write your Drive and Docs (for keeping uploads and reading their text), and to reach other services (only for the optional Gemini reading).
3. In the script's Project Settings, add a Script Property `SETUP_CODE` with a one-time code of your choice.
4. In the script's Triggers page, add a time-driven trigger that runs `jobHourly` every hour. It makes repeating tasks and automatic requisition drafts, keeps salaries in step, and sends the shareholders' daily warnings email (from the account the script runs as; Google asks once for permission to send email).
5. Publish `dist/web` on GitHub Pages.
6. Open the app and create the first shareholder account with the code. The code is deleted once it has been used.
