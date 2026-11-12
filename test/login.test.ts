import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBreadboard, writeBreadboard, BreadboardError } from '../src/index.ts';
import type { Breadboard } from '../src/model.ts';
import { checkBreadboard, edgeGeometry, moveConnection, withLayout } from '../src/editor/model.ts';

const fresh = (): Breadboard => withLayout({ version: '0.1', title: 'Login patterns', nodes: {
  articles: { kind: 'place', label: 'Articles', affordances: { show: { kind: 'action', label: 'Show article', connections: { detail: { kind: 'navigate', to: 'detail', login: { via: 'login' } } } } } },
  detail: { kind: 'place', label: 'Article Detail', affordances: {} },
  payment: { kind: 'place', label: 'Payment Method & Contact', affordances: { member_login: { kind: 'action', label: 'Member Login', connections: { login: { kind: 'detour', to: 'login' } } } } },
  login: { kind: 'place', label: 'Member Login', affordances: {} },
} });

test('login guard and optional detour round-trip without extra login or return edges', () => {
  const model = fresh();
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
  const edges = edgeGeometry(model);
  assert.equal(edges.length, 2, 'login requirements do not create another canvas edge');
  assert.equal(edges.find(edge => edge.connection.login)!.connection.to, 'detail');
  assert.equal(edges.find(edge => edge.connection.kind === 'detour')!.connection.from, 'payment.member_login');
  assert.equal(checkBreadboard(model).filter(finding => finding.severity !== 'info').length, 0);
});

test('checks reports missing login places and incomplete guards', () => {
  const model = fresh();
  model.nodes.articles!.affordances.show!.connections!.detail!.login = {};
  assert.ok(checkBreadboard(model).some(finding => finding.severity === 'warning' && /not specified/.test(finding.message)));
  model.nodes.articles!.affordances.show!.connections!.detail!.login = { via: 'missing' };
  assert.ok(checkBreadboard(model).some(finding => finding.severity === 'error' && /login place/.test(finding.message)));
  model.nodes.login!.kind = 'component';
  model.nodes.articles!.affordances.show!.connections!.detail!.login = { via: 'login' };
  assert.ok(checkBreadboard(model).some(finding => /not a place/.test(finding.message)));
  assert.ok(checkBreadboard(model).some(finding => /detours must lead to a place/.test(finding.message)));
});

test('login only annotates navigation and detours point to whole places', () => {
  for (const kind of ['invoke', 'write', 'detour'] as const) {
    const model = fresh(); model.nodes.articles!.affordances.show!.connections!.detail!.kind = kind;
    assert.throws(() => writeBreadboard(model), BreadboardError);
  }
  const model = fresh(); model.nodes.payment!.affordances.member_login!.connections!.login!.to = 'login.submit';
  assert.throws(() => writeBreadboard(model), BreadboardError);
  const badLogin = fresh(); badLogin.nodes.articles!.affordances.show!.connections!.detail!.login = { via: 'login.submit' };
  assert.throws(() => writeBreadboard(badLogin), BreadboardError);
});

test('moving a connection preserves its login configuration and recalculates the detour caller', () => {
  const model = fresh();
  const moved = moveConnection(model, 'articles.show.detail', 'payment.member_login');
  assert.deepEqual(moved.model.nodes.payment!.affordances.member_login!.connections!.detail!.login, { via: 'login' });
  const detour = moveConnection(model, 'payment.member_login.login', 'articles.show');
  assert.equal(edgeGeometry(detour.model).find(edge => edge.id === detour.id)!.connection.from, 'articles.show');
  assert.deepEqual(parseBreadboard(writeBreadboard(detour.model)), detour.model);
});

test('scenario checks do not assume login success or execute detours', () => {
  const model = fresh();
  model.scenarios = [
    { id: 'article', goal: 'Read selected article', start: 'articles', steps: ['articles.show'], end: 'detail' },
    { id: 'prefill', goal: 'Return after optional login', start: 'payment', steps: ['payment.member_login'], end: 'payment' },
  ];
  assert.equal(checkBreadboard(model).filter(finding => finding.severity === 'warning' && /login outcome/.test(finding.message)).length, 2);
  assert.equal(checkBreadboard(model).filter(finding => finding.severity === 'error').length, 0);
});
