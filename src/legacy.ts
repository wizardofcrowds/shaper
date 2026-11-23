import type { Breadboard, BreadboardNode, Metadata } from './model.ts';

/** Import-only support for retired spatial grouping fields. Never used by the writer. */
export const legacyGroupDefinition = {
  type: 'object', propertyNames: { $ref: '#/$defs/id' },
  additionalProperties: {
    type: 'object', required: ['label'], additionalProperties: false,
    properties: { label: { type: 'string', minLength: 1 }, metadata: { type: 'object' } },
  },
};
export const legacyGroupLayout = {
  type: 'object', propertyNames: { $ref: '#/$defs/id' },
  additionalProperties: {
    type: 'object', required: ['x', 'y', 'w', 'h'], additionalProperties: false,
    properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', minimum: 360 }, h: { type: 'number', minimum: 220 } },
  },
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function hasLegacyGroups(value: unknown): boolean {
  return record(value) && (Object.hasOwn(value, 'slices') || (record(value.layout) && Object.hasOwn(value.layout, 'slices'))
    || (record(value.nodes) && Object.values(value.nodes).some(node => record(node) && Object.hasOwn(node, 'slice'))));
}
interface LegacyGroup { label: string; metadata?: Metadata }
type LegacyModel = Omit<Breadboard, 'nodes' | 'layout'> & {
  nodes: Record<string, BreadboardNode & { slice?: string }>;
  slices?: Record<string, LegacyGroup>;
  layout?: NonNullable<Breadboard['layout']> & { slices?: Record<string, { x: number; y: number; w: number; h: number }> };
};
function preserve(metadata: Metadata | undefined, key: string, value: Metadata[string]): Metadata {
  const result = metadata ?? {};
  let name = key;
  for (let index = 2; Object.hasOwn(result, name); index++) name = `${key}_${index}`;
  result[name] = value;
  return result;
}
/** Called only after validating the legacy shape and JSON-compatible values. */
export function importLegacyGroups(value: unknown): Breadboard {
  const next = structuredClone(value) as LegacyModel;
  const reserved = new Set(Object.keys(next.areas ?? {}));
  // Reserve dangling area references too, so importing cannot silently resolve them.
  for (const node of Object.values(next.nodes)) if (node.area) reserved.add(node.area);
  const names = new Map<string, string>();
  const ids = new Set([...Object.keys(next.slices ?? {}), ...Object.values(next.nodes).flatMap(node => node.slice ? [node.slice] : [])]);
  for (const oldId of ids) {
    let id = oldId;
    for (let index = 2; reserved.has(id); index++) id = `${oldId}_${index}`;
    reserved.add(id); names.set(oldId, id);
    const definition = Object.hasOwn(next.slices ?? {}, oldId) ? next.slices![oldId] : undefined;
    if (definition) {
      next.areas ??= {};
      next.areas[id] = { ...definition, label: definition.label.trim() ? definition.label : oldId };
    }
  }
  for (const node of Object.values(next.nodes)) {
    if (node.slice) {
      if (!node.area) node.area = names.get(node.slice)!;
      else node.metadata = preserve(node.metadata, 'legacy_membership', node.slice);
    }
    delete node.slice;
  }
  if (next.layout?.slices) next.metadata = preserve(next.metadata, 'legacy_regions', next.layout.slices);
  if (next.layout) delete next.layout.slices;
  delete next.slices;
  return next;
}
