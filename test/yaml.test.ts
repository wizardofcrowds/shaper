import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  BreadboardError, MAX_VALUE_DEPTH, MAX_YAML_BYTES, NODE_COLORS,
  parseBreadboard, validateBreadboard, writeBreadboard,
} from '../src/index.ts';
import type { Breadboard, BreadboardIssue, JsonValue } from '../src/index.ts';

const fixture = (name: string): string => readFileSync(
  new URL(`../examples/${name}.breadboard.yaml`, import.meta.url), 'utf8',
);
const fresh = (): Breadboard => parseBreadboard(fixture('two-paths'));
function rejects(run: () => unknown, match: Partial<BreadboardIssue>): void {
  assert.throws(run, error => {
    assert.ok(error instanceof BreadboardError, String(error));
    assert.ok(error.issues.some(issue => Object.entries(match).every(
      ([key, value]) => issue[key as keyof BreadboardIssue] === value,
    )), JSON.stringify(error.issues));
    return true;
  });
}

for (const name of ['two-paths', 'publishing']) {
  test(`${name}: real example preserves semantics through read/write/read`, () => {
    const model = parseBreadboard(fixture(name));
    const before = structuredClone(model);
    const output = writeBreadboard(model);
    assert.deepEqual(model, before, 'writer must not mutate input');
    assert.deepEqual(parseBreadboard(output), model);
    assert.equal(writeBreadboard(parseBreadboard(output)), output, 'stable output');
  });
}

test('preserves extension data at every level, scenarios, and optional layout', () => {
  const model = fresh();
  model.metadata = { flags: [true, false, null], nested: { answer: 42 }, text: '日本語: # text\nnext line' };
  model.nodes.home!.metadata = { rank: 2 };
  model.nodes.home!.affordances.path_one!.metadata = { note: 'visible copy' };
  model.nodes.home!.affordances.path_one!.connections!.first_path!.metadata = { contract: ['a', 'b'] };
  model.scenarios![0]!.metadata = { requirement: 'R1' };
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
  delete model.layout;
  delete model.scenarios;
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
});

test('does not coerce string-like labels or identifiers in metadata', () => {
  const model = fresh();
  for (const value of ['true', 'null', '0.1', '0012', '2026-11-01', '', 'a: b', '*anchor', 'yes', '---']) {
    model.title = value || 'Example';
    model.metadata = { text: value };
    assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
  }
});

test('reports malformed YAML with a source location', () => {
  assert.throws(() => parseBreadboard('nodes: [\n'), error => {
    assert.ok(error instanceof BreadboardError);
    assert.equal(error.issues[0]!.code, 'yaml');
    assert.ok(error.issues[0]!.line! >= 1);
    assert.ok(error.issues[0]!.column! >= 1);
    return true;
  });
});

test('rejects duplicate keys, including nested metadata', () => {
  rejects(() => parseBreadboard(fixture('two-paths') + '\ntitle: Again\n'), { code: 'yaml' });
  rejects(() => parseBreadboard(fixture('publishing').replace('illustrative: true', 'a: 1\n  a: 2')), { code: 'yaml' });
});

test('rejects empty documents, unsupported versions, unknown fields, and wrong types', () => {
  rejects(() => parseBreadboard(''), { code: 'schema' });
  rejects(() => parseBreadboard('null'), { code: 'schema' });
  rejects(() => parseBreadboard(fixture('two-paths').replace('"0.1"', '"0.2"')), { path: '/version' });
  rejects(() => parseBreadboard(fixture('two-paths').replace('"0.1"', '0.1')), { path: '/version' });
  const value = { ...fresh(), typo: true };
  rejects(() => writeBreadboard(value), { code: 'schema', path: '/typo' });
  const model = fresh();
  (model.nodes.home as unknown as { label: number }).label = 42;
  rejects(() => writeBreadboard(model), { path: '/nodes/home/label' });
});

test('requires fields and rejects unknown nested fields and invalid IDs/references', () => {
  const missing = fresh() as Partial<Breadboard>;
  delete missing.nodes;
  rejects(() => validateBreadboard(missing), { path: '/nodes' });
  const nested = fresh();
  Object.assign(nested.nodes.home!, { typo: true });
  rejects(() => writeBreadboard(nested), { path: '/nodes/home/typo' });
  const badId = fresh();
  badId.nodes['home.with.dot'] = badId.nodes.home!;
  rejects(() => writeBreadboard(badId), { code: 'schema' });
  const badRef = fresh();
  badRef.nodes.home!.affordances.path_one!.connections!.first_path!.to = 'home.extra.dot';
  rejects(() => writeBreadboard(badRef), { path: '/nodes/home/affordances/path_one/connections/first_path/to' });
});

test('keeps schema validation separate from future graph and scenario checks', () => {
  const model = fresh();
  model.nodes.home!.affordances.path_one!.connections!.first_path!.to = 'unfinished_destination';
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
});

test('rejects multiple documents, aliases, and unknown tags', () => {
  rejects(() => parseBreadboard(fixture('two-paths') + '\n---\na: b\n'), { code: 'yaml' });
  rejects(() => parseBreadboard(fixture('two-paths').replace('illustrative: true', 'illustrative: &flag true\n  repeated: *flag')), { code: 'yaml' });
  rejects(() => parseBreadboard(fixture('two-paths').replace('illustrative: true', 'illustrative: !execute anything')), { code: 'yaml' });
  rejects(() => parseBreadboard('%YAML 1.1\n---\n' + fixture('two-paths')), { code: 'yaml' });
});

test('rejects non-string keys and non-finite YAML numbers', () => {
  rejects(() => parseBreadboard(fixture('two-paths').replace('illustrative: true', '? [a, b]\n  : value')), { code: 'yaml' });
  for (const value of ['.inf', '-.inf', '.nan']) {
    rejects(() => parseBreadboard(fixture('two-paths').replace('illustrative: true', `illustrative: ${value}`)), { code: 'value' });
  }
});

test('bounds UTF-8 input size and nesting depth', () => {
  rejects(() => parseBreadboard(' '.repeat(MAX_YAML_BYTES + 1)), { code: 'limit' });
  rejects(() => parseBreadboard('#' + '界'.repeat(MAX_YAML_BYTES / 2)), { code: 'limit' });
  let nested: JsonValue = null;
  for (let i = 0; i < MAX_VALUE_DEPTH + 2; i++) nested = { nested };
  const model = fresh();
  model.metadata = { nested };
  rejects(() => writeBreadboard(model), { code: 'limit' });
  const deepYaml = fixture('publishing').replace('illustrative: true', 'illustrative: ' + '['.repeat(MAX_VALUE_DEPTH + 2) + '0' + ']'.repeat(MAX_VALUE_DEPTH + 2));
  rejects(() => parseBreadboard(deepYaml), { code: 'limit' });
  const huge = fresh();
  huge.metadata = { text: 'x'.repeat(MAX_YAML_BYTES) };
  rejects(() => writeBreadboard(huge), { code: 'limit' });
});

test('writer refuses JavaScript values that cannot round-trip without loss', () => {
  const sparse = new Array(3);
  const sparseWithExtra = Object.assign(new Array(1), { extra: true });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const accessor = Object.defineProperty({}, 'x', { enumerable: true, get() { throw new Error('must not execute'); } });
  const nonEnumerable = Object.defineProperty({}, 'x', { value: true });
  for (const value of [undefined, NaN, Infinity, -0, BigInt(1), new Date(), new Map(), sparse, sparseWithExtra, cyclic, accessor, nonEnumerable, Symbol('x'), () => 1, { [Symbol('x')]: true }]) {
    const model = { ...fresh(), metadata: { value } };
    rejects(() => writeBreadboard(model), { code: 'value' });
  }
});

test('shared object values are written explicitly rather than as YAML aliases', () => {
  const shared = { text: 'same' };
  const model = fresh();
  model.metadata = { a: shared, b: shared };
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
});

test('special object keys remain inert and preserve their data', () => {
  const model = fresh();
  model.metadata = JSON.parse('{"__proto__":{"shaper_marker":true},"constructor":"plain data","a/b~c":"value"}');
  const result = parseBreadboard(writeBreadboard(model));
  assert.deepEqual(result, model);
  assert.equal(({} as { shaper_marker?: boolean }).shaper_marker, undefined);
  assert.equal(Object.hasOwn(result.metadata!, '__proto__'), true);
});


test('rejects the old top-level connection format and redundant nested sources', () => {
  const model = fresh();
  rejects(() => writeBreadboard({ ...model, connections: {} }), { path: '/connections', code: 'schema' });
  Object.assign(model.nodes.home!.affordances.path_one!.connections!.first_path!, { from: 'home.path_one' });
  rejects(() => writeBreadboard(model), { path: '/nodes/home/affordances/path_one/connections/first_path/from', code: 'schema' });
});


test('all 16 node colors round-trip for places and components without changing graph meaning', () => {
  assert.equal(NODE_COLORS.length, 16);
  assert.equal(new Set(NODE_COLORS.map(color => color.id)).size, 16);
  for (const { id } of NODE_COLORS) {
    const model = fresh();
    model.nodes.home!.color = id;
    model.nodes.path_one!.kind = 'component';
    model.nodes.path_one!.color = id;
    const reopened = parseBreadboard(writeBreadboard(model));
    assert.equal(reopened.nodes.home!.color, id);
    assert.equal(reopened.nodes.path_one!.color, id);
    assert.deepEqual(reopened, model);
  }
  const model = fresh();
  assert.equal(Object.hasOwn(parseBreadboard(writeBreadboard(model)).nodes.home!, 'color'), false);
});

test('schema rejects unsupported node colors and accepts resetting to an omitted color', () => {
  const model = fresh();
  Object.assign(model.nodes.home!, { color: '#ff0000' });
  rejects(() => writeBreadboard(model), { code: 'schema', path: '/nodes/home/color' });
  delete model.nodes.home!.color;
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
});
