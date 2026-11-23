import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { BreadboardError, parseBreadboard, writeBreadboard, validateBreadboard } from '../src/index.ts';
import { checkBreadboard } from '../src/editor/model.ts';

const old = () => ({ version: '0.1', title: 'Old document', slices: { checkout: { label: 'Create an Order', metadata: { note: 'Keep me' } } },
  nodes: { cart: { kind: 'component', label: 'Cart', slice: 'checkout', affordances: { create: { kind: 'capability', label: 'Create Cart' } }, data: { cart: { label: 'Cart', attributes: ['id'] } } },
    payment: { kind: 'place', label: 'Payment', slice: 'checkout', affordances: { next: { kind: 'action', label: 'Next', connections: { cart: { to: 'cart.create', kind: 'invoke' } } } } } },
  layout: { nodes: { cart: { x: 100, y: 200 }, payment: { x: 600, y: 200 } }, slices: { checkout: { x: 0, y: 0, w: 1000, h: 500 } }, connections: { 'payment.next.cart': { x: 550 } } },
});

test('old spatial groups import as areas while retaining residents, data, routes, and region metadata', () => {
  const legacy = old(), model = parseBreadboard(stringify(legacy));
  assert.deepEqual(model.areas!.checkout, legacy.slices.checkout);
  assert.equal(model.nodes.cart!.area, 'checkout');
  assert.equal(model.nodes.payment!.area, 'checkout');
  assert.deepEqual(model.nodes.cart!.data, legacy.nodes.cart.data);
  assert.deepEqual(model.nodes.payment!.affordances, legacy.nodes.payment.affordances);
  assert.deepEqual(model.layout!.nodes, legacy.layout.nodes);
  assert.deepEqual(model.layout!.connections, legacy.layout.connections);
  assert.deepEqual(model.metadata!.legacy_regions, legacy.layout.slices);
  assert.equal(Object.hasOwn(model, 'slices'), false);
  assert.equal(Object.hasOwn(model.nodes.cart!, 'slice'), false);
  assert.equal(Object.hasOwn(model.layout!, 'slices'), false);
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
  assert.equal(checkBreadboard(model).filter(finding => finding.severity === 'error').length, 0);
});

test('import avoids collisions and preserves existing area assignments and metadata', () => {
  const legacy = { ...old(), areas: { checkout: { label: 'Existing area' } }, metadata: { legacy_regions: { keep: true } } };
  Object.assign(legacy.nodes.cart, { area: 'checkout', metadata: { legacy_membership: 'keep' } });
  const model = parseBreadboard(stringify(legacy));
  assert.equal(model.areas!.checkout!.label, 'Existing area');
  assert.equal(model.areas!.checkout_2!.label, 'Create an Order');
  assert.equal(model.nodes.cart!.area, 'checkout');
  assert.equal(model.nodes.payment!.area, 'checkout_2');
  assert.deepEqual(model.nodes.cart!.metadata, { legacy_membership: 'keep', legacy_membership_2: 'checkout' });
  assert.deepEqual(model.metadata!.legacy_regions, { keep: true });
  assert.deepEqual(model.metadata!.legacy_regions_2, legacy.layout.slices);
});

test('dangling memberships remain unresolved rather than silently joining an existing area', () => {
  const legacy = { ...old(), areas: { checkout: { label: 'Existing area' } } };
  delete (legacy as { slices?: unknown }).slices;
  const model = parseBreadboard(stringify(legacy));
  assert.equal(model.nodes.cart!.area, 'checkout_2');
  assert.equal(model.areas!.checkout_2, undefined);
  assert.ok(checkBreadboard(model).some(finding => /missing area/.test(finding.message)));
});

test('new documents cannot write or validate retired fields, and malformed imports are rejected', () => {
  assert.throws(() => writeBreadboard(old()), BreadboardError);
  assert.throws(() => validateBreadboard(old()), BreadboardError);
  const invalid = old(); invalid.layout.slices.checkout.w = -1;
  assert.throws(() => parseBreadboard(stringify(invalid)), BreadboardError);
  const extra = old(); Object.assign(extra.nodes.cart, { unknown: true });
  assert.throws(() => parseBreadboard(stringify(extra)), BreadboardError);
  const badMembership = old(); Object.assign(badMembership.nodes.cart, { slice: ['checkout'] });
  assert.throws(() => parseBreadboard(stringify(badMembership)), BreadboardError);
});

test('prototype-like IDs cannot turn dangling legacy memberships into real areas', () => {
  const legacy = old(); legacy.nodes.cart.slice = 'constructor';
  const model = parseBreadboard(stringify(legacy));
  assert.equal(model.nodes.cart!.area, 'constructor');
  assert.equal(Object.hasOwn(model.areas!, 'constructor'), false);
  assert.ok(checkBreadboard(model).some(finding => /missing area/.test(finding.message)));
});
