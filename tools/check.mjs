// Hygiene check. Fails (exit 1) on:
//   - a source file that no build reaches (dead file)
//   - an export nothing imports (dead code)
//   - console.* or debugger in shipped code (one operational error log in
//     the server router is allowed)
//   - colour values outside client/styles/tokens.css
//   - message ids: unused, missing, only in one language, empty, different
//     placeholders between languages, or Bangla text with no Bangla in it
//   - an action without a handler, or a handler without an action
// Usage: node tools/check.mjs   (runs a build first)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LANGS, ROOT, build, loadLocale } from './build.mjs';

const problems = [];
const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

function walk(dir, ext) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function literals(code) {
  const out = new Set();
  // Message ids are always written in plain quotes. Template literals are
  // left out: their ${…} parts would make backtick pairs unreliable.
  // Each quote kind is scanned on its own, so an attribute value in double
  // quotes can't hide a single-quoted id inside it.
  for (const m of code.matchAll(/'((?:\\.|[^'\\\n])*)'/g)) out.add(m[1]);
  for (const m of code.matchAll(/"((?:\\.|[^"\\\n])*)"/g)) out.add(m[1]);
  return out;
}

function checkModules(result) {
  const shipped = [...result.client, ...result.server];
  const reached = new Set(shipped.map((m) => m.file));
  const sources = ['shared', 'server', path.join('client', 'src')].flatMap((d) => walk(path.join(ROOT, d), '.js'));
  for (const file of sources) if (!reached.has(file)) problems.push(`Dead file (no build reaches it): ${rel(file)}`);

  const imported = new Set();
  for (const mod of shipped) for (const imp of mod.imports) for (const n of imp.names) imported.add(`${imp.from}#${n.name}`);
  // An export a test imports is used too: a piece of shipped code exported so
  // a rule can be tested on its own (it must still be reached by a build).
  for (const file of walk(path.join(ROOT, 'tests'), '.mjs')) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const from = path.resolve(path.dirname(file), m[2]);
      for (const name of m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)) imported.add(`${from}#${name}`);
    }
  }
  const entries = new Set([path.join(ROOT, 'server', 'main.js')]);
  const seen = new Set();
  for (const mod of shipped) {
    if (seen.has(mod.file)) continue;
    seen.add(mod.file);
    if (entries.has(mod.file)) continue;
    for (const name of mod.exports) {
      if (!imported.has(`${mod.file}#${name}`)) problems.push(`Unused export '${name}' in ${rel(mod.file)}`);
    }
  }
  return [...seen].map((file) => ({ file, code: stripComments(fs.readFileSync(file, 'utf8')) }));
}

const CONSOLE_ALLOWED = { 'server/kernel/router.js': /console\.error\(/g };
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function checkCode(files) {
  const all = [...files, { file: path.join(ROOT, 'client', 'sw.js'), code: stripComments(read('client/sw.js')) }];
  for (const { file, code } of all) {
    const name = rel(file);
    let rest = code;
    if (CONSOLE_ALLOWED[name]) rest = rest.replace(CONSOLE_ALLOWED[name], '');
    if (/\bconsole\./.test(rest)) problems.push(`console.* in ${name}`);
    if (/\bdebugger\b/.test(code)) problems.push(`debugger in ${name}`);
  }
  // Colours: only the design tokens hold them. The brand accent default is
  // a setting value and lives with the settings.
  for (const { file, code } of all) {
    const name = rel(file);
    if (name === 'shared/schema/settings.js') continue;
    const withoutIds = code.replace(/#\/[\w/-]*/g, '').replace(/['"`]#[a-z][\w-]*['"`]/g, '');
    if (COLOUR.test(withoutIds.replace(/&#\d+;/g, ''))) problems.push(`Colour value in ${name} (use a token from tokens.css)`);
  }
  if (COLOUR.test(read('client/styles/app.css'))) problems.push('Colour value in client/styles/app.css (use a token from tokens.css)');
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

// Top-level placeholder names only: words inside plural branches
// ("{count, plural, one {waits} other {wait}}") are text, not placeholders.
function placeholders(text) {
  const names = new Set();
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) {
        const m = /^\{\s*([a-z_]+)\s*[,}]/.exec(text.slice(i));
        if (m) names.add(m[1]);
      }
      depth++;
    } else if (text[i] === '}') {
      depth--;
    }
  }
  return [...names].sort().join(',');
}

function checkMessages(files) {
  const locales = Object.fromEntries(LANGS.map((l) => [l, loadLocale(l)]));
  const en = locales.en;
  for (const lang of LANGS.slice(1)) {
    for (const key of Object.keys(en)) if (!(key in locales[lang])) problems.push(`Message ${key} has no ${lang} text`);
    for (const key of Object.keys(locales[lang])) if (!(key in en)) problems.push(`Message ${key} is in ${lang} but not en`);
  }
  for (const lang of LANGS) {
    for (const [key, text] of Object.entries(locales[lang])) {
      if (typeof text !== 'string' || !text.trim()) problems.push(`Message ${key} is empty in ${lang}`);
      else if (lang !== 'en' && key in en && placeholders(text) !== placeholders(en[key])) {
        problems.push(`Message ${key}: placeholders differ between en and ${lang}`);
      }
    }
  }
  for (const [key, text] of Object.entries(locales.bn)) {
    if (typeof text === 'string' && /[A-Za-z]{3}/.test(text.replace(/\{[^}]*\}/g, '')) && !/[ঀ-৿]/.test(text)) {
      problems.push(`Message ${key} looks untranslated in bn`);
    }
  }
  const used = new Set();
  for (const { code } of files) for (const lit of literals(code)) used.add(lit);
  for (const key of Object.keys(en)) if (!used.has(key)) problems.push(`Unused message id ${key}`);
  for (const { file, code } of files) {
    for (const m of code.matchAll(/\bt\(\s*'([^']+)'/g)) {
      if (!(m[1] in en)) problems.push(`Missing message id ${m[1]} (${rel(file)})`);
    }
  }
}

async function checkActions() {
  const { ACTIONS } = await import(pathToFileURL(path.join(ROOT, 'shared/contract/actions.js')));
  const { HANDLERS } = await import(pathToFileURL(path.join(ROOT, 'server/modules/index.js')));
  for (const name of Object.keys(ACTIONS)) if (!HANDLERS[name]) problems.push(`Action ${name} has no handler`);
  for (const name of Object.keys(HANDLERS)) if (!ACTIONS[name]) problems.push(`Handler ${name} is not in the action list`);
}

export async function check() {
  problems.length = 0;
  const result = build();
  const files = checkModules(result);
  checkCode(files);
  checkMessages(files);
  await checkActions();
  return problems.slice();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = await check();
  if (found.length) {
    process.stderr.write(`Hygiene check failed (${found.length}):\n${found.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('Hygiene check passed.\n');
}
