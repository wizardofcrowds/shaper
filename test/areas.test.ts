import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BreadboardError, parseBreadboard, writeBreadboard } from '../src/index.ts';
import type { Breadboard } from '../src/model.ts';
import { addArea, renameArea, deleteArea, assignArea, areaNodeIds, areaCrossings, UNASSIGNED_AREA } from '../src/editor/areas.ts';
import { checkBreadboard, withLayout } from '../src/editor/model.ts';

const fresh = (): Breadboard => withLayout({ version: '0.1', title: 'Areas', nodes: {
  checkout: { kind: 'place', label: 'Checkout', affordances: { next: { kind: 'action', label: 'Next', connections: { order: { to: 'ordering.create', kind: 'invoke' }, details: { to: 'details', kind: 'navigate', login: { via: 'login' } } } } } },
  details: { kind: 'place', label: 'Details', affordances: {} },
  ordering: { kind: 'component', label: 'Ordering', affordances: { create: { kind: 'capability', label: 'Create order' } }, data: { order: { label: 'Order', attributes: ['id'] } } },
  cart: { kind: 'component', label: 'Cart', affordances: {}, data: { item: { label: 'Cart Item' } } },
  login: { kind: 'place', label: 'Login', affordances: {} },
}, associations: { contents: { from: 'ordering.order', to: 'cart.item', label: 'purchased items' } },
});
function fixture() {
  const first = addArea(fresh(), 'Create an Order');
  const second = addArea(first.model, 'Staff Operations');
  let model = assignArea(second.model, 'checkout', first.id);
  model = assignArea(model, 'details', first.id);
  model = assignArea(model, 'ordering', second.id);
  return { model, order: first.id, staff: second.id };
}

test('areas and membership round-trip independently of layout', () => {
  const { model, order } = fixture();
  model.areas![order]!.metadata = { note: 'Product task area' };
  const reopened = parseBreadboard(writeBreadboard(model));
  assert.deepEqual(reopened, model);
  assert.equal(checkBreadboard(model).filter(finding => finding.severity === 'error').length, 0);
  const changed = assignArea(model, 'checkout', null);
  assert.equal(changed.nodes.checkout!.area, undefined);
  assert.deepEqual(changed.layout, model.layout);
  assert.deepEqual(changed.nodes.checkout!.affordances, model.nodes.checkout!.affordances);
  assert.equal(model.nodes.checkout!.area, order);
});

test('area creation and renaming keep stable IDs and reject empty or duplicate names', () => {
  const { model, order } = fixture();
  const renamed = renameArea(model, order, ' Checkout ');
  assert.equal(renamed.areas![order]!.label, 'Checkout');
  assert.equal(renamed.nodes.checkout!.area, order);
  assert.equal(model.areas![order]!.label, 'Create an Order');
  assert.throws(() => addArea(model, ' create AN order '), /already exists/);
  assert.throws(() => renameArea(model, order, 'Staff Operations'), /already exists/);
  assert.throws(() => addArea(model, ' '), /needs a name/);
  assert.throws(() => assignArea(model, 'checkout', 'missing'), /existing area/);
  assert.throws(() => assignArea(model, 'missing', order), /no longer exists/);
});

test('deleting an area unassigns residents while preserving every node, wire, attribute and layout', () => {
  const { model, order, staff } = fixture();
  const deleted = deleteArea(model, order);
  assert.equal(deleted.areas![order], undefined);
  assert.equal(deleted.nodes.checkout!.area, undefined);
  assert.equal(deleted.nodes.details!.area, undefined);
  assert.equal(deleted.nodes.ordering!.area, staff);
  assert.deepEqual(deleted.layout, model.layout);
  assert.deepEqual(deleted.associations, model.associations);
  assert.deepEqual(deleted.nodes.ordering, model.nodes.ordering);
  assert.deepEqual(deleted.nodes.checkout!.affordances, model.nodes.checkout!.affordances);
  assert.deepEqual(parseBreadboard(writeBreadboard(deleted)), deleted);
});

test('filtering lists only residents and never mutates or truncates the document', () => {
  const { model, order, staff } = fixture(), before = structuredClone(model);
  assert.deepEqual([...areaNodeIds(model, order)], ['checkout', 'details']);
  assert.deepEqual([...areaNodeIds(model, staff)], ['ordering']);
  assert.deepEqual([...areaNodeIds(model, UNASSIGNED_AREA)], ['cart', 'login']);
  assert.equal(areaNodeIds(model, '').size, 5);
  assert.deepEqual(model, before);
});

test('cross-area summaries include incoming/outgoing wires, associations and hidden login dependencies', () => {
  const { model, order, staff } = fixture();
  const outgoing = areaCrossings(model, order);
  assert.deepEqual(outgoing.map(edge => edge.label), ['invoke', 'Login required']);
  assert.equal(outgoing.every(edge => edge.direction === 'out'), true);
  const staffEdges = areaCrossings(model, staff);
  assert.deepEqual(staffEdges.map(edge => [edge.label, edge.direction]), [['invoke', 'in'], ['purchased items', 'out']]);
  assert.equal(areaCrossings(model, UNASSIGNED_AREA).length, 2);
  assert.deepEqual(areaCrossings(model, ''), []);
});

test('legacy documents require no area fields; missing memberships and malformed areas are reported', () => {
  const model = fresh();
  assert.equal(parseBreadboard(writeBreadboard(model)).areas, undefined);
  model.nodes.checkout!.area = 'missing';
  assert.ok(checkBreadboard(model).some(finding => /missing area/.test(finding.message)));
  const invalid = fresh();
  invalid.areas = { area: { label: ' ' } };
  assert.throws(() => writeBreadboard(invalid), BreadboardError);
});
