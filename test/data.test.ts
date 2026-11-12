import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { BreadboardError, parseBreadboard, writeBreadboard } from '../src/index.ts';
import type { Breadboard } from '../src/model.ts';
import { addAssociation, addAttribute, renameAttribute, deleteAttribute, addData, associationGeometry, dataElements, deleteAssociation, deleteData, editAssociation } from '../src/editor/data.ts';
import { addAffordance, checkBreadboard, deleteNode, nodeHeight, withLayout } from '../src/editor/model.ts';

const fresh = (): Breadboard => withLayout({ version: '0.1', title: 'Ordering', nodes: {
  ordering: { kind: 'component', label: 'Ordering', affordances: { place_order: { kind: 'capability', label: 'Place order' } } },
  explorations: { kind: 'component', label: 'Explorations', affordances: {} },
  gateway: { kind: 'component', label: 'Payment gateway', affordances: {} },
  checkout: { kind: 'place', label: 'Checkout', affordances: { submit: { kind: 'action', label: 'Submit', connections: { place: { to: 'ordering.place_order', kind: 'invoke' } } } } },
} });
function fixture() {
  let model = addData(fresh(), 'ordering').model;
  model = addData(model, 'explorations').model;
  model.nodes.ordering!.data!.data!.label = 'Order';
  model.nodes.explorations!.data!.data!.label = 'Guided Exploration';
  const added = addAssociation(model, 'ordering.data', 'explorations.data');
  model = editAssociation(added.model, added.id, entry => {
    entry.label = 'contains purchased explorations'; entry.from_cardinality = '1'; entry.to_cardinality = '0..*'; entry.metadata = { deferred: true };
  });
  model.nodes.ordering!.data!.data!.metadata = { note: 'Financial transaction' };
  return { model, id: added.id };
}

test('components with behavior, data, both or neither survive YAML round trips', () => {
  const { model, id } = fixture();
  const reopened = parseBreadboard(writeBreadboard(model));
  assert.deepEqual(reopened, model);
  assert.equal(reopened.nodes.gateway!.data, undefined);
  assert.equal(reopened.associations![id]!.to_cardinality, '0..*');
  assert.equal(checkBreadboard(reopened).filter(finding => finding.severity === 'error').length, 0);
  assert.equal(nodeHeight(reopened.nodes.ordering!), nodeHeight(fresh().nodes.ordering!) + 48);
  assert.throws(() => addData(model, 'checkout'), /components/);
  const invalid = structuredClone(model); invalid.nodes.checkout!.data = { order: { label: 'Order' } };
  assert.throws(() => writeBreadboard(invalid), BreadboardError);
});

test('associations stay separate from affordances and do not become navigation steps', () => {
  const { model, id } = fixture();
  // IDs can overlap: the namespaces are deliberately distinct.
  model.nodes.ordering!.affordances.data = { kind: 'capability', label: 'Unrelated behavior' };
  assert.equal(dataElements(model).find(element => element.id === 'ordering.data')!.label, 'Ordering / Order');
  assert.equal(model.associations![id]!.from, 'ordering.data');
  const invalid = structuredClone(model); invalid.nodes.checkout!.affordances.submit!.connections!.place!.to = 'explorations.data';
  assert.ok(checkBreadboard(invalid).some(finding => finding.message.includes('explorations.data')));
  assert.throws(() => addAssociation(model, 'checkout.submit', 'ordering.data'), /data elements/);
  const wrongEnd = editAssociation(model, id, entry => { entry.to = 'checkout.submit'; });
  assert.ok(checkBreadboard(wrongEnd).some(finding => finding.message.includes('missing data element')));
});

test('geometry attaches to data rows, follows growth and moves, and persists manual lanes', () => {
  const { model, id } = fixture();
  const before = associationGeometry(model)[0]!;
  const grown = addAffordance(model, 'ordering').model;
  const after = associationGeometry(grown)[0]!;
  assert.equal(after.y + after.sy, before.y + before.sy + 48);
  const moved = structuredClone(model); moved.layout!.nodes!.explorations!.y += 150;
  assert.equal(associationGeometry(moved)[0]!.y + associationGeometry(moved)[0]!.ey, before.y + before.ey + 150);
  model.layout!.associations = { [id]: { x: 1200 } };
  const routed = associationGeometry(parseBreadboard(writeBreadboard(model)))[0]!;
  assert.equal(routed.x + routed.mx, 1200);
  delete model.layout!.associations[id];
  assert.deepEqual(associationGeometry(model), [before]);
});

test('deleting data or its component retains associations and reports dangling ends', () => {
  const { model, id } = fixture();
  const removed = deleteData(model, 'ordering', 'data');
  assert.deepEqual(removed.associations![id], model.associations![id]);
  assert.ok(checkBreadboard(removed).some(finding => finding.message.includes('ordering.data')));
  assert.deepEqual(associationGeometry(removed), []);
  const missingComponent = deleteNode(model, 'explorations');
  assert.ok(checkBreadboard(missingComponent).some(finding => finding.message.includes('explorations.data')));
  assert.deepEqual(parseBreadboard(writeBreadboard(missingComponent)), missingComponent);
  model.layout!.associations = { [id]: { x: 700 } };
  const removedAssociation = deleteAssociation(model, id);
  assert.equal(removedAssociation.associations![id], undefined);
  assert.equal(removedAssociation.layout!.associations![id], undefined);
});

test('renaming data preserves IDs, associations, and metadata; malformed associations are rejected', () => {
  const { model, id } = fixture();
  model.nodes.ordering!.data!.data!.label = 'Purchase order';
  assert.equal(model.associations![id]!.from, 'ordering.data');
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
  const invalid = structuredClone(model);
  Object.assign(invalid.associations![id]!, { to_cardinality: 'lots' });
  assert.throws(() => writeBreadboard(invalid), BreadboardError);
  Object.assign(invalid.associations![id]!, { to_cardinality: '1', from: 'ordering' });
  assert.throws(() => writeBreadboard(invalid), BreadboardError);
  const original = fresh();
  assert.equal(parseBreadboard(writeBreadboard(original)).associations, undefined);
  assert.equal(original.nodes.ordering!.data, undefined);
});

test('one component holds Order and LineItem with a one-to-many association and no attributes', () => {
  let model = fresh();
  const first = addData(model, 'ordering');
  const second = addData(first.model, 'ordering');
  model = second.model;
  model.nodes.ordering!.data![first.id]!.label = 'Order';
  model.nodes.ordering!.data![second.id]!.label = 'LineItem';
  const linked = addAssociation(model, `ordering.${first.id}`, `ordering.${second.id}`);
  model = editAssociation(linked.model, linked.id, entry => {
    entry.label = 'contains'; entry.from_cardinality = '1'; entry.to_cardinality = '0..*';
  });
  const reopened = parseBreadboard(writeBreadboard(model));
  assert.deepEqual(reopened, model);
  assert.equal(Object.keys(reopened.nodes.ordering!.data!).length, 2);
  assert.notEqual(first.id, second.id);
  assert.equal(checkBreadboard(reopened).filter(finding => finding.severity === 'error').length, 0);
  const geometry = associationGeometry(reopened)[0]!;
  assert.equal(geometry.x + geometry.sx, geometry.x + geometry.ex, 'both ends attach to the component’s right side');
  assert.equal(Math.abs(geometry.sy - geometry.ey), 48, 'endpoints attach to distinct data rows');
  assert.ok(geometry.mx > geometry.sx, 'automatic lane goes around the outside');

  reopened.layout!.associations = { [linked.id]: { x: -100 } };
  const dragged = associationGeometry(reopened)[0]!;
  assert.equal(dragged.x + dragged.ex, geometry.x + geometry.ex, 'dragging cannot switch the target to the far side');
  assert.ok(dragged.mx > dragged.sx, 'an internal lane cannot be dragged through the component');
  reopened.layout!.nodes!.ordering!.x += 100;
  const moved = associationGeometry(reopened)[0]!;
  assert.equal(moved.x + moved.sx, geometry.x + geometry.sx + 100);
  assert.equal(moved.x + moved.ex, geometry.x + geometry.ex + 100);
  assert.ok(moved.mx > moved.sx);
  const removed = deleteData(reopened, 'ordering', second.id);
  assert.ok(removed.nodes.ordering!.data![first.id]);
  assert.ok(checkBreadboard(removed).some(finding => finding.message.includes(`ordering.${second.id}`)));
});


test('the Ordering example keeps its behavioral connection and internal data association separate', () => {
  const model = parseBreadboard(readFileSync(new URL('../examples/ordering.breadboard.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
  assert.equal(model.associations!.order_items!.from, 'ordering.order');
  assert.equal(model.associations!.order_items!.to, 'ordering.line_item');
  assert.equal(model.nodes.checkout!.affordances.submit!.connections!.place_order!.to, 'ordering.place_order');
  assert.equal(associationGeometry(model).length, 1);
  assert.equal(checkBreadboard(model).filter(finding => finding.severity === 'error').length, 0);
});


test('embedded attributes can be added, renamed and removed without changing associations', () => {
  const { model, id } = fixture();
  const original = structuredClone(model);
  let changed = addAttribute(model, 'ordering', 'data', ' order_id ');
  changed = addAttribute(changed, 'ordering', 'data', 'quantity');
  assert.deepEqual(changed.nodes.ordering!.data!.data!.attributes, ['order_id', 'quantity']);
  changed = renameAttribute(changed, 'ordering', 'data', 1, 'item_count');
  assert.deepEqual(changed.nodes.ordering!.data!.data!.attributes, ['order_id', 'item_count']);
  assert.deepEqual(parseBreadboard(writeBreadboard(changed)), changed);
  assert.deepEqual(changed.associations![id], model.associations![id]);
  assert.deepEqual(changed.nodes.ordering!.data!.data!.metadata, model.nodes.ordering!.data!.data!.metadata);
  assert.deepEqual(model, original, 'attribute edits do not mutate their input');
  changed = deleteAttribute(changed, 'ordering', 'data', 0);
  assert.deepEqual(changed.nodes.ordering!.data!.data!.attributes, ['item_count']);
  changed = deleteAttribute(changed, 'ordering', 'data', 0);
  assert.equal(changed.nodes.ordering!.data!.data!.attributes, undefined);
  assert.deepEqual(changed, model, 'removing the last attribute restores the original shape');
});

test('attributes shift later data headers and component bounds while keeping association identity', () => {
  let model = fresh();
  model.nodes.ordering!.data = { order: { label: 'Order' }, item: { label: 'LineItem' } };
  const linked = addAssociation(model, 'ordering.order', 'ordering.item');
  model = linked.model;
  const before = associationGeometry(model)[0]!;
  let changed = addAttribute(model, 'ordering', 'item', 'order_id');
  changed = addAttribute(changed, 'ordering', 'item', 'quantity');
  const after = associationGeometry(changed)[0]!;
  assert.equal(nodeHeight(changed.nodes.ordering!), nodeHeight(model.nodes.ordering!) + 56);
  assert.equal(after.y + after.sy, before.y + before.sy + 56, 'the later Order header moves down');
  assert.equal(after.y + after.ey, before.y + before.ey, 'LineItem endpoint stays on its header');
  assert.deepEqual(after.association, before.association);
  changed = deleteAttribute(changed, 'ordering', 'item', 1);
  changed = deleteAttribute(changed, 'ordering', 'item', 0);
  assert.deepEqual(associationGeometry(changed), associationGeometry(model));
});

test('blank, duplicate and malformed attributes are rejected, and attributes are not association endpoints', () => {
  const { model, id } = fixture();
  const changed = addAttribute(model, 'ordering', 'data', 'id');
  assert.throws(() => addAttribute(changed, 'ordering', 'data', ' id '), /unique/);
  assert.throws(() => addAttribute(changed, 'ordering', 'data', '  '), /name/);
  assert.throws(() => addAttribute(changed, 'ordering', 'missing', 'id'), /no longer exists/);
  assert.throws(() => renameAttribute(changed, 'ordering', 'data', 5, 'id'), /no longer exists/);
  const two = addAttribute(changed, 'ordering', 'data', 'status');
  assert.throws(() => renameAttribute(two, 'ordering', 'data', 1, 'id'), /unique/);
  assert.throws(() => addAssociation(changed, 'ordering.data.id', 'explorations.data'), /two data elements/);
  for (const attributes of [['id', 'id'], [''], ['   '], [123], 'id']) {
    const invalid = structuredClone(model);
    Object.assign(invalid.nodes.ordering!.data!.data!, { attributes });
    assert.throws(() => writeBreadboard(invalid), BreadboardError);
  }
  const invalidEnd = editAssociation(changed, id, entry => { entry.from = 'ordering.data.id'; });
  assert.throws(() => writeBreadboard(invalidEnd), BreadboardError);
});
