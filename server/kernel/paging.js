// One page of a list, newest first, searched across every entry.

import { matcher } from '../../shared/lib/search.js';
import { PAGE_SIZES } from '../../shared/contract/actions.js';

// keyOf gives the sort key; largest first (newest first), or smallest first
// with `ascending` (A to Z). Ties fall back to row order.
export function page(rows, query, textOf, keyOf = (r) => r.created_at, ascending = false) {
  const match = matcher(query.q);
  const found = (match ? rows.filter((r) => match(textOf(r))) : rows.slice())
    .sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka === kb) return ascending ? a._row - b._row : b._row - a._row;
      return (ka < kb ? 1 : -1) * (ascending ? -1 : 1);
    });
  const limit = query.limit || PAGE_SIZES[0];
  const offset = Math.min(query.offset || 0, Math.max(0, found.length - 1));
  const start = offset - (offset % limit);
  return { items: found.slice(start, start + limit), total: found.length, offset: start, limit };
}
