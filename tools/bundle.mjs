// A small bundler for this project's own module style:
//   import { a, b as c } from './x.js';   (no default or namespace imports)
//   export function f() {}  export async function f() {}
//   export const X = …      export class C {}
// Each module becomes a function scope that returns its exports; modules are
// evaluated in dependency order. Import cycles are refused.

import fs from 'node:fs';
import path from 'node:path';

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const EXPORT = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

function parseModule(file) {
  const source = fs.readFileSync(file, 'utf8');
  const imports = [];
  let body = source.replace(IMPORT, (_, names, from) => {
    const list = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => {
      const [name, alias] = n.split(/\s+as\s+/);
      return { name: name.trim(), local: (alias || name).trim() };
    });
    imports.push({ from: path.resolve(path.dirname(file), from), names: list });
    return '';
  });
  const exports = [];
  body = body.replace(EXPORT, (match, name) => {
    exports.push(name);
    return match.replace(/^export\s+/, '');
  });
  const stray = body.match(/^\s*(import|export)\b.*$/m);
  if (stray) throw new Error(`${file}: unsupported module syntax: ${stray[0].trim()}`);
  return { file, source, body, imports, exports };
}

// Returns modules in evaluation order (dependencies first).
export function collect(entry) {
  const order = [];
  const state = new Map();
  function visit(file, trail) {
    if (state.get(file) === 'done') return;
    if (state.get(file) === 'visiting') {
      throw new Error(`Import cycle: ${[...trail, file].map((f) => path.relative(process.cwd(), f)).join(' → ')}`);
    }
    if (!fs.existsSync(file)) throw new Error(`Missing module ${file} (imported by ${trail[trail.length - 1]})`);
    state.set(file, 'visiting');
    const mod = parseModule(file);
    for (const imp of mod.imports) visit(imp.from, [...trail, file]);
    state.set(file, 'done');
    order.push(mod);
  }
  visit(path.resolve(entry), []);
  for (const mod of order) {
    for (const imp of mod.imports) {
      const target = order.find((m) => m.file === imp.from);
      for (const n of imp.names) {
        if (!target.exports.includes(n.name)) throw new Error(`${mod.file}: '${n.name}' is not exported by ${imp.from}`);
      }
    }
  }
  return order;
}

// format 'browser': one IIFE. format 'gas': top-level code plus a global
// function for each export of the entry module (doGet, doPost…).
export function bundle(entry, format) {
  const modules = collect(entry);
  const ids = new Map(modules.map((m, i) => [m.file, `__m${i}`]));
  const parts = modules.map((m) => {
    const head = m.imports
      .map((imp) => `const { ${imp.names.map((n) => (n.name === n.local ? n.name : `${n.name}: ${n.local}`)).join(', ')} } = ${ids.get(imp.from)};`)
      .join('\n');
    const rel = path.relative(process.cwd(), m.file).split(path.sep).join('/');
    return `// ${rel}\nconst ${ids.get(m.file)} = (function () {\n${head}\n${m.body.trim()}\nreturn Object.freeze({ ${m.exports.join(', ')} });\n})();`;
  });
  const entryMod = modules[modules.length - 1];
  let code = `'use strict';\n${parts.join('\n\n')}\n`;
  if (format === 'gas') {
    for (const name of entryMod.exports) {
      code += `\nfunction ${name}(...args) {\n  return ${ids.get(entryMod.file)}.${name}(...args);\n}\n`;
    }
  } else {
    code = `(function () {\n${code}})();\n`;
  }
  return { code, modules };
}

// The app in pieces, so a page's code loads only when the page is opened:
//   core    the entry's modules, plus every module two or more pages share;
//   chunks  one per page module, holding the modules only that page uses.
// Core modules are registered on window.__bm.m (by path), and a chunk takes
// what it needs from there; a loaded chunk puts its page module's exports
// on window.__bm.pages.
export function bundleApp(entry, pageFiles) {
  const relOf = (file) => path.relative(process.cwd(), file).split(path.sep).join('/');
  const closure = (roots) => {
    const order = [];
    const seen = new Set();
    for (const root of roots) for (const m of collect(root)) if (!seen.has(m.file)) { seen.add(m.file); order.push(m); }
    return order;
  };
  let coreRoots = [path.resolve(entry)];
  let core;
  let chunkMods;
  // Grow the core until no module is left shared between pages.
  for (;;) {
    core = closure(coreRoots);
    const inCore = new Set(core.map((m) => m.file));
    chunkMods = pageFiles.filter((f) => !inCore.has(path.resolve(f)))
      .map((f) => ({ file: path.resolve(f), modules: collect(f).filter((m) => !inCore.has(m.file)) }));
    const uses = new Map();
    for (const c of chunkMods) for (const m of c.modules) uses.set(m.file, (uses.get(m.file) || 0) + 1);
    const shared = [...uses].filter(([, n]) => n > 1).map(([f]) => f);
    if (!shared.length) break;
    coreRoots = [...coreRoots, ...shared];
  }
  const coreFiles = new Set(core.map((m) => m.file));
  const ids = new Map(core.map((m, i) => [m.file, `__m${i}`]));
  const unit = (m, local) => {
    const head = m.imports.map((imp) => {
      const names = imp.names.map((n) => (n.name === n.local ? n.name : `${n.name}: ${n.local}`)).join(', ');
      return `const { ${names} } = ${local.has(imp.from) ? local.get(imp.from) : `__bm.m['${relOf(imp.from)}']`};`;
    }).join('\n');
    return `// ${relOf(m.file)}\nconst ${local.get(m.file)} = (function () {\n${head}\n${m.body.trim()}\nreturn Object.freeze({ ${m.exports.join(', ')} });\n})();`;
  };
  const coreCode = `(function () {\n'use strict';\nconst __bm = (window.__bm = window.__bm || { m: {}, pages: {} });\n${
    core.map((m) => `${unit(m, ids)}\n__bm.m['${relOf(m.file)}'] = ${ids.get(m.file)};`).join('\n\n')}\n})();\n`;
  const chunks = chunkMods.map((c) => {
    const local = new Map(c.modules.map((m, i) => [m.file, `__c${i}`]));
    const body = c.modules.map((m) => unit(m, local)).join('\n\n');
    return {
      file: c.file,
      modules: c.modules,
      code: `(function () {\n'use strict';\nconst __bm = window.__bm;\n${body}\n__bm.pages['${relOf(c.file)}'] = ${local.get(c.file)};\n})();\n`,
    };
  });
  return { core: { code: coreCode, modules: core }, chunks, coreFiles };
}
