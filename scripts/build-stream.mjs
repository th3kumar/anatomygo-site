// Builds the viewer's streaming copy of the model in public/models/stream/: the same parts, re-packed outside-in
// (models/load-order.json) into small chunks and compressed with meshoptimizer's lossless codecs. The canonical files
// in models/ stay the source of truth for every anchor, digest and tool; this copy must decode to exactly their bytes,
// and the build fails if a single part does not.
//   node scripts/build-stream.mjs            (run by prepare-assets.mjs)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const models = path.join(root, 'models'), out = path.join(root, 'public/models/stream');
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const fnv1a = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
const FIRST_CHUNK = 320 * 1024, CHUNK = 1024 * 1024; // encoded bytes; a small first chunk puts pixels on screen sooner

// G1: the canonical files are exactly the ones the anchors and digests were made from.
const canonical = JSON.parse(fs.readFileSync(path.join(root, 'scripts/canonical-models.json')));
for (const [name, digest] of Object.entries(canonical)) {
  if (sha(fs.readFileSync(path.join(models, name))) !== digest) throw new Error(`models/${name} differs from the canonical model. Update scripts/canonical-models.json only on purpose, with a new geometry fingerprint.`);
}
const atlasBytes = fs.readFileSync(path.join(models, 'atlas.json')), atlas = JSON.parse(atlasBytes);
const manifest = JSON.parse(fs.readFileSync(path.join(models, 'playground-geometry.json')));
const order = JSON.parse(fs.readFileSync(path.join(models, 'load-order.json')));
if (order.geometry !== manifest.geometry) throw new Error('load-order.json was made for another model. Re-run scripts/visibility-pass.mjs.');
const index = new Map(atlas.parts.map((p, i) => [p.id, i]));
if (order.parts.length !== atlas.parts.length || new Set(order.parts.map(p => p[0])).size !== atlas.parts.length || order.parts.some(p => !index.has(p[0])))
  throw new Error('load-order.json must list every part exactly once.');

const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/meshoptimizer/package.json'))).version;
const self = sha(fs.readFileSync(new URL(import.meta.url)));
const inputs = sha(JSON.stringify([canonical, order, version, self]));
const existing = path.join(out, 'stream.json');
const current = fs.existsSync(existing) ? JSON.parse(fs.readFileSync(existing)) : null;
if (current?.inputs === inputs && current.chunks.every((c, n) => fs.existsSync(path.join(out, `s-${n}.bin.gz`)))) console.log('stream: up to date');
else await build();

async function build() {

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const bins = atlas.chunks.map(c => fs.readFileSync(path.join(models, path.basename(c.url))));
const view = p => {
  const b = bins[p.chunk], n = p.vertexCount;
  return { positions: new Uint8Array(b.buffer, b.byteOffset + p.positions, n * 12), normals: new Int16Array(b.buffer.slice(b.byteOffset + p.normals, b.byteOffset + p.normals + n * 6)), indices: new Uint8Array(b.buffer, b.byteOffset + p.indices, p.indexCount * 4) };
};
// One tier per chunk, so the outer body never waits behind inner or hidden parts.
const tier = layer => (layer === 0 ? 'outer' : layer < 0 ? 'hidden' : 'inner');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const chunks = [], parts = new Array(atlas.parts.length);
let pending = [], size = 0, current = null;
const flush = () => {
  if (!pending.length) return;
  const n = chunks.length, data = Buffer.concat(pending), gz = zlib.gzipSync(data, { level: 9 });
  fs.writeFileSync(path.join(out, `s-${n}.bin.gz`), gz);
  chunks.push({ url: `/models/stream/s-${n}.bin`, gzip: `/models/stream/s-${n}.bin.gz`, bytes: data.length, gzipBytes: gz.length, tier: current });
  pending = []; size = 0;
};
for (const [id, layer] of order.parts) {
  const i = index.get(id), p = atlas.parts[i], n = p.vertexCount, t = tier(layer);
  if (current !== t || size >= (chunks.length ? CHUNK : FIRST_CHUNK)) { flush(); current = t; }
  const { positions, normals, indices } = view(p);
  // Normals are padded from 3 to 4 shorts, because the vertex codec needs a stride that is a multiple of 4.
  const padded = new Int16Array(n * 4);
  for (let v = 0; v < n; v++) { padded[v * 4] = normals[v * 3]; padded[v * 4 + 1] = normals[v * 3 + 1]; padded[v * 4 + 2] = normals[v * 3 + 2]; }
  const ep = MeshoptEncoder.encodeVertexBuffer(positions, n, 12);
  const en = MeshoptEncoder.encodeVertexBuffer(new Uint8Array(padded.buffer), n, 8);
  // The index *sequence* codec keeps every triangle's corner order; the triangle codec would rotate corners and move
  // every pin, because pin anchors are barycentric coordinates within a triangle.
  const ei = MeshoptEncoder.encodeIndexSequence(indices, p.indexCount, 4);
  parts[i] = [chunks.length, size, ep.length, en.length, ei.length];
  pending.push(Buffer.from(ep), Buffer.from(en), Buffer.from(ei)); size += ep.length + en.length + ei.length;
}
flush();

// G2: decode every part from the files just written, with the decoder the viewer ships, and compare its SHA-256 with
// the canonical digest the Playground and Supabase use.
const written = chunks.map((c, n) => zlib.gunzipSync(fs.readFileSync(path.join(out, `s-${n}.bin.gz`))));
let checked = 0;
for (let i = 0; i < atlas.parts.length; i++) {
  const p = atlas.parts[i], [c, offset, lp, ln, li] = parts[i], b = written[c], n = p.vertexCount;
  const positions = new Uint8Array(n * 12), padded = new Int16Array(n * 4), indices = new Uint8Array(p.indexCount * 4);
  MeshoptDecoder.decodeVertexBuffer(positions, n, 12, b.subarray(offset, offset + lp));
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(padded.buffer), n, 8, b.subarray(offset + lp, offset + lp + ln));
  MeshoptDecoder.decodeIndexSequence(indices, p.indexCount, 4, b.subarray(offset + lp + ln, offset + lp + ln + li));
  const normals = new Int16Array(n * 3);
  for (let v = 0; v < n; v++) { normals[v * 3] = padded[v * 4]; normals[v * 3 + 1] = padded[v * 4 + 1]; normals[v * 3 + 2] = padded[v * 4 + 2]; }
  const digest = sha(Buffer.concat([positions, Buffer.from(normals.buffer), indices]));
  if (digest !== manifest.meshes[p.id]?.digest) throw new Error(`Stream copy of ${p.id} (${p.name}) does not decode to the canonical mesh.`);
  checked++;
}
const atlasFingerprint = fnv1a(atlas.parts.map(p => `${p.id},${p.vertexCount},${p.indexCount}`).join(';'));
const stream = { version: 1, geometry: manifest.geometry, atlas: sha(atlasBytes), atlasFingerprint, encoder: `meshoptimizer@${version}`, inputs, chunks, parts };
fs.writeFileSync(existing, JSON.stringify(stream));
const mb = x => (x / 1048576).toFixed(1) + ' MB', sum = t => chunks.filter(c => !t || c.tier === t).reduce((a, c) => a + c.gzipBytes, 0);
console.log(`stream: ${chunks.length} chunks, ${mb(sum())} gzip (outer ${mb(sum('outer'))}, inner ${mb(sum('inner'))}, hidden ${mb(sum('hidden'))}); ${checked}/${atlas.parts.length} parts decode byte-identical`);
}
