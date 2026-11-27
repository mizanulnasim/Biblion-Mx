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

// Where the preview's shop is (Dhaka). Browsers in the preview can be told
// they are here to try punching.
const PREVIEW_PLACE = Object.freeze({ lat: 23.7808, lng: 90.4106 });

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
  const supplier = (fields) => call(server, 'setup.supplier.save', { status: 'active', ...fields }, token).data.record_id;
  const pathak = supplier({ kind: 'publisher', name: 'Pathak Shamabesh', commission: 25, sell_discount: 10, pays_on: 'sale' });
  supplier({ kind: 'publisher', name: 'Prothoma', commission: 20, sell_discount: 10, pays_on: 'delivery' });
  supplier({ kind: 'vendor', name: 'Milk Vita' });
  const titles = [['Padma Nadir Majhi', 'Manik Bandopadhyay', 400], ['Aranyak', 'Bibhutibhushan', 350], ['Lalsalu', 'Syed Waliullah', 250]];
  for (const [title, author, price] of titles) call(server, 'books.save', { title, author, publisher_id: pathak, printed_price: price, status: 'active' }, token);
  // Café: a few common items, milk from Milk Vita, and 15 days of counts.
  const keys = ['milk', 'bread', 'eggs', 'coffee', 'sugar', 'cups'];
  call(server, 'cafe.starter.add', { keys: keys.map((key) => ({ key })) }, token);
  const items = call(server, 'cafe.items', {}, token).data.items;
  const vendor = call(server, 'suppliers.list', {}, token).data.items.find((x) => x.name === 'Milk Vita');
  const milk = items.find((i) => i.name === 'Milk');
  call(server, 'cafe.item.save', { ...milk, vendor_id: vendor.id }, token);
  const day = (n) => new Date(Date.now() + 6 * 3600000 - n * 86400000).toISOString().slice(0, 10);
  for (let n = 15; n >= 1; n--) {
    const lines = ['Milk', 'Bread', 'Eggs'].map((name, k) => ({ item_id: items.find((i) => i.name === name).id, counted: 200 - (15 - n) * (4 + k * 3) }));
    call(server, 'cafe.count.save', { date: day(n), lines }, token);
  }
  for (const name of ['Preview Owner', 'Second Shareholder']) call(server, 'setup.shareholder.save', { name, status: 'active' }, token);
  call(server, 'settings.shop.save', { name: 'Biblion', tagline: 'Bookstore café and cultural space', address: 'House 0, Sample Road, Dhaka', phone: '01700000000', email: 'preview@example.com' }, token);
  // Staff: the three sign-ins plus one person without a sign-in (punches on
  // the shop device, PIN 1111, turned on here); the shop at the preview position; a week of
  // past days entered as corrections.
  const userIds = new Map(call(server, 'users.list', {}, token).data.items.map((u) => [u.username, u.id]));
  const staff = (fields) => call(server, 'staff.save', { status: 'active', joined_on: day(200), work_start: '10:00', work_end: '18:00', days_off: [{ day: 5 }], ...fields }, token).data.record_id;
  const people = [
    staff({ name: 'Preview Owner', user_id: userIds.get('owner'), position: 'Shareholder', work_start: null, work_end: null }),
    staff({ name: 'Preview Manager', user_id: userIds.get('manager'), position: 'Manager', pin: '2222', salary: 18000 }),
    staff({ name: 'Preview Staff', user_id: userIds.get('staff'), position: 'Café', pin: '3333', salary: 12000 }),
    staff({ name: 'Kamal', position: 'Books', pin: '1111', salary: 11000 }),
  ];
  call(server, 'settings.attendance.save', { ...call(server, 'settings.attendance', {}, token).data, lat: PREVIEW_PLACE.lat, lng: PREVIEW_PLACE.lng, device_enabled: true }, token);
  // Rota: two shifts, a public holiday next week, and one person's approved
  // leave.
  const morning = call(server, 'rota.shift.save', { name: 'Morning', name_bn: 'সকাল', start: '08:00', end: '14:00', status: 'active' }, token).data.record_id;
  call(server, 'rota.shift.save', { name: 'Evening', name_bn: 'সন্ধ্যা', start: '14:00', end: '21:00', status: 'active' }, token);
  call(server, 'rota.set', { staff_id: people[3], date: day(-2), value: morning }, token);
  call(server, 'holidays.save', { date: day(-5), name: 'Sample holiday', name_bn: 'নমুনা ছুটি', status: 'active' }, token);
  call(server, 'leave.apply', { staff_id: people[3], kind: 'paid', from: day(-8), to: day(-9), reason: 'Preview sample' }, token);
  // Tasks: repeating ones for staff, a role and the manager, and a one-off.
  const task = (fields) => call(server, 'tasks.template.save', { start_date: day(0), status: 'active', ...fields }, token);
  task({ title: 'Wipe the café tables', staff_id: people[2], repeat: 'daily', due_time: '11:00' });
  task({ title: 'Count the café stock', staff_id: people[2], repeat: 'daily', due_time: '20:30', link: 'page:cafe_count' });
  task({ title: 'Dust the shelves', staff_id: people[3], repeat: 'weekly', days: [0, 1, 2, 3, 4, 6].map((d) => ({ day: d })) });
  task({ title: 'Lock the back door', role: 'staff', repeat: 'daily', due_time: '22:45' });
  task({ title: 'Pay the electricity bill', staff_id: people[1], repeat: 'monthly', day_of_month: Number(day(0).slice(8)), link: 'money:expense' });
  call(server, 'tasks.create', { title: 'Put up the new poetry display', details: 'Use the front table.', staff_id: people[2], due_date: day(0) }, token);
  // Notices and a review.
  const doc = (fields) => call(server, 'docs.save', { audience: 'everyone', status: 'active', staff_ids: [], ...fields }, token);
  doc({ kind: 'announcement', title: 'New café menu from Saturday', body: 'Cold coffee and lemon tea are added.\n\nPrices are on the board by the till.', needs_ack: true, show_until: day(-5) });
  doc({ kind: 'sop', title: 'Opening the shop', body: 'Unlock the front door and switch on the lights.\n\nCount the till float and turn on the coffee machine.\n\nOpen the shutters at 10:00.' });
  doc({ kind: 'jd', title: 'Café assistant', body: 'Makes and serves drinks, keeps the café clean, and does the daily café count.', audience: 'people', staff_ids: [{ id: people[2] }] });
  call(server, 'reviews.start', { staff_id: people[2], from: day(30), to: day(1) }, token);
  for (let n = 7; n >= 1; n--) {
    const date = day(n);
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 5) continue;
    for (const [k, id] of people.slice(1).entries()) {
      if (n === 3 && k === 2) continue;
      call(server, 'attendance.fix', { staff_id: id, date, type: 'in', time: `10:0${(n + k) % 10}`, reason: 'Preview sample' }, token);
      if (n !== 2 || k !== 1) call(server, 'attendance.fix', { staff_id: id, date, type: 'out', time: `18:${String(10 + n * k).padStart(2, '0')}`, reason: 'Preview sample' }, token);
    }
  }
  call(server, 'auth.logout', {}, token);
}

export function startPreview({ port = 8080, fresh = false, quiet = false } = {}) {
  const { web, gas, id } = build({ apiUrl: 'api' });
  const dir = path.join(ROOT, '.preview');
  const file = path.join(dir, 'state.json');
  fs.mkdirSync(dir, { recursive: true });
  if (fresh) fs.rmSync(file, { force: true });
  const isNew = !fs.existsSync(file);
  const state = isNew ? emptyState() : { ...emptyState(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  const server = loadServer(path.join(gas, 'Code.js'), state);
  if (isNew) {
    state.props.SETUP_CODE = String(crypto.randomInt(100000, 1000000));
    if (!fresh) seed(server, state);
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(state));
  // The hourly job (repeating tasks, automatic requisitions), as the Apps
  // Script trigger would run it.
  const runJobs = () => {
    server.job();
    save();
  };
  runJobs();
  const hourly = setInterval(runJobs, 3600000);

  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Preview only: what the stand-in text reading returns for a file name
    // (there is no real text recognition on this computer).
    if (url.pathname === '/preview-ocr' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const { name, text } = JSON.parse(body);
        state.ocr[name] = text;
        save();
        res.writeHead(204);
        res.end();
      });
      return;
    }
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
      httpServer.on('close', () => clearInterval(hourly));
      resolve(httpServer);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'tools', 'preview.mjs')) {
  const i = process.argv.indexOf('--port');
  startPreview({ port: i > 0 ? Number(process.argv[i + 1]) : 8080, fresh: process.argv.includes('--fresh') });
}
