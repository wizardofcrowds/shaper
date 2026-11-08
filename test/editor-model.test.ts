import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BreadboardError, parseBreadboard, writeBreadboard } from '../src/index.ts';
import { addAffordance, addNode, affordanceIds, checkBreadboard, connect, connectionAt, connections, deleteAffordance, deleteConnection, deleteNode, edgeGeometry, moveAffordance, moveConnection, uniqueId, withLayout } from '../src/editor/model.ts';

const fresh = () => withLayout(parseBreadboard(readFileSync(new URL('../examples/two-paths.breadboard.yaml', import.meta.url), 'utf8')));

test('canvas edit sequence preserves hidden data and reloads the same graph and positions', () => {
  const original = fresh();
  const before = structuredClone(original);
  let model = structuredClone(original);
  model.nodes.home!.label = 'Welcome';
  model.nodes.home!.affordances.path_one!.label = 'Explore places';
  model.layout!.nodes!.home = { x: 123, y: 456 };
  model.nodes.home!.affordances.path_one!.connections!.first_path!.to = 'path_two';
  const created = addNode(model, 'component', { x: 500, y: 600 });
  const added = addAffordance(created.model, created.id);
  const connected = connect(added.model, `${created.id}.${added.id}`, 'home');
  connectionAt(connected.model, connected.id).kind = 'invoke';
  const reopened = parseBreadboard(writeBreadboard(connected.model));
  assert.deepEqual(reopened, connected.model);
  assert.deepEqual(reopened.metadata, original.metadata);
  assert.deepEqual(reopened.scenarios, original.scenarios);
  assert.deepEqual(original, before, 'editing helpers do not mutate source documents');
});

test('renaming and reordering rows never changes connection identity', () => {
  const model = fresh();
  const initial = edgeGeometry(model).find(edge => edge.id === 'home.path_one.first_path')!;
  const node = model.nodes.home!;
  node.affordances.path_one!.label = 'Renamed';
  node.affordance_order = ['path_two', 'path_one'];
  const reordered = edgeGeometry(model).find(edge => edge.id === 'home.path_one.first_path')!;
  assert.equal(reordered.connection.from, initial.connection.from);
  assert.equal(reordered.sy, initial.sy + 48);
});

test('moving an affordance changes row geometry and persists order without rewiring paths', () => {
  const model = fresh();
  model.nodes.home!.affordances.path_one!.metadata = { requirement: 'R1' };
  model.nodes.home!.color = 'blue';
  const before = structuredClone(model);
  const previousEdge = edgeGeometry(model).find(edge => edge.id === 'home.path_one.first_path')!;
  const reordered = moveAffordance(model, 'home', 'path_one', 1);
  assert.deepEqual(affordanceIds(reordered.nodes.home!), ['path_two', 'path_one']);
  assert.deepEqual(connections(reordered), connections(model));
  assert.deepEqual(reordered.scenarios, model.scenarios);
  assert.equal(reordered.nodes.home!.color, 'blue');
  assert.deepEqual(reordered.nodes.home!.affordances.path_one!.metadata, { requirement: 'R1' });
  const movedEdge = edgeGeometry(reordered).find(edge => edge.id === 'home.path_one.first_path')!;
  assert.equal(movedEdge.y + movedEdge.sy, previousEdge.y + previousEdge.sy + 48);
  const reopened = parseBreadboard(writeBreadboard(reordered));
  assert.deepEqual(affordanceIds(reopened.nodes.home!), ['path_two', 'path_one']);
  assert.deepEqual(reopened, reordered);
  assert.deepEqual(moveAffordance(reordered, 'home', 'path_one', -1), model);
  assert.deepEqual(model, before, 'reordering does not mutate the source document');
});

test('reordering at either boundary is a no-op and unknown IDs are rejected', () => {
  const model = fresh();
  assert.equal(moveAffordance(model, 'home', 'path_one', -1), model);
  assert.equal(moveAffordance(model, 'home', 'path_two', 1), model);
  assert.throws(() => moveAffordance(model, 'missing', 'path_one', 1), /Missing node/);
  assert.throws(() => moveAffordance(model, 'home', 'missing', 1), /Missing affordance/);
});

test('explicit display order survives mapping-key sorting and legacy files remain readable', () => {
  const model = fresh();
  delete model.nodes.home!.affordance_order;
  assert.deepEqual(affordanceIds(model.nodes.home!), ['path_one', 'path_two']);
  const reordered = moveAffordance(model, 'home', 'path_two', -1);
  assert.deepEqual(reordered.nodes.home!.affordance_order, ['path_two', 'path_one']);
  const node = reordered.nodes.home!;
  node.affordances = { path_one: node.affordances.path_one!, path_two: node.affordances.path_two! };
  assert.deepEqual(affordanceIds(node), ['path_two', 'path_one']);
  const reopened = parseBreadboard(writeBreadboard(reordered));
  assert.deepEqual(affordanceIds(reopened.nodes.home!), ['path_two', 'path_one']);
});

test('deleting an affordance removes owned paths and retains incoming references', () => {
  const added = addAffordance(moveAffordance(fresh(), 'home', 'path_two', -1), 'home');
  assert.deepEqual(added.model.nodes.home!.affordance_order, ['path_two', 'path_one', added.id]);
  const linked = connect(added.model, `home.${added.id}`, 'path_one');
  const incoming = connect(linked.model, 'home.path_one', `home.${added.id}`);
  const removed = deleteAffordance(incoming.model, 'home', added.id);
  assert.deepEqual(removed.nodes.home!.affordance_order, ['path_two', 'path_one']);
  assert.ok(!connections(removed).some(edge => edge.id === linked.id));
  assert.equal(connectionAt(removed, incoming.id).to, `home.${added.id}`);
  assert.ok(checkBreadboard(removed).some(finding => finding.ref === incoming.id && finding.severity === 'error'));
});

test('schema rejects duplicate order entries and checks report incomplete order references', () => {
  const model = fresh();
  model.nodes.home!.affordance_order = ['path_one', 'path_one'];
  assert.throws(() => writeBreadboard(model), BreadboardError);
  model.nodes.home!.affordance_order = ['missing', 'path_two'];
  assert.deepEqual(affordanceIds(model.nodes.home!), ['path_two', 'path_one']);
  assert.ok(checkBreadboard(model).some(finding => finding.message.includes('missing affordance')));
  assert.ok(checkBreadboard(model).some(finding => finding.message.includes('not listed')));
});

test('deletion preserves affected connections and scenarios and reports them', () => {
  const model = deleteNode(fresh(), 'path_one');
  assert.ok(model.nodes.home!.affordances.path_one!.connections!.first_path);
  assert.equal(model.scenarios![0]!.end, 'path_one');
  assert.ok(checkBreadboard(model).some(finding => finding.ref === 'home.path_one.first_path' && finding.severity === 'error'));
  assert.ok(checkBreadboard(model).some(finding => finding.ref === 'take_first_path' && finding.severity === 'error'));
  assert.ok(!edgeGeometry(model).some(edge => edge.id === 'home.path_one.first_path'));
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
});

test('last node cannot be deleted and generated IDs avoid collisions', () => {
  let model = deleteNode(fresh(), 'path_one');
  model = deleteNode(model, 'path_two');
  assert.throws(() => deleteNode(model, 'home'), /at least one/);
  assert.equal(uniqueId({ action: true, action_2: true }, 'action'), 'action_3');
  assert.equal(uniqueId({}, 'constructor'), 'constructor');
});

test('missing layout gets deterministic positions without changing semantic data', () => {
  const model = fresh();
  delete model.layout;
  const positioned = withLayout(model);
  assert.deepEqual(withLayout(model), positioned);
  assert.deepEqual(positioned.nodes, model.nodes);
  assert.equal(model.layout, undefined);
});

test('checks valid, broken, and ambiguous navigation scenarios honestly', () => {
  const model = fresh();
  assert.deepEqual(checkBreadboard(model), []);
  model.nodes.home!.affordances.path_one!.connections!.first_path!.to = 'path_two';
  assert.ok(checkBreadboard(model).some(finding => finding.message.includes('expected “path_one”')));
  model.nodes.home!.affordances.path_one!.connections!.ambiguous = { to: 'path_one', kind: 'navigate' };
  assert.ok(checkBreadboard(model).some(finding => finding.severity === 'warning' && finding.message.includes('explicit choice')));
});

test('layout handles a valid node ID that also names an Object prototype property', () => {
  const model = fresh();
  const reserved: string = 'constructor';
  model.nodes[reserved] = { kind: 'component', label: 'Constructor', affordances: {} };
  const positioned = withLayout(model);
  assert.ok(Object.hasOwn(positioned.layout!.nodes!, 'constructor'));
  assert.equal(typeof positioned.layout!.nodes![reserved]!.x, 'number');
});


test('nested keys are scoped by affordance and project distinct edges with inferred sources', () => {
  const first = connect(fresh(), 'home.path_one', 'home.path_one');
  const second = connect(first.model, 'home.path_two', 'home');
  assert.equal(first.id, 'home.path_one.connection');
  assert.equal(second.id, 'home.path_two.connection');
  assert.equal(connections(second.model).find(edge => edge.id === first.id)!.from, 'home.path_one');
  assert.equal(edgeGeometry(second.model).filter(edge => edge.id.endsWith('.connection')).length, 2);
  const reopened = parseBreadboard(writeBreadboard(second.model));
  assert.deepEqual(reopened, second.model);
  assert.equal(Object.hasOwn(connectionAt(reopened, first.id), 'from'), false);
  assert.throws(() => connect(reopened, 'home', 'path_one'), /Missing source affordance/);
});

test('moving connection ownership preserves fields and resolves local key collisions without overwriting', () => {
  const model = fresh();
  model.nodes.home!.affordances.path_two!.connections!.first_path = { to: 'home', kind: 'write' };
  const edge = model.nodes.home!.affordances.path_one!.connections!.first_path!;
  edge.label = 'A branch'; edge.metadata = { contract: ['v1'] };
  const before = structuredClone(model);
  const moved = moveConnection(model, 'home.path_one.first_path', 'home.path_two');
  assert.equal(moved.id, 'home.path_two.first_path_2');
  assert.deepEqual(connectionAt(moved.model, moved.id), edge);
  assert.deepEqual(connectionAt(moved.model, 'home.path_two.first_path'), { to: 'home', kind: 'write' });
  assert.equal(moved.model.nodes.home!.affordances.path_one!.connections, undefined);
  assert.deepEqual(model, before);
  assert.deepEqual(parseBreadboard(writeBreadboard(moved.model)), moved.model);
  const deleted = deleteConnection(moved.model, moved.id);
  assert.ok(!connections(deleted).some(connection => connection.id === moved.id));
  assert.equal(connections(moved.model).length, connections(model).length);
  assert.throws(() => moveConnection(model, 'home.path_one.first_path', 'missing.action'), /Missing source affordance/);
});

test('deleting a source node removes its owned paths but preserves incoming paths and scenarios', () => {
  const created = connect(fresh(), 'home.path_two', 'home.path_one');
  const removed = deleteAffordance(created.model, 'home', 'path_one');
  assert.ok(!connections(removed).some(edge => edge.id === 'home.path_one.first_path'));
  assert.ok(checkBreadboard(removed).some(finding => finding.ref === created.id));
  assert.ok(checkBreadboard(removed).some(finding => finding.ref === 'take_first_path'));
  const removedNode = deleteNode(created.model, 'home');
  assert.equal(connections(removedNode).length, 0);
  assert.ok(checkBreadboard(removedNode).some(finding => finding.ref === 'take_second_path'));
});
