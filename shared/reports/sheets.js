// A report model (server/modules/reports.js) as an Excel workbook: one
// sheet, the report from top to bottom, with numbers as numbers and totals
// in bold. textOf turns a text into words in the reader's language (the
// phone's or the server's).
export function reportSheets(model, textOf) {
  const rows = [[{ v: textOf(model.title), bold: true }], ...model.sub.map((x) => [textOf(x)]), []];
  const value = (x) => (typeof x === 'number' ? x : x && typeof x === 'object' && 'n' in x ? x.n : textOf(x));
  for (const b of model.blocks) {
    if (b.kind === 'section') rows.push([], [{ v: textOf(b.title), bold: true }]);
    else if (b.kind === 'note') rows.push([textOf(b.text)]);
    else if (b.kind === 'kv') for (const r of b.rows) rows.push([{ v: textOf(r.label), bold: r.total }, { v: value(r.value), bold: r.total }]);
    else if (b.kind === 'table') {
      rows.push(b.columns.map((c) => ({ v: textOf(c.label), bold: true })), ...b.rows.map((row) => row.map(value)));
      if (b.total) rows.push(b.total.map((x) => ({ v: value(x), bold: true })));
    }
  }
  return [{ name: textOf(model.title), rows }];
}
