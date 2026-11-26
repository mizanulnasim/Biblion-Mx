// The whole app on this computer: the PWA from dist/web, and /api answered
// by the real server bundle (dist/gas/Code.js) running on the fake Google
// services in tools/gas-shim. Data lives in .preview/state.json, never in a
// real spreadsheet.
//
//   node tools/preview.mjs            sample users ready to sign in
//   node tools/preview.mjs --fresh    empty, shows first-owner setup
//   node tools/preview.mjs --port 9000

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT, build } from './build.mjs';
import { emptyState, loadServer } from './gas-shim/index.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

export const PREVIEW_USERS = [
  { username: 'owner', password: 'preview-owner', display_name: 'Preview Owner', role_id: 'ROL-OWNER' },
  { username: 'manager', password: 'preview-manager', display_name: 'Preview Manager', role_id: 'ROL-MANAGER' },
  { username: 'staff', password: 'preview-staff', display_name: 'Preview Staff', role_id: 'ROL-STAFF' },
];

function call(server, action, payload, token) {
  return server.post({ action, payload, token, op_id: crypto.randomUUID(), contract: 1 });
}

function seed(server, state) {
  const [owner, ...others] = PREVIEW_USERS;
  call(server, 'setup.owner', { code: state.props.SETUP_CODE, display_name: owner.display_name, username: owner.username, password: owner.password });
  const token = call(server, 'auth.login', { username: owner.username, password: owner.password }).data.data.token;
  for (const u of others) call(server, 'users.save', { ...u, status: 'active' }, token);
  // Sample setup so the money screen can be tried at once (preview only).
  const accounts = [['Cash drawer', 'drawer', 5000], ['bKash', 'bkash', 2000], ['City Bank', 'bank', 50000], ['Held by Preview Owner', 'owner', 0]];
  for (const [name, kind, opening] of accounts) call(server, 'setup.account.save', { name, kind, opening, status: 'active' }, token);
  const categories = [['Milk', 'cafe', false], ['Snacks', 'cafe', false], ['Utilities', 'shared', false], ['Rent', 'shared', true], ['Book shipping', 'books', false]];
  for (const [name, area, needs] of categories) call(server, 'setup.category.save', { name, area, needs_shareholder: needs, status: 'active' }, token);
  call(server, 'setup.contact.save', { name: 'Rahim (regular)', phone: '01711000000', opening_due: 350, status: 'active' }, token);
  for (const name of ['Preview Owner', 'Second Shareholder']) call(server, 'setup.shareholder.save', { name, status: 'active' }, token);
  call(server, 'auth.logout', {}, token);
}

export function startPreview({ port = 8080, fresh = false, quiet = false } = {}) {
  const { web, gas, id } = build({ apiUrl: 'api' });
  const dir = path.join(ROOT, '.preview');
  const file = path.join(dir, 'state.json');
  fs.mkdirSync(dir, { recursive: true });
  if (fresh) fs.rmSync(file, { force: true });
  const isNew = !fs.existsSync(file);
  const state = isNew ? emptyState() : JSON.parse(fs.readFileSync(file, 'utf8'));
  const server = loadServer(path.join(gas, 'Code.js'), state);
  if (isNew) {
    state.props.SETUP_CODE = String(crypto.randomInt(100000, 1000000));
    if (!fresh) seed(server, state);
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(state));
  save();

  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': TYPES['.json'] });
        res.end(JSON.stringify(server.get()));
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const reply = server.post(body);
        save();
        res.writeHead(200, { 'content-type': TYPES['.json'] });
        res.end(JSON.stringify(reply));
      });
      return;
    }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.normalize(path.join(web, rel));
    if (!target.startsWith(web) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(target).pipe(res);
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      if (!quiet) {
        const lines = [`Biblion preview (build ${id}) at http://localhost:${port}/`, `Data: ${path.relative(ROOT, file)}`];
        if (state.props.SETUP_CODE) lines.push(`First-owner setup code: ${state.props.SETUP_CODE}`);
        else lines.push('Sign in as:', ...PREVIEW_USERS.map((u) => `  ${u.username.padEnd(8)} / ${u.password}   (${u.display_name})`));
        lines.push('Stop with Ctrl+C.');
        process.stdout.write(`${lines.join('\n')}\n`);
      }
      resolve(httpServer);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'tools', 'preview.mjs')) {
  const i = process.argv.indexOf('--port');
  startPreview({ port: i > 0 ? Number(process.argv[i + 1]) : 8080, fresh: process.argv.includes('--fresh') });
}
