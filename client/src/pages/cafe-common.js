// Pieces shared by the café pages.

import { getLang } from '../core/i18n.js';
import { localDigits } from '../core/i18n.js';

// An item's name in the reader's language, when it has one.
export function itemName(item) {
  return getLang() === 'bn' && item.name_bn ? item.name_bn : item.name;
}

// A quantity with its unit: "2.5 kg".
export function qtyUnit(qty, unit) {
  return `${localDigits(Math.round(qty * 100) / 100)} ${unit}`;
}
