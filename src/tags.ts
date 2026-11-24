import type { Breadboard } from './model.ts';

export const TAG_PATTERN = '^[a-z0-9_-]+(?::[a-z0-9_-]+)?$';
export function validateTag(input: string): string {
  const tag = input.trim();
  if (!new RegExp(TAG_PATTERN).test(tag)) throw new Error('Use lowercase letters, digits, - or _, with at most one prefix:tag separator.');
  return tag;
}
export function allTags(model: Breadboard): string[] {
  return [...new Set(Object.values(model.nodes).flatMap(node => [...(node.tags ?? []), ...Object.values(node.affordances).flatMap(row => row.tags ?? [])]))];
}
export function tagGroups(tags: readonly string[]) {
  const prefixes = [...new Set(tags.map(tag => tag.includes(':') ? tag.split(':')[0]! : ''))].sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b));
  return prefixes.map(prefix => ({ label: prefix || 'Without prefix', tags: tags.filter(tag => (tag.includes(':') ? tag.split(':')[0]! : '') === prefix) }));
}
