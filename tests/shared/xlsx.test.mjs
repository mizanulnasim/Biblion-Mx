// The Excel writer: a valid zip whose parts hold the cells.

import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { xlsx } from '../../shared/lib/xlsx.js';

// The zip's files, read back from its central directory, checked by CRC.
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const start = offset + 30 + view.getUint16(offset + 26, true);
    const data = bytes.subarray(start, start + size);
    assert.equal(zlib.crc32(data), crc, name);
    files[name] = new TextDecoder().decode(data);
    at += 46 + nameLength;
  }
  return files;
}

test('an Excel file: sheets, numbers as numbers, text escaped, bold totals', () => {
  const files = unzip(xlsx([{ name: 'Daily: report', rows: [['Name', 'Amount'], ['Rahim & Sons <x>', 1250.5], [{ v: 'Total', bold: true }, { v: 1250.5, bold: true }]] }, { name: 'Daily: report', rows: [] }]));
  assert.ok(files['xl/workbook.xml'].includes('name="Daily  report"'));
  assert.ok(files['xl/workbook.xml'].includes('name="Daily  report 2"'));
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.ok(sheet.includes('<c r="B2" s="2"><v>1250.5</v></c>'));
  assert.ok(sheet.includes('Rahim &amp; Sons &lt;x&gt;'));
  assert.ok(sheet.includes('<c r="A3" t="inlineStr" s="1">'));
  assert.ok(files['[Content_Types].xml'].includes('/xl/worksheets/sheet2.xml'));
});
