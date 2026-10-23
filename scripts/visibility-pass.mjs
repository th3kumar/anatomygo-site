// Writes models/load-order.json: the order in which the model's parts become visible from outside (see
// visibility-pass.html). Run it again only when the model changes. Needs a Chrome started with a DevTools port:
//   "Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/visibility about:blank
//   node scripts/visibility-pass.mjs 9333
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const port = process.argv[2] ?? '9333';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const site = `http://127.0.0.1:${server.address().port}`;

const tab = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(tab.webSocketDebuggerUrl); let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
await send('Runtime.enable');
await send('Page.navigate', { url: `${site}/scripts/visibility-pass.html` });
const evaluate = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.value;
let result;
for (let i = 0; i < 600 && !(result = await evaluate('window.__result')); i++) await new Promise(r => setTimeout(r, 500));
ws.close(); server.close();
if (!result) throw new Error('The visibility pass did not finish.');

const atlas = JSON.parse(fs.readFileSync(path.join(root, 'models/atlas.json')));
const { geometry } = JSON.parse(fs.readFileSync(path.join(root, 'models/playground-geometry.json')));
if (result.parts.length !== atlas.parts.length) throw new Error('The pass did not cover every part.');
// Load order: layer by layer from the outside in, biggest visible area first; parts that are off by default last.
const rank = l => (l < 0 ? Infinity : l);
const parts = [...result.parts].sort((a, b) => rank(a.layer) - rank(b.layer) || b.pixels - a.pixels || a.id.localeCompare(b.id));
const order = { version: 1, geometry, views: result.views, size: result.size, minPixels: result.minPixels, parts: parts.map(p => [p.id, p.layer, p.pixels]) };
fs.writeFileSync(path.join(root, 'models/load-order.json'), JSON.stringify(order) + '\n');
const layers = new Map();
for (const p of result.parts) layers.set(p.layer, (layers.get(p.layer) ?? 0) + 1);
console.log(`load-order.json: ${parts.length} parts; parts per layer:`, Object.fromEntries([...layers].sort((a, b) => a[0] - b[0])));
