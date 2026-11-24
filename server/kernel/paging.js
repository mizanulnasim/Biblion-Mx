// One page of a list, newest first, searched across every entry.

import { matcher } from '../../shared/lib/search.js';
import { PAGE_SIZES } from '../../shared/contract/actions.js';

export function page(rows, query, textOf) {
  const match = matcher(query.q);
  const found = (match ? rows.filter((r) => match(textOf(r))) : rows.slice())
    .sort((a, b) => (a.created_at === b.created_at ? b._row - a._row : a.created_at < b.created_at ? 1 : -1));
  const limit = query.limit || PAGE_SIZES[0];
  const offset = Math.min(query.offset || 0, Math.max(0, found.length - 1));
  const start = offset - (offset % limit);
  return { items: found.slice(start, start + limit), total: found.length, offset: start, limit };
}
