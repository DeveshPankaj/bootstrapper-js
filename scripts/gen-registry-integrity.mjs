#!/usr/bin/env node
// Adds / refreshes `sha256` (lower-case hex) on every file of the built-in app registry,
// docs/registry.json, computed from the bytes that are deployed: a file `src` of
// "/public/mount/<path>" is docs/public/mount/<path> (the dev server and GitHub Pages serve
// docs/ as-is). The App Manager (docs/public/mount/opt/apps/pkg-manager/main.js) checks each
// download against it with crypto.subtle before writing anything and aborts the install on a
// mismatch (audit BOOT-4).
//
// Re-run it whenever a registry-listed file changes, or installs of that app fail their
// integrity check. Idempotent: a second run changes nothing.
//
//   node scripts/gen-registry-integrity.mjs          rewrite docs/registry.json
//   node scripts/gen-registry-integrity.mjs --check  exit 1 if any hash is missing or stale
//
// No dependencies (Node >= 18).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const MOUNT = join(DOCS, 'public', 'mount');
const REGISTRY = join(DOCS, 'registry.json');
const SRC_PREFIX = '/public/mount/';
const CHECK = process.argv.includes('--check');

// The deployed file for a registry `src`, or null when it isn't a built-in /public/mount path.
const localFileFor = (src) => {
  if (typeof src !== 'string' || !src.startsWith(SRC_PREFIX)) return null;
  const file = resolve(DOCS, '.' + src.split('?')[0].split('#')[0]);
  if (file !== MOUNT && !file.startsWith(MOUNT + sep)) return null; // '..' out of docs/public/mount
  return file;
};

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// JSON with 2-space indent and non-ASCII escaped as \uXXXX (the registry's existing style),
// so the file stays byte-stable across runs.
const toJson = (value) => JSON.stringify(value, null, 2)
  .replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

// Puts `sha256` right after `src`, keeping every other key where it was.
const withHash = (file, hash) => {
  const out = {};
  for (const [k, v] of Object.entries(file)) {
    if (k === 'sha256') continue;
    out[k] = v;
    if (k === 'src') out.sha256 = hash;
  }
  if (!('sha256' in out)) out.sha256 = hash;
  return out;
};

const text = readFileSync(REGISTRY, 'utf8');
const registry = JSON.parse(text);
if (!registry || !Array.isArray(registry.apps)) {
  console.error('registry.json: expected an object with an "apps" array');
  process.exit(1);
}

const errors = [];
const warnings = [];
const stale = [];
let hashed = 0;
for (const app of registry.apps) {
  if (!Array.isArray(app.files)) continue;
  app.files = app.files.map((file) => {
    const where = `${app.id}: ${file && file.dest} (${file && file.src})`;
    const local = localFileFor(file && file.src);
    if (!local) {
      warnings.push(`${where}: not a ${SRC_PREFIX} path — no sha256 computed (the App Manager asks before installing it)`);
      return file;
    }
    if (!existsSync(local) || !statSync(local).isFile()) {
      errors.push(`${where}: ${relative(ROOT, local)} does not exist`);
      return file;
    }
    const hash = sha256(local);
    hashed++;
    if (file.sha256 !== hash) stale.push(`${where}: ${file.sha256 ? 'stale' : 'missing'} sha256`);
    return withHash(file, hash);
  });
}

for (const w of warnings) console.warn('warning:', w);
for (const e of errors) console.error('error:', e);
if (errors.length) process.exit(1);

if (CHECK) {
  for (const s of stale) console.error('stale:', s);
  console.log(stale.length ? `${stale.length} of ${hashed} hashes missing or stale — run: node scripts/gen-registry-integrity.mjs` : `all ${hashed} hashes up to date`);
  process.exit(stale.length ? 1 : 0);
}

const out = toJson(registry) + (text.endsWith('\n') ? '\n' : '');
if (out === text) {
  console.log(`docs/registry.json unchanged (${hashed} files hashed)`);
} else {
  writeFileSync(REGISTRY, out);
  console.log(`docs/registry.json updated: ${stale.length} hash${stale.length === 1 ? '' : 'es'} added/refreshed, ${hashed} files hashed`);
}
