// A change number per area (core, money, books, café, hr…). Clients poll
// these and redraw only the pages of an area that moved.

import { getProp, setProp } from '../platform.js';

const AREAS = Object.freeze(['core', 'money', 'books', 'intake']);

export function bumpArea(area) {
  const key = `AREA_${area}`;
  setProp(key, Number(getProp(key) || 0) + 1);
}

export function areaVersions() {
  const out = {};
  for (const area of AREAS) out[area] = Number(getProp(`AREA_${area}`) || 0);
  return out;
}
