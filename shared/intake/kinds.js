// What an uploaded document can be, for now, and what Confirm makes of it.
//   target   money: a money entry (its kind chosen on the check screen
//            from `kinds`); delivery: a book delivery; shift: the daily
//            shift form, filled from a Loyverse shift report; none: the
//            file is kept
//   ai       the optional Gemini reading may be used (receipts and bills
//            only; never staff papers)
// Staff papers, statements, the Loyverse import and customer cards are
// added with their milestones.

export const INTAKE_KINDS = Object.freeze({
  expense: { label: 'intake.kind.expense', target: 'money', kinds: ['expense'], ai: true },
  utility_bill: { label: 'intake.kind.utility_bill', target: 'money', kinds: ['expense'], ai: true },
  vendor_bill: { label: 'intake.kind.vendor_bill', target: 'money', kinds: ['vendor_purchase_credit', 'vendor_purchase_paid'], ai: true },
  payment_receipt: { label: 'intake.kind.payment_receipt', target: 'money', kinds: ['vendor_payment', 'publisher_payment', 'expense', 'income', 'transfer'], ai: true },
  courier_slip: { label: 'intake.kind.courier_slip', target: 'money', kinds: ['expense'], ai: true },
  shift_report: { label: 'intake.kind.shift_report', target: 'shift', kinds: [], ai: false },
  book_delivery: { label: 'intake.kind.book_delivery', target: 'delivery', kinds: [], ai: false },
  other: { label: 'intake.kind.other', target: 'none', kinds: [], ai: false },
});

export const UPLOAD_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv', 'text/plain']);

// The largest file the server takes: a 10 MB PDF, sent as base64.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
