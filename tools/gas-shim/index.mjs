// A fake of the Google Apps Script services the server uses, for the local
// preview and the tests. It runs the real server bundle (dist/gas/Code.js) in
// a sandbox. State is a plain object that the caller may save to disk.
//
// Like real Sheets, a cell whose format is not plain text ('@') turns a
// number-looking string into a number, so a missing text format shows up
// here as it would in production.

import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const unsigned = (bytes) => Buffer.from(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes.map((b) => b & 255));

function makeRange(sheet, row, col, rows, cols) {
  const cells = sheet.cells;
  const range = {
    getRow: () => row,
    getValues() {
      const out = [];
      for (let r = 0; r < rows; r++) {
        const line = cells[row - 1 + r] || [];
        const values = [];
        for (let c = 0; c < cols; c++) {
          const v = line[col - 1 + c];
          values.push(v === undefined || v === null ? '' : v);
        }
        out.push(values);
      }
      return out;
    },
    setValues(values) {
      values.forEach((line, r) => {
        const target = cells[row - 1 + r] || (cells[row - 1 + r] = []);
        const formats = (sheet.formats[row - 1 + r] || []);
        line.forEach((v, c) => {
          const plain = formats[col - 1 + c] === '@';
          target[col - 1 + c] = !plain && typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
        });
      });
      for (let r = 0; r < cells.length; r++) if (!cells[r]) cells[r] = [];
      return range;
    },
    setNumberFormats(formats) {
      formats.forEach((line, r) => {
        const target = sheet.formats[row - 1 + r] || (sheet.formats[row - 1 + r] = []);
        line.forEach((f, c) => { target[col - 1 + c] = f; });
      });
      for (let r = 0; r < sheet.formats.length; r++) if (!sheet.formats[r]) sheet.formats[r] = [];
      return range;
    },
    createTextFinder(text) {
      let whole = false;
      const finder = {
        matchEntireCell(flag) { whole = flag; return finder; },
        findNext() {
          const values = range.getValues();
          for (let r = 0; r < values.length; r++) {
            for (let c = 0; c < values[r].length; c++) {
              const v = String(values[r][c]);
              if (whole ? v === text : v.includes(text)) return makeRange(sheet, row + r, col + c, 1, 1);
            }
          }
          return null;
        },
      };
      return finder;
    },
  };
  return range;
}

function makeSheet(sheet) {
  return {
    getLastRow() {
      for (let r = sheet.cells.length; r > 0; r--) {
        if ((sheet.cells[r - 1] || []).some((v) => v !== '' && v !== undefined && v !== null)) return r;
      }
      return 0;
    },
    getLastColumn() {
      return sheet.cells.reduce((max, line) => Math.max(max, (line || []).length), 0);
    },
    getRange: (row, col, rows = 1, cols = 1) => makeRange(sheet, row, col, rows, cols),
  };
}

function makeSpreadsheet(id, book) {
  return {
    getId: () => id,
    getSheetByName: (name) => (book.sheets[name] ? makeSheet(book.sheets[name]) : null),
    insertSheet(name) {
      book.sheets[name] = { cells: [], formats: [] };
      return makeSheet(book.sheets[name]);
    },
  };
}

// state.files: Drive files {name, mime, data (base64), trashed}.
// state.ocr: text that "text reading" returns for a file name (tests and
// preview set it; there is no real text recognition on this computer).
// state.fetch: replies for UrlFetchApp by URL start, or none (no network).
export function emptyState() {
  return { props: {}, books: {}, files: {}, ocr: {}, fetch: {}, mails: [] };
}

function blob(bytes, mime, name) {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : unsigned(bytes);
  return {
    getBytes: () => signed(buf),
    getDataAsString: () => buf.toString('utf8'),
    getContentType: () => mime,
    getName: () => name,
    _buf: buf,
  };
}

function driveServices(state) {
  state.files = state.files || {};
  state.ocr = state.ocr || {};
  state.fetch = state.fetch || {};
  const file = (id) => {
    const f = state.files[id];
    if (!f) throw new Error(`No file ${id}`);
    return {
      getId: () => id,
      getBlob: () => blob(signed(Buffer.from(f.data, 'base64')), f.mime, f.name),
      setTrashed: (v) => { f.trashed = v; },
    };
  };
  const folder = (id) => ({
    getId: () => id,
    createFolder: (name) => folder(`FOLDER-${name}-${crypto.randomUUID().slice(0, 8)}`),
    createFile: (b) => {
      const fid = `FILE-${crypto.randomUUID()}`;
      state.files[fid] = { name: b.getName(), mime: b.getContentType(), data: b._buf.toString('base64'), trashed: false, folder: id };
      return file(fid);
    },
  });
  return {
    DriveApp: {
      createFolder: (name) => folder(`FOLDER-${name}`),
      getFolderById: (id) => folder(id),
      getFileById: (id) => file(id),
    },
    Drive: {
      Files: {
        create(meta, b) {
          const id = `DOC-${crypto.randomUUID()}`;
          state.files[id] = { name: meta.name, mime: meta.mimeType, data: Buffer.from(state.ocr[b.getName()] || '', 'utf8').toString('base64'), trashed: false };
          return { id };
        },
      },
    },
    DocumentApp: {
      openById: (id) => ({ getBody: () => ({ getText: () => Buffer.from(state.files[id].data, 'base64').toString('utf8') }) }),
    },
    UrlFetchApp: {
      fetch(url) {
        const key = Object.keys(state.fetch).find((k) => url.startsWith(k));
        if (!key) throw new Error('No network on this computer');
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(state.fetch[key]) };
      },
    },
  };
}

export function gasGlobals(state) {
  return {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in state.props ? state.props[k] : null),
        setProperty: (k, v) => { state.props[k] = String(v); },
        deleteProperty: (k) => { delete state.props[k]; },
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    // Emails are kept, not sent.
    MailApp: { sendEmail: (mail) => { (state.mails ||= []).push(mail); } },
    SpreadsheetApp: {
      openById(id) {
        if (!state.books[id]) throw new Error(`No spreadsheet ${id}`);
        return makeSpreadsheet(id, state.books[id]);
      },
      create(name) {
        const id = `SS-${crypto.randomUUID()}`;
        state.books[id] = { name, sheets: {} };
        return makeSpreadsheet(id, state.books[id]);
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      newBlob: (data, mime = 'text/plain', name = '') => blob(data, mime, name),
      base64Decode: (text) => signed(Buffer.from(text, 'base64')),
      base64Encode: (bytes) => unsigned(bytes).toString('base64'),
      computeHmacSha256Signature: (value, key) => signed(crypto.createHmac('sha256', unsigned(key)).update(unsigned(value)).digest()),
      computeDigest: (alg, data) => signed(crypto.createHash(alg).update(typeof data === 'string' ? Buffer.from(data, 'utf8') : unsigned(data)).digest()),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        const out = { getContent: () => content, setMimeType: () => out };
        return out;
      },
    },
    ...driveServices(state),
    console,
  };
}

// Loads the server bundle into a sandbox that shares `state`.
export function loadServer(bundlePath, state) {
  const context = vm.createContext(gasGlobals(state));
  vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), context, { filename: 'Code.js' });
  return {
    post: (body) => JSON.parse(context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent()),
    get: () => JSON.parse(context.doGet().getContent()),
    job: () => context.jobHourly(),
  };
}
