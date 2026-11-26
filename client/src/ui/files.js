// Files on the phone before upload: photos made smaller, several photos
// joined into one PDF, and the bytes turned into text for the request.

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;

export function isImage(file) {
  return /^image\//.test(file.type);
}

async function bytesOf(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

// A photo at most 1600 px on its longer side, as JPEG: {bytes, width, height}.
export async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  return { bytes: await bytesOf(blob), width, height };
}

// One A4 PDF with a JPEG photo on each page, fitted with a margin.
export function photosToPdf(photos) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n, body, stream) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };
  const pageW = 595;
  const pageH = 842;
  const margin = 24;
  push('%PDF-1.4\n');
  const kids = photos.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${photos.length} >>`);
  photos.forEach((p, i) => {
    const page = 3 + i * 3;
    const scale = Math.min((pageW - 2 * margin) / p.width, (pageH - 2 * margin) / p.height);
    const w = (p.width * scale).toFixed(2);
    const h = (p.height * scale).toFixed(2);
    const x = ((pageW - p.width * scale) / 2).toFixed(2);
    const y = ((pageH - p.height * scale) / 2).toFixed(2);
    const content = enc.encode(`q ${w} 0 0 ${h} ${x} ${y} cm /Im Do Q`);
    object(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>`);
    object(page + 1, `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>`, p.bytes);
    object(page + 2, `<< /Length ${content.length} >>`, content);
  });
  const count = 3 + photos.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export async function fileBytes(file) {
  return bytesOf(file);
}

export function toBase64(bytes) {
  let text = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) text += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(text);
}

// A link the browser can show (an image, a PDF) for base64 data.
export function dataUrl(mime, base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

// Files shared into the app from another app (Android Share), kept by the
// service worker until the upload page picks them up.
export async function takeSharedFiles() {
  if (!('caches' in window)) return [];
  const cache = await caches.open('bm-shared');
  const files = [];
  for (const request of await cache.keys()) {
    const res = await cache.match(request);
    files.push(new File([await res.blob()], decodeURIComponent(res.headers.get('X-Name') || 'shared'), { type: res.headers.get('Content-Type') || '' }));
    await cache.delete(request);
  }
  return files;
}

// Files dropped anywhere on the app wait here for the upload page.
let dropped = [];

export function holdDropped(files) {
  dropped = [...files];
}

export function takeDropped() {
  const files = dropped;
  dropped = [];
  return files;
}
