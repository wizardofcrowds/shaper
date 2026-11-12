import { associationFindings } from './data.ts';
import type { Breadboard, BreadboardNode, DataElement, Connection } from '../model.ts';

export const NODE_WIDTH = 300;
export const HEADER_HEIGHT = 84;
export const ROW_HEIGHT = 48;
export const ATTRIBUTE_HEIGHT = 28;
export interface Position { x: number; y: number }
export interface Finding { severity: 'error' | 'warning' | 'info'; message: string; ref: string }

export function uniqueId(existing: object, base: string): string {
  let id = base;
  for (let index = 2; Object.hasOwn(existing, id); index++) id = `${base}_${index}`;
  return id;
}

export function nodeHeight(node: BreadboardNode): number {
  return HEADER_HEIGHT + Math.max(1, Object.keys(node.affordances).length) * ROW_HEIGHT + Object.values(node.data ?? {}).reduce((height, element) => height + dataHeight(element), 0) + 12;
}

export function dataHeight(element: DataElement): number {
  return ROW_HEIGHT + (element.attributes?.length ?? 0) * ATTRIBUTE_HEIGHT;
}

/** Association endpoints stay on data headers, even when preceding elements grow. */
export function dataRowY(node: BreadboardNode, id: string): number {
  const keys = Object.keys(node.data ?? {}).sort();
  return HEADER_HEIGHT + Math.max(1, Object.keys(node.affordances).length) * ROW_HEIGHT
    + keys.slice(0, keys.indexOf(id)).reduce((height, key) => height + dataHeight(node.data![key]!), 0)
    + ROW_HEIGHT / 2;
}

/** Missing display order falls back to mapping order. */
export function affordanceIds(node: BreadboardNode): string[] {
  return [...new Set([...(node.affordance_order ?? []), ...Object.keys(node.affordances)])]
    .filter(id => Object.hasOwn(node.affordances, id));
}

/** Fill only absent positions; retain all source fields and dangling layout entries. */
export function withLayout(model: Breadboard): Breadboard {
  const result = structuredClone(model);
  result.layout ??= {};
  result.layout.nodes ??= {};
  Object.keys(result.nodes).forEach((id, index) => {
    result.nodes[id]!.affordance_order ??= Object.keys(result.nodes[id]!.affordances);
    if (!Object.hasOwn(result.layout!.nodes!, id)) result.layout!.nodes![id] = { x: Math.floor(index / 3) * 430, y: index % 3 * 280 };
  });
  if (Object.keys(result.slices ?? {}).length) {
    result.layout.slices ??= {};
    Object.keys(result.slices!).forEach((id, index) => {
      if (Object.hasOwn(result.layout!.slices!, id)) return;
      const members = Object.entries(result.nodes).filter(([, node]) => node.slice === id);
      const x = members.length ? Math.min(...members.map(([key]) => result.layout!.nodes![key]!.x)) - 24 : Math.max(0, ...Object.values(result.layout!.nodes!).map(point => point.x + NODE_WIDTH)) + 100 + index * 720;
      const y = members.length ? Math.min(...members.map(([key]) => result.layout!.nodes![key]!.y)) - 64 : 0;
      const right = Math.max(x + 640, ...members.map(([key]) => result.layout!.nodes![key]!.x + NODE_WIDTH + 24));
      const bottom = Math.max(y + 420, ...members.map(([key, node]) => result.layout!.nodes![key]!.y + nodeHeight(node) + 24));
      result.layout!.slices![id] = { x, y, w: right - x, h: bottom - y };
    });
  }
  return result;
}

export function addNode(model: Breadboard, kind: BreadboardNode['kind'], position: Position): { model: Breadboard; id: string } {
  const result = structuredClone(model);
  const id = uniqueId(result.nodes, kind);
  result.nodes[id] = { kind, label: kind === 'place' ? 'New place' : 'New component', affordances: {}, affordance_order: [] };
  result.layout ??= {};
  result.layout.nodes ??= {};
  result.layout.nodes[id] = position;
  return { model: result, id };
}

export function deleteNode(model: Breadboard, id: string): Breadboard {
  if (Object.keys(model.nodes).length <= 1) throw new Error('Keep at least one place or component in the breadboard.');
  const result = structuredClone(model);
  delete result.nodes[id];
  if (result.layout?.nodes) delete result.layout.nodes[id];
  // Owned outgoing connections disappear; incoming references and scenarios remain for checks.
  return result;
}

export function addAffordance(model: Breadboard, nodeId: string): { model: Breadboard; id: string } {
  const result = structuredClone(model);
  const node = result.nodes[nodeId]!;
  const order = affordanceIds(node);
  const id = uniqueId(node.affordances, 'action');
  node.affordances[id] = { kind: 'action', label: 'New affordance' };
  node.affordance_order = [...order, id];
  return { model: result, id };
}

/** Change display order without changing IDs, values, or connection endpoints. */
export function moveAffordance(model: Breadboard, nodeId: string, affordanceId: string, direction: -1 | 1): Breadboard {
  if (!Object.hasOwn(model.nodes, nodeId)) throw new Error(`Missing node “${nodeId}”.`);
  const order = affordanceIds(model.nodes[nodeId]!);
  const index = order.indexOf(affordanceId);
  if (index < 0) throw new Error(`Missing affordance “${nodeId}.${affordanceId}”.`);
  const destination = index + direction;
  if (destination < 0 || destination >= order.length) return model;
  [order[index], order[destination]] = [order[destination]!, order[index]!];
  const result = structuredClone(model);
  result.nodes[nodeId]!.affordance_order = order;
  return result;
}

export function deleteAffordance(model: Breadboard, nodeId: string, id: string): Breadboard {
  const result = structuredClone(model);
  const node = result.nodes[nodeId]!;
  node.affordance_order = affordanceIds(node).filter(rowId => rowId !== id);
  delete node.affordances[id];
  return result;
}

/** A fully qualified edge ID is node.affordance.connection; keys are local to their owner. */
export interface GraphConnection extends Connection { id: string; from: string; key: string }

export function connections(model: Breadboard): GraphConnection[] {
  return Object.entries(model.nodes).flatMap(([nodeId, node]) =>
    Object.entries(node.affordances).flatMap(([rowId, row]) =>
      Object.entries(row.connections ?? {}).map(([key, connection]) => ({
        ...connection, key, id: `${nodeId}.${rowId}.${key}`, from: `${nodeId}.${rowId}`,
      }))));
}

/** Return the owned record, not the derived graph view, for editing. */
export function connectionAt(model: Breadboard, id: string): Connection {
  if (id.split('.').length !== 3) throw new Error(`Missing connection “${id}”.`);
  const [nodeId, rowId, key] = id.split('.') as [string, string, string];
  const row = sourceAffordance(model, `${nodeId}.${rowId}`);
  if (!row.connections || !Object.hasOwn(row.connections, key)) throw new Error(`Missing connection “${id}”.`);
  return row.connections[key]!;
}

function sourceAffordance(model: Breadboard, from: string) {
  const [nodeId, rowId] = from.split('.') as [string, string];
  if (from.split('.').length !== 2 || !resolves(model, from)) throw new Error(`Missing source affordance “${from}”.`);
  return model.nodes[nodeId]!.affordances[rowId]!;
}

export function connect(model: Breadboard, from: string, to: string): { model: Breadboard; id: string } {
  const result = structuredClone(model);
  const row = sourceAffordance(result, from);
  row.connections ??= {};
  const key = uniqueId(row.connections, 'connection');
  row.connections[key] = { to, kind: 'navigate' };
  return { model: result, id: `${from}.${key}` };
}

export function deleteConnection(model: Breadboard, id: string): Breadboard {
  const result = structuredClone(model);
  connectionAt(result, id); // Verify the reference before changing anything.
  const [nodeId, rowId, key] = id.split('.') as [string, string, string];
  const row = result.nodes[nodeId]!.affordances[rowId]!;
  delete row.connections![key];
  if (result.layout?.connections) delete result.layout.connections[id];
  if (!Object.keys(row.connections!).length) delete row.connections;
  return result;
}

/** Move an edge to another owner, preserving all fields and avoiding key collisions. */
export function moveConnection(model: Breadboard, id: string, from: string): { model: Breadboard; id: string } {
  const connection = structuredClone(connectionAt(model, id));
  const oldFrom = id.slice(0, id.lastIndexOf('.'));
  if (oldFrom === from) return { model, id };
  const result = deleteConnection(model, id);
  const row = sourceAffordance(result, from);
  row.connections ??= {};
  const key = uniqueId(row.connections, id.split('.')[2]!);
  row.connections[key] = connection;
  if (model.layout?.connections?.[id]) {
    result.layout!.connections ??= {};
    result.layout!.connections[`${from}.${key}`] = structuredClone(model.layout.connections[id]);
  }
  return { model: result, id: `${from}.${key}` };
}

export function resolves(model: Breadboard, ref: string): boolean {
  const [nodeId, affordanceId] = ref.split('.');
  if (!nodeId || !Object.hasOwn(model.nodes, nodeId)) return false;
  return affordanceId === undefined || Object.hasOwn(model.nodes[nodeId]!.affordances, affordanceId);
}

export interface EdgeGeometry {
  id: string;
  connection: GraphConnection;
  x: number; y: number;
  sx: number; sy: number; mx: number; ex: number; ey: number;
}

/** Derive visual endpoints from semantic IDs every time; geometry never rewires an edge. */
export function edgeGeometry(model: Breadboard): EdgeGeometry[] {
  const positions = model.layout?.nodes ?? {};
  return connections(model).flatMap(connection => {
    const { id } = connection;
    if (!resolves(model, connection.from) || !resolves(model, connection.to)) return [];
    const [sourceId, sourceRow] = connection.from.split('.') as [string, string];
    const [targetId, targetRow] = connection.to.split('.') as [string, string | undefined];
    const source = positions[sourceId], target = positions[targetId];
    if (!source || !target) return [];
    const rowY = (nodeId: string, row: string) => HEADER_HEIGHT + affordanceIds(model.nodes[nodeId]!).indexOf(row) * ROW_HEIGHT + ROW_HEIGHT / 2;
    const sx = source.x + NODE_WIDTH + 5;
    const sy = source.y + rowY(sourceId, sourceRow);
    const backwards = target.x <= source.x;
    const routeX = model.layout?.connections?.[id]?.x;
    const enterFromRight = routeX === undefined ? backwards : routeX >= target.x + NODE_WIDTH / 2;
    const ex = target.x + (enterFromRight ? NODE_WIDTH + 5 : -5);
    const ey = target.y + (targetRow ? rowY(targetId, targetRow) : 48);
    const mx = routeX ?? (backwards ? Math.max(sx, ex) + 70 : (sx + ex) / 2);
    // Keep the shape origin stable while dragging across destination sides.
    const x = Math.min(sx, target.x - 5) - 12, y = Math.min(sy, ey) - 12;
    return [{ id, connection, x, y, sx: sx - x, sy: sy - y, mx: mx - x, ex: ex - x, ey: ey - y }];
  });
}

export function checkBreadboard(model: Breadboard): Finding[] {
  const findings: Finding[] = associationFindings(model);
  const check = (ref: string, owner: string) => {
    if (!resolves(model, ref)) findings.push({ severity: 'error', ref: owner, message: `${owner} refers to missing “${ref}”.` });
  };
  for (const connection of connections(model)) {
    check(connection.to, connection.id);
    if (connection.kind === 'detour' || connection.login) {
      if (model.nodes[connection.to]?.kind !== 'place') findings.push({ severity: 'error', ref: connection.id, message: `${connection.id}: login-gated navigation and detours must lead to a place.` });
    }
    if (connection.login) {
      if (!connection.login.via) findings.push({ severity: 'warning', ref: connection.id, message: `${connection.id}: login is required, but the login place is not specified yet.` });
      else if (model.nodes[connection.login.via]?.kind !== 'place') findings.push({ severity: 'error', ref: connection.id, message: `${connection.id}: login place “${connection.login.via}” is missing or is not a place.` });
    }
  }
  for (const [id, node] of Object.entries(model.nodes)) {
    if (node.slice && !Object.hasOwn(model.slices ?? {}, node.slice)) findings.push({ severity: 'error', ref: id, message: `${id} belongs to missing slice “${node.slice}”.` });
    if (!node.affordance_order) continue;
    for (const rowId of node.affordance_order) {
      if (!Object.hasOwn(node.affordances, rowId)) findings.push({ severity: 'error', ref: id, message: `${id}: display order refers to missing affordance “${rowId}”.` });
    }
    for (const rowId of Object.keys(node.affordances)) {
      if (!node.affordance_order.includes(rowId)) findings.push({ severity: 'warning', ref: id, message: `${id}: “${rowId}” is not listed in affordance_order and is displayed last.` });
    }
  }
  for (const id of Object.keys(model.layout?.nodes ?? {})) {
    if (!Object.hasOwn(model.nodes, id)) findings.push({ severity: 'warning', ref: id, message: `Layout contains missing node “${id}”.` });
  }
  for (const id of Object.keys(model.layout?.slices ?? {})) {
    if (!Object.hasOwn(model.slices ?? {}, id)) findings.push({ severity: 'warning', ref: id, message: `Layout contains missing slice “${id}”.` });
  }
  const seen = new Set<string>();
  for (const scenario of model.scenarios ?? []) {
    if (seen.has(scenario.id)) findings.push({ severity: 'error', ref: scenario.id, message: `Scenario ID “${scenario.id}” is duplicated.` });
    seen.add(scenario.id);
    check(scenario.start, scenario.id);
    check(scenario.end, scenario.id);
    let current = scenario.start;
    let evaluable = resolves(model, current);
    for (const step of scenario.steps) {
      check(step, scenario.id);
      if (!evaluable || !resolves(model, step)) { evaluable = false; continue; }
      const [nodeId, rowId] = step.split('.') as [string, string];
      if (nodeId !== current) {
        findings.push({ severity: 'error', ref: scenario.id, message: `${scenario.id}: “${step}” is unavailable at “${current}”.` });
        evaluable = false;
        continue;
      }
      const edges = Object.values(model.nodes[nodeId]!.affordances[rowId]!.connections ?? {});
      const kind = model.nodes[nodeId]!.affordances[rowId]!.kind;
      if (!edges.length && (kind === 'input' || kind === 'copy')) continue;
      if (edges.length !== 1 || edges[0]!.kind !== 'navigate' || edges[0]!.login !== undefined || edges[0]!.to.includes('.')) {
        findings.push({ severity: 'warning', ref: scenario.id, message: `${scenario.id}: outcome of “${step}” needs an explicit choice, login outcome, or component execution semantics.` });
        evaluable = false;
        continue;
      }
      current = edges[0]!.to;
      evaluable = resolves(model, current);
    }
    if (evaluable && current !== scenario.end) {
      findings.push({ severity: 'error', ref: scenario.id, message: `${scenario.id} ends at “${current}”, expected “${scenario.end}”.` });
    }
  }
  if (!model.scenarios?.length) findings.push({ severity: 'info', ref: '', message: 'No scenarios are defined. Use-case fit has not been assessed.' });
  return findings;
}
