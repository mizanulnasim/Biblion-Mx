// Picking a title by typing: a list of suggestions that narrows as you
// type ("Title · Author · Publisher"), turned back into the book's id.

import { html } from '../ui/html.js';

export function bookLabel(b) {
  return [b.title, b.author, b.publisher].filter(Boolean).join(' · ');
}

// The suggestions for every book input on the page (one list, shared).
export function bookList(books, publishers) {
  const names = new Map(publishers.map((p) => [p.id, p.name]));
  return html`<datalist id="book-titles">${books.map((b) => html`<option value="${bookLabel({ ...b, publisher: names.get(b.publisher_id) })}"></option>`)}</datalist>`;
}

// The book a typed label stands for, or null.
export function findBook(label, books, publishers) {
  const names = new Map(publishers.map((p) => [p.id, p.name]));
  const text = String(label || '').trim();
  return books.find((b) => bookLabel({ ...b, publisher: names.get(b.publisher_id) }) === text)
    || books.find((b) => b.title.toLowerCase() === text.toLowerCase()) || null;
}
