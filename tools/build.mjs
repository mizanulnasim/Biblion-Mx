// Builds the app.
//   dist/web  the PWA for GitHub Pages: hashed script, styles and locales,
//             index.html, config.js, the manifest, and a service worker whose
//             file list comes from this build (not rewritten afterwards)
//   dist/gas  the Apps Script project: one Code.js and appsscript.json
// Usage: node tools/build.mjs [--api <Apps Script /exec URL>]

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LANGS = ['en', 'bn'];
const BRAND_ACCENT = '#4f46e5';
const ICON_BACKGROUND = '#ffffff';

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 10);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Every namespace file of a language, merged into one object.
export function loadLocale(lang) {
  const dir = path.join(ROOT, 'locales', lang);
  const merged = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const part = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const key of Object.keys(part)) {
      if (key in merged) throw new Error(`Message id ${key} is defined twice in locales/${lang}`);
      merged[key] = part[key];
    }
  }
  return merged;
}

function manifest() {
  return JSON.stringify({
    name: 'Biblion Management',
    short_name: 'Biblion',
    description: 'Accounts, books, café, staff and documents for Biblion bookstore café',
    start_url: './#/',
    scope: './',
    display: 'standalone',
    orientation: 'any',
    background_color: ICON_BACKGROUND,
    theme_color: BRAND_ACCENT,
    share_target: {
      action: './share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', files: [{ name: 'file', accept: ['image/*', 'application/pdf', 'text/csv', '.csv'] }] },
    },
    icons: [
      { src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2);
}

export function build({ apiUrl = '/api', outDir = path.join(ROOT, 'dist') } = {}) {
  const cwd = process.cwd();
  process.chdir(ROOT);
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
    const web = path.join(outDir, 'web');
    const gas = path.join(outDir, 'gas');
    fs.mkdirSync(path.join(web, 'locales'), { recursive: true });
    fs.mkdirSync(path.join(web, 'assets'), { recursive: true });
    fs.mkdirSync(gas, { recursive: true });

    const hashed = [];
    const emit = (name, ext, text) => {
      const file = `${name}.${hash(text)}.${ext}`;
      fs.writeFileSync(path.join(web, file), text);
      hashed.push(file);
      return file;
    };

    const client = bundle('client/src/main.js', 'browser');
    const js = emit('app', 'js', client.code);
    const css = emit('app', 'css', `${read('client/styles/tokens.css')}\n${read('client/styles/app.css')}`);
    const locales = {};
    for (const lang of LANGS) locales[lang] = emit(`locales/${lang}`, 'json', JSON.stringify(loadLocale(lang)));

    const assets = fs.readdirSync(path.join(ROOT, 'assets')).sort().map((f) => {
      fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(web, 'assets', f));
      return `assets/${f}`;
    });

    const id = hash(hashed.join('|') + assets.join('|') + read('client/sw.js') + read('client/index.html'));
    const buildInfo = { id, locales };
    fs.writeFileSync(path.join(web, 'index.html'), read('client/index.html')
      .replace('{{THEME_COLOR}}', BRAND_ACCENT)
      .replace('{{CSS}}', css)
      .replace('{{JS}}', js)
      .replace('{{BUILD_JSON}}', JSON.stringify(buildInfo)));
    fs.writeFileSync(path.join(web, 'config.js'), `window.BIBLION_CONFIG = ${JSON.stringify({ API_URL: apiUrl })};\n`);
    fs.writeFileSync(path.join(web, 'manifest.webmanifest'), manifest());

    const shell = ['', 'index.html', 'config.js', 'manifest.webmanifest', ...hashed, ...assets];
    fs.writeFileSync(path.join(web, 'sw.js'), `self.BUILD = ${JSON.stringify({ id, shell, hashed })};\n${read('client/sw.js')}`);

    const server = bundle('server/main.js', 'gas');
    fs.writeFileSync(path.join(gas, 'Code.js'), server.code);
    fs.copyFileSync(path.join(ROOT, 'server/appsscript.json'), path.join(gas, 'appsscript.json'));

    return { id, web, gas, client: client.modules, server: server.modules };
  } finally {
    process.chdir(cwd);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--api');
  const result = build({ apiUrl: i > 0 ? process.argv[i + 1] : '/api' });
  process.stdout.write(`Built ${result.id}: ${path.relative(ROOT, result.web)} and ${path.relative(ROOT, result.gas)}\n`);
}
