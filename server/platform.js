// The only file that touches Google Apps Script services. Everything else
// goes through these functions, so the local preview can run the same bundle
// against tools/gas-shim.

/* global PropertiesService, LockService, SpreadsheetApp, Utilities, ContentService */

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

// Runs fn while holding the script lock, so writes never interleave.
export function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return null;
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

export function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
