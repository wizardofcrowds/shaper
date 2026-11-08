import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { IncomingMessage } from 'node:http';
import { parseBreadboard, writeBreadboard } from '../src/index.ts';
import { createFileStore, FileError } from '../server/files.ts';
import { allowedRequest } from '../server/plugin.ts';

const text = readFileSync(new URL('../examples/two-paths.breadboard.yaml', import.meta.url), 'utf8');
async function fixture(run: (folder: string, store: ReturnType<typeof createFileStore>) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'shaper-files-'));
  try { await run(folder, createFileStore(folder)); }
  finally { await rm(folder, { recursive: true, force: true }); }
}

test('New → Save creates the selected filename, Open → Save overwrites it, Save As keeps the original', async () => fixture(async (folder, store) => {
  const path = join(folder, 'initial-site.yml');
  const target = await store.inspect(path);
  assert.equal(target.revision, null);
  const saved = await store.save(path, text, target.revision);
  const opened = await store.read(path);
  assert.equal(opened.revision, saved.revision);
  const model = parseBreadboard(opened.text);
  model.title = 'Updated 日本語';
  const changed = writeBreadboard(model);
  const updated = await store.save(opened.path, changed, opened.revision);
  assert.equal(await readFile(path, 'utf8'), changed);
  assert.notEqual(updated.revision, saved.revision);
  const copy = join(folder, 'copy.yaml');
  await store.save(copy, changed, (await store.inspect(copy)).revision);
  assert.equal(await readFile(path, 'utf8'), await readFile(copy, 'utf8'));
  assert.deepEqual((await readdir(folder)).sort(), ['copy.yaml', 'initial-site.yml']);
}));

test('save refuses stale revisions, deleted files, and unexpected existing destinations without changing disk', async () => fixture(async (folder, store) => {
  const path = join(folder, 'file.yaml');
  const saved = await store.save(path, text, null);
  await writeFile(path, text + '\n# external edit\n');
  await assert.rejects(store.save(path, text, saved.revision), error => error instanceof FileError && error.status === 409);
  assert.ok((await readFile(path, 'utf8')).endsWith('# external edit\n'));
  await assert.rejects(store.save(path, text, null), FileError);
  await rm(path);
  await assert.rejects(store.save(path, text, saved.revision), FileError);
  assert.deepEqual(await readdir(folder), []);
}));

test('simultaneous creates never overwrite each other', async () => fixture(async (folder, store) => {
  const path = join(folder, 'file.yaml');
  const results = await Promise.allSettled([store.save(path, text, null), store.save(path, text + '\n', null)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await readFile(path, 'utf8'), text);
}));

test('invalid content, extensions, oversized files, and symlink targets leave files intact', async () => fixture(async (folder, store) => {
  const path = join(folder, 'file.yaml');
  await store.save(path, text, null);
  const original = await store.read(path);
  await assert.rejects(store.save(path, 'invalid: yaml', original.revision));
  await assert.rejects(store.save(join(folder, 'file.txt'), text, null));
  const linked = join(folder, 'linked.yaml');
  await symlink(path, linked);
  await assert.rejects(store.read(linked));
  await assert.rejects(store.save(linked, text, null));
  await writeFile(join(folder, 'huge.yaml'), 'x'.repeat(1_048_577));
  await assert.rejects(store.read(join(folder, 'huge.yaml')), /1 MiB/);
  assert.equal(await readFile(path, 'utf8'), text);
}));

test('folder navigation shows directories and YAML files without reading other files', async () => fixture(async (folder, store) => {
  await mkdir(join(folder, 'diagrams'));
  await writeFile(join(folder, 'note.txt'), 'a note');
  await writeFile(join(folder, '.hidden.yaml'), text);
  await store.save(join(folder, 'site.yml'), text, null);
  const listing = await store.list(folder);
  assert.deepEqual(listing.entries, [{ name: 'diagrams', directory: true }, { name: 'site.yml', directory: false }]);
  assert.equal((await store.list(listing.path + '/diagrams')).entries.length, 0);
}));

test('file API accepts only loopback same-origin requests and requires a token for file operations', () => {
  const request = (headers: Record<string, string>, method = 'POST', remote = '127.0.0.1') => ({ headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'sec-fetch-site': 'same-origin', ...headers }, method, socket: { remoteAddress: remote } }) as IncomingMessage;
  assert.equal(allowedRequest(request({ 'x-shaper-token': 'secret' }), 'secret'), true);
  assert.equal(allowedRequest(request({}), 'secret'), false);
  assert.equal(allowedRequest(request({}, 'GET'), 'secret'), true);
  assert.equal(allowedRequest(request({ origin: 'https://example.com', 'x-shaper-token': 'secret' }), 'secret'), false);
  assert.equal(allowedRequest(request({ host: 'attacker.test', 'x-shaper-token': 'secret' }), 'secret'), false);
  assert.equal(allowedRequest(request({ 'sec-fetch-site': 'cross-site' }, 'GET'), 'secret'), false);
  assert.equal(allowedRequest(request({}, 'GET', '192.168.1.2'), 'secret'), false);
});
