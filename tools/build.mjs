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
import { bundle, bundleApp } from './bundle.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LANGS = ['en', 'bn'];
import { SETTINGS } from '../shared/schema/settings.js';

// Biblion's colour: everyone's starting accent, the browser bar and the splash.
const BRAND_ACCENT = SETTINGS.accent.start;
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

    // Every page the app has, read from its declaration (path, title and
    // permission come first); its code loads when the page is first opened.
    const PAGE = /export const (\w+Page) = \{\s*path: '([^']+)',\s*title: '([^']+)',(?:\s*perm: '([^']+)',)?/g;
    const pagesDir = path.join(ROOT, 'client', 'src', 'pages');
    const declared = fs.readdirSync(pagesDir).sort().flatMap((f) => [...read(`client/src/pages/${f}`).matchAll(PAGE)]
      .map((m) => ({ file: path.join(pagesDir, f), name: m[1], path: m[2], title: m[3], perm: m[4] || '' })));
    const app = bundleApp('client/src/main.js', [...new Set(declared.map((d) => d.file))]);
    const js = emit('app', 'js', app.core.code);
    fs.mkdirSync(path.join(web, 'pages'), { recursive: true });
    const chunkFile = new Map(app.chunks.map((c) => [c.file, emit(`pages/${path.basename(c.file, '.js')}`, 'js', c.code)]));
    const routes = declared.map((d) => ({
      path: d.path, title: d.title, perm: d.perm, name: d.name,
      module: path.relative(ROOT, d.file).split(path.sep).join('/'), chunk: chunkFile.get(d.file) || '',
    }));
    const client = { modules: [...app.core.modules, ...app.chunks.flatMap((c) => c.modules)] };
    const css = emit('app', 'css', `${read('client/styles/tokens.css')}\n${read('client/styles/app.css')}`);
    const locales = {};
    for (const lang of LANGS) locales[lang] = emit(`locales/${lang}`, 'json', JSON.stringify(loadLocale(lang)));

    const assets = fs.readdirSync(path.join(ROOT, 'assets')).sort().map((f) => {
      fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(web, 'assets', f));
      return `assets/${f}`;
    });

    const id = hash(hashed.join('|') + assets.join('|') + read('client/sw.js') + read('client/index.html'));
    const buildInfo = { id, locales, routes };
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
    // The messages, for the emails the server writes (server/kernel/i18n.js).
    const serverLocales = Object.fromEntries(LANGS.map((lang) => [lang, loadLocale(lang)]));
    // The logo, for the letterhead of month-end PDFs (server/modules/report-files.js).
    const logo = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'assets/biblion-logo.png')).toString('base64')}`;
    // The light theme's design tokens, for the same PDFs' colours and fonts.
    const root = /:root\s*\{([^}]*)\}/.exec(read('client/styles/tokens.css'))[1];
    const tokens = Object.fromEntries([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    fs.writeFileSync(path.join(gas, 'Code.js'), `var BIBLION_LOCALES = ${JSON.stringify(serverLocales)};\nvar BIBLION_LOGO = ${JSON.stringify(logo)};\nvar BIBLION_TOKENS = ${JSON.stringify(tokens)};\n${server.code}`);
    fs.copyFileSync(path.join(ROOT, 'server/appsscript.json'), path.join(gas, 'appsscript.json'));

    return { id, web, gas, client: client.modules, server: server.modules, routes };
  } finally {
    process.chdir(cwd);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--api');
  const result = build({ apiUrl: i > 0 ? process.argv[i + 1] : '/api' });
  process.stdout.write(`Built ${result.id}: ${path.relative(ROOT, result.web)} and ${path.relative(ROOT, result.gas)}\n`);
}
