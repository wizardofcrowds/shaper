import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BreadboardError, parseBreadboard, writeBreadboard } from '../src/index.ts';
import { checkBreadboard, connections, nodeHeight, withLayout } from '../src/editor/model.ts';
import { addSlice, assignSlice, boundaryConnections, coverSliceMembers, deleteSlice, moveSlice, resizeSlice, settleNodeDrops, sliceAtNode, sliceMembers } from '../src/editor/slices.ts';

const fresh = () => withLayout(parseBreadboard(readFileSync(new URL('../examples/two-paths.breadboard.yaml', import.meta.url), 'utf8')));
const sliced = () => addSlice(addSlice(fresh(), { x: 800, y: 0 }).model, { x: 1600, y: 0 }).model;

test('existing documents keep their shape; slice definitions, metadata, membership, and geometry round-trip', () => {
  assert.equal(Object.hasOwn(fresh(), 'slices'), false);
  assert.equal(Object.hasOwn(fresh().layout!, 'slices'), false);
  let model = sliced();
  model.slices!.slice!.label = 'A traveler can explore an idea';
  model.slices!.slice!.metadata = { note: ['prototype', true] };
  model = assignSlice(model, 'home', 'slice');
  model.nodes.path_one!.kind = 'component';
  model = assignSlice(model, 'path_one', 'slice_2');
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
});

test('assign, reassign, and unassign whole places/components preserve data and all connections', () => {
  const original = sliced();
  original.nodes.home!.color = 'blue';
  original.nodes.home!.metadata = { requirement: 'R1' };
  original.nodes.path_one!.kind = 'component';
  const before = structuredClone(original);
  let model = assignSlice(original, 'home', 'slice');
  model = assignSlice(model, 'path_one', 'slice');
  assert.deepEqual(sliceMembers(model, 'slice'), ['home', 'path_one']);
  model = assignSlice(model, 'home', 'slice_2');
  assert.deepEqual(sliceMembers(model, 'slice'), ['path_one']);
  assert.deepEqual(sliceMembers(model, 'slice_2'), ['home']);
  model = assignSlice(model, 'home', null);
  assert.equal(Object.hasOwn(model.nodes.home!, 'slice'), false);
  assert.equal(sliceAtNode(model, 'home'), undefined);
  assert.deepEqual(model.nodes.home, original.nodes.home);
  assert.deepEqual(connections(model), connections(original));
  assert.deepEqual(model.scenarios, original.scenarios);
  assert.deepEqual(original, before);
  assert.throws(() => assignSlice(original, 'home', 'unknown'), /Missing slice/);
});

test('a node drop assigns the containing slice, reassigns exclusively, and unassigns outside all regions', () => {
  let model = sliced();
  const edges = connections(model);
  model.layout!.nodes!.home = { x: 830, y: 70 };
  model = settleNodeDrops(model, ['home']);
  assert.equal(model.nodes.home!.slice, 'slice');
  model.layout!.nodes!.home = { x: 1630, y: 70 };
  model = settleNodeDrops(model, ['home']);
  assert.equal(model.nodes.home!.slice, 'slice_2');
  assert.deepEqual(sliceMembers(model, 'slice'), []);
  model.layout!.nodes!.home = { x: -900, y: -900 };
  model = settleNodeDrops(model, ['home']);
  assert.equal(model.nodes.home!.slice, undefined);
  assert.deepEqual(connections(model), edges);
});

test('drop overlap resolution is deterministic; regions expand to cover assigned whole nodes', () => {
  let model = sliced();
  model.layout!.slices!.slice_2 = { x: 800, y: 0, w: 400, h: 300 };
  model.layout!.nodes!.home = { x: 820, y: 70 };
  assert.equal(sliceAtNode(model, 'home'), 'slice_2');
  model = settleNodeDrops(model, ['home']);
  assert.equal(model.nodes.home!.slice, 'slice_2');
  model.layout!.nodes!.home = { x: 950, y: 70 };
  model = settleNodeDrops(model, ['home']);
  assert.equal(model.nodes.home!.slice, 'slice_2');
  assert.ok(model.layout!.slices!.slice_2!.x + model.layout!.slices!.slice_2!.w >= 950 + 300 + 24);
  model.nodes.home!.affordances.extra = { kind: 'copy', label: 'More detail' };
  model = coverSliceMembers(model);
  assert.ok(model.layout!.slices!.slice_2!.y + model.layout!.slices!.slice_2!.h >= 70 + nodeHeight(model.nodes.home!) + 24);
});

test('moving a slice moves only its members and resizing cannot crop them or capture other nodes', () => {
  const model = assignSlice(sliced(), 'home', 'slice');
  const start = structuredClone(model);
  const moved = moveSlice(model, 'slice', { x: 900, y: 200 });
  assert.equal(moved.layout!.nodes!.home!.x, model.layout!.nodes!.home!.x + 100);
  assert.equal(moved.layout!.nodes!.home!.y, model.layout!.nodes!.home!.y + 200);
  assert.deepEqual(moved.layout!.nodes!.path_one, model.layout!.nodes!.path_one);
  assert.deepEqual(connections(moved), connections(model));
  const resized = resizeSlice(moved, 'slice', { x: 900, y: 200, w: 360, h: 220 });
  assert.deepEqual(resized.layout!.nodes, moved.layout!.nodes);
  assert.ok(resized.layout!.slices!.slice!.h >= nodeHeight(model.nodes.home!) + 56 + 24);
  assert.deepEqual(sliceMembers(resized, 'slice'), ['home']);
  assert.deepEqual(model, start);
});

test('deleting a slice removes membership while keeping members, positions, edges, and other slices', () => {
  const model = assignSlice(assignSlice(sliced(), 'home', 'slice'), 'path_one', 'slice_2');
  const removed = deleteSlice(model, 'slice');
  assert.equal(removed.slices!.slice, undefined);
  assert.equal(removed.layout!.slices!.slice, undefined);
  assert.equal(removed.nodes.home!.slice, undefined);
  assert.equal(removed.nodes.path_one!.slice, 'slice_2');
  assert.deepEqual(removed.layout!.nodes, model.layout!.nodes);
  assert.deepEqual(connections(removed), connections(model));
  assert.deepEqual(removed.scenarios, model.scenarios);
});

test('slice boundary inspection returns original node edges without creating slice wires or build-order claims', () => {
  let model = assignSlice(sliced(), 'home', 'slice');
  assert.equal(boundaryConnections(model, 'slice').length, 2);
  model = assignSlice(model, 'path_one', 'slice');
  assert.deepEqual(boundaryConnections(model, 'slice').map(edge => edge.id), ['home.path_two.second_path']);
  model = assignSlice(model, 'path_two', 'slice_2');
  assert.deepEqual(boundaryConnections(model, 'slice_2').map(edge => edge.from), ['home.path_two']);
  assert.deepEqual(checkBreadboard(model), []);
});

test('missing region geometry is derived from members; missing membership references are separate findings', () => {
  const model = assignSlice(sliced(), 'home', 'slice');
  delete model.layout!.slices;
  const filled = withLayout(model);
  assert.deepEqual(withLayout(model), filled);
  assert.ok(filled.layout!.slices!.slice!.x < filled.layout!.nodes!.home!.x);
  filled.nodes.home!.slice = 'missing';
  assert.ok(checkBreadboard(filled).some(finding => finding.ref === 'home' && finding.message.includes('missing slice')));
  assert.deepEqual(parseBreadboard(writeBreadboard(filled)), filled);
});

test('schema enforces one whole-node membership and rejects invalid slice definitions/geometry', () => {
  const model = sliced();
  const invalidMembership = structuredClone(model);
  Object.assign(invalidMembership.nodes.home!, { slice: ['slice', 'slice_2'] });
  assert.throws(() => writeBreadboard(invalidMembership), BreadboardError);
  const invalidDimensions = structuredClone(model);
  invalidDimensions.layout!.slices!.slice!.w = 0;
  assert.throws(() => writeBreadboard(invalidDimensions), BreadboardError);
  const invalidSlice = structuredClone(model);
  invalidSlice.slices!.slice!.label = '';
  assert.throws(() => writeBreadboard(invalidSlice), BreadboardError);
  Object.assign(model.slices!.slice!, { connections: {} });
  assert.throws(() => writeBreadboard(model), BreadboardError);
});


test('unassigning aligned members leaves them outside all slices without stacking them on each other', () => {
  let model = assignSlice(assignSlice(sliced(), 'home', 'slice'), 'path_one', 'slice');
  model.layout!.nodes!.path_one!.y = model.layout!.nodes!.home!.y;
  model = assignSlice(assignSlice(model, 'home', null), 'path_one', null);
  assert.equal(sliceAtNode(model, 'home'), undefined);
  assert.equal(sliceAtNode(model, 'path_one'), undefined);
  const home = model.layout!.nodes!.home!, other = model.layout!.nodes!.path_one!;
  assert.ok(other.y >= home.y + nodeHeight(model.nodes.home!) + 24);
});
