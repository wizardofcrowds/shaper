import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseBreadboard, writeBreadboard, BreadboardError, nodeHeight, nodeHeaderHeight, affordanceY, affordanceHeight, dataRowY, tagRows, tagChipWidth, TAG_GAP, HEADER_HEIGHT, ROW_HEIGHT } from '../src/index.ts';
import type { Breadboard } from '../src/model.ts';
import { allTags, tagGroups, validateTag } from '../src/tags.ts';
import { areaNodeIds, areaCrossings } from '../src/editor/areas.ts';
import { deleteNode, deleteAffordance, deleteConnection, edgeGeometry, moveConnection, withLayout } from '../src/editor/model.ts';

const fresh = (): Breadboard => withLayout({ version: '0.1', title: 'Annotations', areas: { intake: { label: 'Intake' }, staff: { label: 'Staff' } }, nodes: {
  team: { kind: 'place', label: 'Team', area: 'intake', tags: ['role:lms_admin', 'role:employer_payroll', 'review'], notes: 'Human note\nKeep this line.', metadata: { source: 'src/pages/Team.tsx:42', notes: 'Code-owned note', roles: ['lms_admin'], nested: { visible: true, count: 2 }, source_hint: '<script>not executable</script>' }, affordances: {
    next: { kind: 'action', label: 'Next', tags: ['role:lms_admin'], notes: 'Confirm this action.', metadata: { leads_to_hint: 'policies' }, connections: { go: { kind: 'navigate', to: 'policies', notes: 'Only after setup.', metadata: { extracted: false } } } },
    remove: { kind: 'action', label: 'Remove', tags: ['role:employer_payroll'] },
  } },
  policies: { kind: 'place', label: 'Policies', area: 'intake', tags: ['role:lms_admin'], affordances: {} },
  review: { kind: 'component', label: 'Review', area: 'staff', tags: ['role:employer_payroll'], notes: 'Staff review', affordances: {}, data: { request: { label: 'Request', attributes: ['id'] } } },
} });

test('tags and notes round-trip in their supported locations without changing prefixes, order or metadata', () => {
  const model = fresh(), original = structuredClone(model);
  const reopened = parseBreadboard(writeBreadboard(model));
  assert.deepEqual(reopened, model);
  assert.deepEqual(reopened.nodes.team!.tags, ['role:lms_admin', 'role:employer_payroll', 'review']);
  assert.equal(reopened.nodes.team!.affordances.next!.connections!.go!.notes, 'Only after setup.');
  assert.deepEqual(model, original);
  assert.deepEqual(reopened.nodes.team!.metadata, model.nodes.team!.metadata);
});

test('tag validation rejects blank, untrimmed, duplicate, uppercase, spaced or multiple-prefix tags', () => {
  for (const tags of [[''], [' '], ['UPPER'], ['role:Lms'], ['has space'], [' padded'], ['padded '], ['a:b:c'], [':role'], ['role:'], ['a', 'a'], ['ä'], [2]]) {
    const invalid = fresh(); Object.assign(invalid.nodes.team!, { tags });
    assert.throws(() => writeBreadboard(invalid), BreadboardError, JSON.stringify(tags));
  }
  for (const tag of ['role:lms_admin', 'feature-1', 'v2', 'group:0_a-b', '_', '-']) assert.equal(validateTag(tag), tag);
  assert.equal(validateTag(' role:lms_admin '), 'role:lms_admin');
  assert.throws(() => validateTag('role:Admin'));
});

test('tags and notes cannot be added to unsupported elements; unknown keys remain errors', () => {
  const locations = [(model: Breadboard) => model.nodes.team!.affordances.next!.connections!.go!, (model: Breadboard) => model.areas!.intake!, (model: Breadboard) => model.nodes.review!.data!.request!];
  for (const location of locations) { const invalid = fresh(); Object.assign(location(invalid), { tags: ['test'] }); assert.throws(() => writeBreadboard(invalid), BreadboardError); }
  const invalid = fresh(); Object.assign(invalid.nodes.team!, { note: 'misspelled' });
  assert.throws(() => writeBreadboard(invalid), BreadboardError);
  Object.assign(invalid.nodes.team!.affordances.next!, { tags: ['bad tag'] });
  assert.throws(() => writeBreadboard(invalid), BreadboardError);
});

test('writer omits blank first-class notes without trimming meaningful notes or metadata and without mutating input', () => {
  const model = fresh(); model.nodes.team!.notes = ' \n\t'; model.nodes.team!.affordances.next!.notes = ''; model.nodes.team!.affordances.next!.connections!.go!.notes = '  ';
  model.nodes.team!.metadata!.notes = '  '; model.nodes.review!.notes = '  meaningful\n  indentation\n';
  const before = structuredClone(model), reopened = parseBreadboard(writeBreadboard(model));
  assert.equal(reopened.nodes.team!.notes, undefined);
  assert.equal(reopened.nodes.team!.affordances.next!.notes, undefined);
  assert.equal(reopened.nodes.team!.affordances.next!.connections!.go!.notes, undefined);
  assert.equal(reopened.nodes.team!.metadata!.notes, '  ');
  assert.equal(reopened.nodes.review!.notes, model.nodes.review!.notes);
  assert.deepEqual(model, before);
});

test('tag and area filters combine with AND, do not inherit affordance tags, and retain outside connections', () => {
  const model = fresh(), before = structuredClone(model);
  assert.deepEqual([...areaNodeIds(model, '', 'role:employer_payroll')], ['team', 'review']);
  assert.deepEqual([...areaNodeIds(model, 'intake', 'role:employer_payroll')], ['team']);
  assert.equal(areaNodeIds(model, 'staff', 'role:lms_admin').size, 0);
  delete model.nodes.team!.tags;
  assert.equal(areaNodeIds(model, '', 'role:employer_payroll').has('team'), false);
  const crossings = areaCrossings(before, '', 'role:employer_payroll');
  assert.equal(crossings.length, 1); assert.equal(crossings[0]!.outside, 'policies');
  assert.deepEqual(before, fresh());
});

test('suggestions include every file tag; grouping never rewrites stored tags', () => {
  const model = fresh(); model.nodes.team!.affordances.next!.tags!.push('status:draft');
  assert.deepEqual(allTags(model), ['role:lms_admin', 'role:employer_payroll', 'review', 'status:draft']);
  assert.deepEqual(tagGroups(allTags(model)).map(group => group.label), ['role', 'status', 'Without prefix']);
  assert.deepEqual(model.nodes.team!.tags, ['role:lms_admin', 'role:employer_payroll', 'review']);
});

test('shared geometry gives old dimensions for untagged nodes and exact header/row endpoint offsets for tags', () => {
  const model = fresh(), original = structuredClone(model);
  const plain = { kind: 'place' as const, label: 'Plain', affordances: { a: { kind: 'action' as const, label: 'A' } } };
  assert.equal(nodeHeight(plain), 84 + 48 + 12);
  assert.equal(nodeHeaderHeight(plain), HEADER_HEIGHT);
  assert.equal(affordanceHeight(plain.affordances.a), ROW_HEIGHT);
  assert.equal(affordanceY(plain, 'a'), HEADER_HEIGHT + ROW_HEIGHT / 2);
  const node = model.nodes.team!;
  const geometry = edgeGeometry(model)[0]!;
  assert.equal(geometry.sy + geometry.y, model.layout!.nodes!.team!.y + affordanceY(node, 'next'));
  const beforeSecond = affordanceY(node, 'remove');
  node.affordances.next!.tags!.push('long:another_extra_long_tag_to_force_wrapping');
  assert.ok(affordanceY(node, 'remove') > beforeSecond);
  assert.deepEqual(model.nodes.team!.affordances.next!.connections, original.nodes.team!.affordances.next!.connections);
  const component = model.nodes.review!; const beforeData = dataRowY(component, 'request');
  component.tags!.push('another:really_long_tag_name_to_force_a_new_line');
  assert.ok(dataRowY(component, 'request') > beforeData);
  for (const width of [224, 276]) for (const row of tagRows(['role:lms_admin', 'role:employer_payroll', 'long:'.padEnd(100, 'x')], width)) {
    assert.ok(row.reduce((sum, tag) => sum + tagChipWidth(tag, width), 0) + TAG_GAP * (row.length - 1) <= width);
  }
});

test('deleting annotated elements removes their annotations; moving connections preserves notes and metadata', () => {
  const model = fresh(), before = structuredClone(model);
  assert.equal(deleteNode(model, 'team').nodes.team, undefined);
  assert.equal(deleteAffordance(model, 'team', 'next').nodes.team!.affordances.next, undefined);
  assert.equal(deleteConnection(model, 'team.next.go').nodes.team!.affordances.next!.connections, undefined);
  const moved = moveConnection(model, 'team.next.go', 'team.remove');
  assert.equal(moved.model.nodes.team!.affordances.remove!.connections!.go!.notes, 'Only after setup.');
  assert.deepEqual(moved.model.nodes.team!.affordances.remove!.connections!.go!.metadata, { extracted: false });
  assert.deepEqual(model, before);
});

test('the annotated example parses, preserves semantics and carries geometry for tags', () => {
  const model = parseBreadboard(readFileSync(new URL('../examples/onboarding.breadboard.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(parseBreadboard(writeBreadboard(model)), model);
  assert.ok(model.nodes.onb_team!.tags?.length);
  assert.ok(nodeHeight(model.nodes.onb_team!) > 84 + 3 * 48 + 12);
});
