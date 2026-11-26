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

export function emptyState() {
  return { props: {}, books: {} };
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
      newBlob: (text) => ({ getBytes: () => signed(Buffer.from(text, 'utf8')) }),
      computeHmacSha256Signature: (value, key) => signed(crypto.createHmac('sha256', unsigned(key)).update(unsigned(value)).digest()),
      computeDigest: (alg, text) => signed(crypto.createHash(alg).update(text, 'utf8').digest()),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        const out = { getContent: () => content, setMimeType: () => out };
        return out;
      },
    },
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
