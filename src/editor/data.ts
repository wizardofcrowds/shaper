import type { Breadboard, Association } from '../model.ts';
import { dataRowY, NODE_WIDTH, uniqueId } from './model.ts';

export function dataElements(model: Breadboard) {
  return Object.entries(model.nodes).flatMap(([nodeId, node]) => node.kind !== 'component' ? [] :
    Object.keys(node.data ?? {}).sort().map(id => ({ id: `${nodeId}.${id}`, nodeId, key: id, label: `${node.label} / ${node.data![id]!.label}` })));
}
export function dataResolves(model: Breadboard, ref: string): boolean {
  return dataElements(model).some(element => element.id === ref);
}
export function addData(model: Breadboard, nodeId: string) {
  const next = structuredClone(model), node = next.nodes[nodeId];
  if (!node || node.kind !== 'component') throw new Error('Data elements belong to components.');
  node.data ??= {};
  const id = uniqueId(node.data, 'data');
  node.data[id] = { label: 'New data element' };
  return { model: next, id };
}
export function deleteData(model: Breadboard, nodeId: string, id: string) {
  const next = structuredClone(model);
  if (next.nodes[nodeId]?.data) delete next.nodes[nodeId]!.data![id];
  // Retain associations so Checks exposes references that need a design decision.
  return next;
}
export function addAssociation(model: Breadboard, from: string, to: string) {
  if (!dataResolves(model, from) || !dataResolves(model, to)) throw new Error('Choose two data elements.');
  const next = structuredClone(model);
  next.associations ??= {};
  const id = uniqueId(next.associations, 'association');
  next.associations[id] = { from, to };
  return { model: next, id };
}
export function deleteAssociation(model: Breadboard, id: string) {
  const next = structuredClone(model);
  if (next.associations) delete next.associations[id];
  if (next.layout?.associations) delete next.layout.associations[id];
  return next;
}
export function associationGeometry(model: Breadboard) {
  const elements = dataElements(model);
  return Object.entries(model.associations ?? {}).flatMap(([id, association]) => {
    const from = elements.find(element => element.id === association.from);
    const to = elements.find(element => element.id === association.to);
    if (!from || !to) return [];
    const source = model.layout?.nodes?.[from.nodeId], target = model.layout?.nodes?.[to.nodeId];
    if (!source || !target) return [];
    const rowY = (element: typeof from) => dataRowY(model.nodes[element.nodeId]!, element.key);
    const sx = source.x + NODE_WIDTH + 5, sy = source.y + rowY(from);
    const ey = target.y + rowY(to);
    const lane = model.layout?.associations?.[id]?.x;
    const internal = from.nodeId === to.nodeId;
    const backwards = target.x <= source.x;
    const ex = target.x + ((internal || (lane === undefined ? backwards : lane >= target.x + NODE_WIDTH / 2)) ? NODE_WIDTH + 5 : -5);
    const automaticLane = backwards ? Math.max(sx, ex) + 70 : (sx + ex) / 2;
    // Both ends of an internal association stay on the right, outside its component.
    const mx = internal ? Math.max(lane ?? automaticLane, sx + 24) : (lane ?? automaticLane);
    const x = Math.min(sx, target.x - 5) - 12, y = Math.min(sy, ey) - 12;
    return [{ id, association, x, y, sx: sx - x, sy: sy - y, mx: mx - x, ex: ex - x, ey: ey - y }];
  });
}
export function associationFindings(model: Breadboard) {
  return Object.entries(model.associations ?? {}).flatMap(([id, association]) =>
    (['from', 'to'] as const).filter(end => !dataResolves(model, association[end])).map(end => ({
      severity: 'error' as const, ref: id, message: `Association “${id}” refers to missing data element “${association[end]}”.`,
    })));
}
export function editAssociation(model: Breadboard, id: string, change: (association: Association) => void) {
  const next = structuredClone(model);
  if (!next.associations?.[id]) throw new Error('This association no longer exists.');
  change(next.associations[id]);
  return next;
}


function attributeElement(model: Breadboard, nodeId: string, dataId: string) {
  const node = model.nodes[nodeId];
  if (!node || node.kind !== 'component' || !Object.hasOwn(node.data ?? {}, dataId)) throw new Error('This data element no longer exists.');
  return node.data![dataId]!;
}
function attributeName(name: string, attributes: string[], except = -1) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('An attribute needs a name.');
  if (attributes.some((entry, index) => index !== except && entry === trimmed)) throw new Error('Attribute names must be unique within a data element.');
  return trimmed;
}
export function addAttribute(model: Breadboard, nodeId: string, dataId: string, name: string) {
  const next = structuredClone(model), element = attributeElement(next, nodeId, dataId);
  const attributes = element.attributes ?? [];
  const label = attributeName(name, attributes);
  element.attributes = [...attributes, label];
  return next;
}
export function renameAttribute(model: Breadboard, nodeId: string, dataId: string, index: number, name: string) {
  const next = structuredClone(model), element = attributeElement(next, nodeId, dataId);
  if (!Number.isInteger(index) || !element.attributes || index < 0 || index >= element.attributes.length) throw new Error('This attribute no longer exists.');
  element.attributes[index] = attributeName(name, element.attributes, index);
  return next;
}
export function deleteAttribute(model: Breadboard, nodeId: string, dataId: string, index: number) {
  const next = structuredClone(model), element = attributeElement(next, nodeId, dataId);
  if (!Number.isInteger(index) || !element.attributes || index < 0 || index >= element.attributes.length) throw new Error('This attribute no longer exists.');
  element.attributes.splice(index, 1);
  if (!element.attributes.length) delete element.attributes;
  return next;
}
