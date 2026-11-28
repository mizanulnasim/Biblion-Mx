// The only file that touches Google Apps Script services. Everything else
// goes through these functions, so the local preview can run the same bundle
// against tools/gas-shim.

/* global PropertiesService, LockService, SpreadsheetApp, Utilities, ContentService, MailApp, CacheService */

const props = () => PropertiesService.getScriptProperties();

export function getProp(key) {
  return props().getProperty(key);
}

export function setProp(key, value) {
  props().setProperty(key, String(value));
}

export function deleteProp(key) {
  props().deleteProperty(key);
}

// Every script property at once (one call).
export function allProps() {
  return props().getProperties();
}

// The script cache: values by key, kept up to `seconds`.
export function cacheGetAll(keys) {
  return CacheService.getScriptCache().getAll(keys);
}

export function cachePutAll(values, seconds) {
  CacheService.getScriptCache().putAll(values, seconds);
}

// Runs fn while holding the script lock, so writes never interleave.
export function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return null;
  try {
    return { value: fn() };
  } finally {
    lock.releaseLock();
  }
}

export function openSpreadsheet(id) {
  return SpreadsheetApp.openById(id);
}

export function createSpreadsheet(name) {
  return SpreadsheetApp.create(name);
}

export function uuid() {
  return Utilities.getUuid();
}

export function utf8Bytes(text) {
  return Utilities.newBlob(text).getBytes();
}

export function hmacSha256(valueBytes, keyBytes) {
  return Utilities.computeHmacSha256Signature(valueBytes, keyBytes);
}

export function sha256Bytes(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
}

// An email from the Google account the app runs on (free, within Gmail's
// daily limit).
// attachments: [{name, mime, bytes}].
export function sendMail(to, subject, body, attachments = []) {
  MailApp.sendEmail({ to, subject, body, attachments: attachments.map((a) => Utilities.newBlob(a.bytes, a.mime, a.name)) });
}

// A PDF of an HTML page, made by Google.
export function htmlToPdf(html, name) {
  return Utilities.newBlob(html, 'text/html', `${name}.html`).getAs('application/pdf').getBytes();
}

export function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

// ---- Files on Google Drive -------------------------------------------------

/* global DriveApp, Drive, DocumentApp, UrlFetchApp */

export function base64ToBytes(text) {
  return Utilities.base64Decode(text);
}

export function bytesToBase64(bytes) {
  return Utilities.base64Encode(bytes);
}

export function sha256Hex(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map((b) => ((b & 255) + 256).toString(16).slice(1)).join('');
}

// The folder for a path like "uploads/2026-11", made on first use under
// the app's root folder; ids are remembered in Script Properties.
export function folderFor(path) {
  const cached = getProp(`FOLDER:${path}`);
  if (cached) return cached;
  let parentId = getProp('FOLDER_ROOT');
  if (!parentId) {
    parentId = DriveApp.createFolder('Biblion files').getId();
    setProp('FOLDER_ROOT', parentId);
  }
  let walked = '';
  for (const part of path.split('/')) {
    walked = walked ? `${walked}/${part}` : part;
    const known = getProp(`FOLDER:${walked}`);
    parentId = known || DriveApp.getFolderById(parentId).createFolder(part).getId();
    if (!known) setProp(`FOLDER:${walked}`, parentId);
  }
  return parentId;
}

export function saveFile(folderId, name, mime, bytes) {
  return DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, mime, name)).getId();
}

export function fileBytes(id) {
  return DriveApp.getFileById(id).getBlob().getBytes();
}

// The text in a file: as it is for text files; otherwise read by Google
// Drive (a temporary Google Doc made with text recognition, then deleted).
export function readText(id, mime) {
  const blob = DriveApp.getFileById(id).getBlob();
  if (mime.startsWith('text/')) return blob.getDataAsString();
  const doc = Drive.Files.create({ name: `read-${id}`, mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'bn' });
  try {
    return DocumentApp.openById(doc.id).getBody().getText();
  } finally {
    DriveApp.getFileById(doc.id).setTrashed(true);
  }
}

// A JSON POST to another service (the optional Gemini reading).
export function postJson(url, body) {
  const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  return { status: res.getResponseCode(), body: JSON.parse(res.getContentText() || 'null') };
}
