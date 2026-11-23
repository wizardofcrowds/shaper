import type { Breadboard } from '../model.ts';
import { connections, uniqueId } from './model.ts';

export const UNASSIGNED_AREA = '__unassigned__';
export function areaNodeIds(model: Breadboard, filter: string): Set<string> {
  return new Set(Object.entries(model.nodes).filter(([, node]) => !filter || (filter === UNASSIGNED_AREA ? !node.area : node.area === filter)).map(([id]) => id));
}
function areaName(model: Breadboard, label: string, except?: string) {
  const name = label.trim();
  if (!name) throw new Error('An area needs a name.');
  if (Object.entries(model.areas ?? {}).some(([id, area]) => id !== except && area.label.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('An area with this name already exists.');
  return name;
}
export function addArea(model: Breadboard, label: string) {
  const name = areaName(model, label), next = structuredClone(model);
  next.areas ??= {};
  const id = uniqueId(next.areas, 'area');
  next.areas[id] = { label: name };
  return { model: next, id };
}
export function renameArea(model: Breadboard, id: string, label: string) {
  if (!Object.hasOwn(model.areas ?? {}, id)) throw new Error('This area no longer exists.');
  const name = areaName(model, label, id), next = structuredClone(model);
  next.areas![id]!.label = name;
  return next;
}
export function deleteArea(model: Breadboard, id: string) {
  const next = structuredClone(model);
  if (next.areas) delete next.areas[id];
  for (const node of Object.values(next.nodes)) if (node.area === id) delete node.area;
  return next;
}
export function assignArea(model: Breadboard, nodeId: string, area: string | null) {
  if (!Object.hasOwn(model.nodes, nodeId)) throw new Error('This place or component no longer exists.');
  if (area && !Object.hasOwn(model.areas ?? {}, area)) throw new Error('Choose an existing area.');
  const next = structuredClone(model);
  if (area) next.nodes[nodeId]!.area = area;
  else delete next.nodes[nodeId]!.area;
  return next;
}
export interface AreaCrossing { id: string; inside: string; outside: string; direction: 'out' | 'in'; label: string }
/** Include hidden login dependencies as well as ordinary wires and data associations. */
export function areaCrossings(model: Breadboard, filter: string): AreaCrossing[] {
  if (!filter) return [];
  const visible = areaNodeIds(model, filter), result: AreaCrossing[] = [];
  const add = (id: string, from: string, to: string, label: string) => {
    const source = visible.has(from.split('.')[0]!), target = visible.has(to.split('.')[0]!);
    if (source === target) return;
    result.push({ id, inside: source ? from : to, outside: source ? to : from, direction: source ? 'out' : 'in', label });
  };
  for (const edge of connections(model)) {
    add(`connection:${edge.id}`, edge.from, edge.to, edge.label || edge.kind);
    if (edge.login?.via) add(`login:${edge.id}`, edge.from, edge.login.via, 'Login required');
  }
  for (const [id, edge] of Object.entries(model.associations ?? {})) add(`association:${id}`, edge.from, edge.to, edge.label || 'Data association');
  return result;
}
