import type { Breadboard, SliceBounds } from '../model.ts';
import { connections, NODE_WIDTH, nodeHeight, uniqueId } from './model.ts';
import type { Position } from './model.ts';

export const SLICE_HEADER = 56;
export const SLICE_PADDING = 24;
export const sliceMembers = (model: Breadboard, id: string) => Object.entries(model.nodes).filter(([, node]) => node.slice === id).map(([key]) => key);

function requireSlice(model: Breadboard, id: string): SliceBounds {
  if (!Object.hasOwn(model.slices ?? {}, id) || !Object.hasOwn(model.layout?.slices ?? {}, id)) throw new Error(`Missing slice “${id}”.`);
  return model.layout!.slices![id]!;
}
function requireNode(model: Breadboard, id: string) {
  if (!Object.hasOwn(model.nodes, id)) throw new Error(`Missing node “${id}”.`);
  return model.nodes[id]!;
}
function containsCenter(model: Breadboard, nodeId: string, box: SliceBounds) {
  const p = model.layout!.nodes![nodeId]!, node = model.nodes[nodeId]!;
  const x = p.x + NODE_WIDTH / 2, y = p.y + nodeHeight(node) / 2;
  return x >= box.x && x <= box.x + box.w && y >= box.y + SLICE_HEADER && y <= box.y + box.h;
}
/** Smallest containing region wins overlaps; IDs break equal-area ties consistently. */
export function sliceAtNode(model: Breadboard, nodeId: string): string | undefined {
  requireNode(model, nodeId);
  return Object.keys(model.slices ?? {}).filter(id => model.layout?.slices?.[id] && containsCenter(model, nodeId, model.layout.slices[id]!))
    .sort((a, b) => { const x = model.layout!.slices![a]!, y = model.layout!.slices![b]!; return x.w * x.h - y.w * y.h || a.localeCompare(b); })[0];
}
function coverMembers(model: Breadboard, id: string) {
  const box = requireSlice(model, id);
  let x = box.x, y = box.y, right = box.x + box.w, bottom = box.y + box.h;
  for (const member of sliceMembers(model, id)) {
    const p = model.layout!.nodes![member]!;
    x = Math.min(x, p.x - SLICE_PADDING); y = Math.min(y, p.y - SLICE_HEADER);
    right = Math.max(right, p.x + NODE_WIDTH + SLICE_PADDING);
    bottom = Math.max(bottom, p.y + nodeHeight(model.nodes[member]!) + SLICE_PADDING);
  }
  model.layout!.slices![id] = { x, y, w: Math.max(360, right - x), h: Math.max(220, bottom - y) };
}
export function addSlice(model: Breadboard, position: Position): { model: Breadboard; id: string } {
  const result = structuredClone(model);
  result.slices ??= {}; result.layout ??= {}; result.layout.slices ??= {};
  const id = uniqueId(result.slices, 'slice');
  result.slices[id] = { label: 'New slice' };
  result.layout.slices[id] = { ...position, w: 640, h: 420 };
  return { model: result, id };
}
/** Removing the region never removes members, connections, or their positions. */
export function deleteSlice(model: Breadboard, id: string): Breadboard {
  requireSlice(model, id);
  const result = structuredClone(model);
  delete result.slices![id]; delete result.layout!.slices![id];
  for (const node of Object.values(result.nodes)) if (node.slice === id) delete node.slice;
  return result;
}
/** Apply a finished drag as a single exclusive assignment, keeping all edge endpoints. */
export function settleNodeDrops(model: Breadboard, ids: string[]): Breadboard {
  const assignments = ids.map(id => [id, sliceAtNode(model, id)] as const);
  const result = structuredClone(model);
  for (const [id, slice] of assignments) {
    if (slice) result.nodes[id]!.slice = slice; else delete result.nodes[id]!.slice;
  }
  for (const id of new Set(assignments.map(([, slice]) => slice).filter((id): id is string => !!id))) coverMembers(result, id);
  return JSON.stringify(result) === JSON.stringify(model) ? model : result;
}
export function coverSliceMembers(model: Breadboard): Breadboard {
  if (!Object.keys(model.slices ?? {}).length) return model;
  const result = structuredClone(model);
  for (const id of Object.keys(result.slices!)) if (Object.hasOwn(result.layout?.slices ?? {}, id)) coverMembers(result, id);
  return JSON.stringify(result.layout?.slices) === JSON.stringify(model.layout?.slices) ? model : result;
}
/** Inspector assignment places a node in the region; unassignment places it outside. */
export function assignSlice(model: Breadboard, nodeId: string, slice: string | null): Breadboard {
  requireNode(model, nodeId);
  if (slice) requireSlice(model, slice);
  const result = structuredClone(model), node = result.nodes[nodeId]!;
  if (slice) {
    const box = requireSlice(result, slice);
    const others = sliceMembers(result, slice).filter(id => id !== nodeId);
    if (!containsCenter(result, nodeId, box)) result.layout!.nodes![nodeId] = {
      x: box.x + SLICE_PADDING,
      y: Math.max(box.y + SLICE_HEADER, ...others.map(id => result.layout!.nodes![id]!.y + nodeHeight(result.nodes[id]!) + 32)),
    };
    node.slice = slice; coverMembers(result, slice);
  } else {
    delete node.slice;
    if (sliceAtNode(result, nodeId)) {
      const right = Math.max(...Object.values(result.layout!.slices ?? {}).map(box => box.x + box.w));
      const position = result.layout!.nodes![nodeId]!;
      position.x = right + 80;
      for (let attempt = 0; attempt < Object.keys(result.nodes).length; attempt++) {
        const collision = Object.entries(result.nodes).find(([id, other]) => {
          if (id === nodeId) return false;
          const p = result.layout!.nodes![id]!;
          return position.x < p.x + NODE_WIDTH + 24 && position.x + NODE_WIDTH + 24 > p.x
            && position.y < p.y + nodeHeight(other) + 24 && position.y + nodeHeight(node) + 24 > p.y;
        });
        if (!collision) break;
        position.y = result.layout!.nodes![collision[0]]!.y + nodeHeight(collision[1]) + 32;
      }
    }
  }
  return result;
}
/** Moving a group moves only its assigned members; nearby unassigned nodes stay put. */
export function moveSlice(model: Breadboard, id: string, position: Position): Breadboard {
  const before = requireSlice(model, id), result = structuredClone(model);
  const dx = position.x - before.x, dy = position.y - before.y;
  result.layout!.slices![id] = { ...before, ...position };
  for (const member of sliceMembers(result, id)) {
    const p = result.layout!.nodes![member]!; p.x += dx; p.y += dy;
  }
  return result;
}
/** Resizing a region cannot crop its members or capture unrelated nodes. */
export function resizeSlice(model: Breadboard, id: string, bounds: SliceBounds): Breadboard {
  requireSlice(model, id);
  const result = structuredClone(model);
  result.layout!.slices![id] = { ...bounds, w: Math.max(360, bounds.w), h: Math.max(220, bounds.h) };
  coverMembers(result, id);
  return result;
}
export function boundaryConnections(model: Breadboard, slice: string) {
  return connections(model).filter(edge => {
    const source = model.nodes[edge.from.split('.')[0]!]?.slice === slice;
    const target = model.nodes[edge.to.split('.')[0]!]?.slice === slice;
    return source !== target;
  });
}
