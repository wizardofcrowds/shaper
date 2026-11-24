import type { Affordance, BreadboardNode, DataElement } from './model.ts';

export const NODE_WIDTH = 300;
export const HEADER_HEIGHT = 84;
export const ROW_HEIGHT = 48;
export const ATTRIBUTE_HEIGHT = 28;
export const TAG_HEIGHT = 22;
export const AFFORDANCE_TAG_HEIGHT = 18;
export const NODE_TAG_WIDTH = NODE_WIDTH - 24;
export const AFFORDANCE_TAG_WIDTH = NODE_WIDTH - 76;
export const TAG_GAP = 4;

/** Explicit chip widths keep browser rendering and importer layout deterministic. */
export function tagChipWidth(tag: string, width = NODE_TAG_WIDTH): number {
  return Math.min(width, tag.length * 6 + 16);
}
export function tagRows(tags: readonly string[] = [], width = NODE_TAG_WIDTH): string[][] {
  const rows: string[][] = [];
  let used = 0;
  for (const tag of tags) {
    const chip = tagChipWidth(tag, width);
    if (!rows.length || used + TAG_GAP + chip > width) { rows.push([]); used = 0; }
    rows.at(-1)!.push(tag);
    used += (used ? TAG_GAP : 0) + chip;
  }
  return rows;
}
export function affordanceIds(node: BreadboardNode): string[] {
  return [...new Set([...(node.affordance_order ?? []), ...Object.keys(node.affordances)])]
    .filter(id => Object.hasOwn(node.affordances, id));
}
export function nodeHeaderHeight(node: BreadboardNode): number {
  return HEADER_HEIGHT + tagRows(node.tags).length * TAG_HEIGHT;
}
export function affordanceHeight(affordance: Affordance): number {
  return ROW_HEIGHT + tagRows(affordance.tags, AFFORDANCE_TAG_WIDTH).length * AFFORDANCE_TAG_HEIGHT;
}
function affordancesHeight(node: BreadboardNode): number {
  return Object.keys(node.affordances).length ? Object.values(node.affordances).reduce((sum, row) => sum + affordanceHeight(row), 0) : ROW_HEIGHT;
}
export function dataHeight(element: DataElement): number {
  return ROW_HEIGHT + (element.attributes?.length ?? 0) * ATTRIBUTE_HEIGHT;
}
export function nodeHeight(node: BreadboardNode): number {
  return nodeHeaderHeight(node) + affordancesHeight(node)
    + Object.values(node.data ?? {}).reduce((sum, element) => sum + dataHeight(element), 0) + 12;
}
export function affordanceY(node: BreadboardNode, id: string): number {
  const ids = affordanceIds(node);
  return nodeHeaderHeight(node) + ids.slice(0, ids.indexOf(id)).reduce((sum, key) => sum + affordanceHeight(node.affordances[key]!), 0) + ROW_HEIGHT / 2;
}
export function dataRowY(node: BreadboardNode, id: string): number {
  const ids = Object.keys(node.data ?? {}).sort();
  return nodeHeaderHeight(node) + affordancesHeight(node)
    + ids.slice(0, ids.indexOf(id)).reduce((sum, key) => sum + dataHeight(node.data![key]!), 0) + ROW_HEIGHT / 2;
}
