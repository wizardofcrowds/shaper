import { associationGeometry, deleteAssociation } from './data.ts';
import { createContext, useContext } from 'react';
import {
  createShapeId, HTMLContainer, Polyline2d, Rectangle2d, Group2d, ShapeUtil,
  SVGContainer, T, Vec, resizeBox, getIndexAbove,
} from 'tldraw';
import type { Editor, JsonObject, TLShape, TLResizeInfo, TLHandleDragInfo } from 'tldraw';
import { validateBreadboard } from '../index.ts';
import type { Breadboard } from '../model.ts';
import { nodeColorStyle } from './colors.ts';
import { coverSliceMembers, deleteSlice, moveSlice, resizeSlice, settleNodeDrops, sliceMembers } from './slices.ts';
import { affordanceIds, deleteConnection, deleteNode, edgeGeometry, ATTRIBUTE_HEIGHT, HEADER_HEIGHT, NODE_WIDTH, nodeHeight, ROW_HEIGHT, withLayout } from './model.ts';

interface Row { id: string; label: string; kind: string }
interface DataRow extends Row { attributes: string[] }
interface NodeProps { nodeId: string; label: string; kind: string; color: string; rows: Row[]; data: DataRow[]; w: number; h: number }
interface SliceProps { sliceId: string; label: string; count: number; w: number; h: number }
interface EdgeProps { loginRequired: boolean; association: boolean; fromCardinality: string; toCardinality: string; connectionId: string; label: string; kind: string; sx: number; sy: number; mx: number; ex: number; ey: number }

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'breadboard-node': NodeProps;
    'breadboard-slice': SliceProps;
    'breadboard-edge': EdgeProps;
  }
}
export type NodeShape = TLShape<'breadboard-node'>;
type EdgeShape = TLShape<'breadboard-edge'>;
type SliceShape = TLShape<'breadboard-slice'>;
export const nodeShapeId = (id: string) => createShapeId(`shaper-node-${id}`);
export const sliceShapeId = (id: string) => createShapeId(`shaper-slice-${id}`);
export const associationShapeId = (id: string) => createShapeId(`shaper-association-${id}`);
export const edgeShapeId = (id: string) => createShapeId(`shaper-edge-${id}`);

interface Interaction {
  pending: string | null;
  selectedRow: string | null;
  select: (nodeId: string, rowId?: string) => void;
  selectData: (nodeId: string, id: string) => void;
  startConnection: (ref: string) => void;
  target: (ref: string) => void;
}
export const CanvasInteraction = createContext<Interaction>({ pending: null, selectedRow: null, select() {}, selectData() {}, startConnection() {}, target() {} });

function NodeContent({ shape }: { shape: NodeShape }) {
  const interaction = useContext(CanvasInteraction);
  const { nodeId, label, kind, rows, data, w, h } = shape.props;
  return <HTMLContainer style={{ width: w, height: h, pointerEvents: 'all' }}>
    <div className={`breadboard-node ${interaction.pending ? 'is-target' : ''}`} data-node-id={nodeId} style={nodeColorStyle(shape.props.color)}>
      <div className="node-heading" style={{ height: HEADER_HEIGHT }} onPointerDown={event => {
        if (interaction.pending) { event.stopPropagation(); interaction.target(nodeId); }
      }}>
        <div className="node-kind">{kind === 'place' ? 'PLACE' : 'COMPONENT'}</div>
        <div className="node-label" title={label}>{label}</div>
      </div>
      {rows.map(row => <div key={row.id} className={`node-row ${interaction.selectedRow === `${nodeId}.${row.id}` ? 'is-selected' : ''}`}
        style={{ height: ROW_HEIGHT }} onPointerDown={event => {
          event.stopPropagation();
          if (interaction.pending) interaction.target(`${nodeId}.${row.id}`);
          else interaction.select(nodeId, row.id);
        }}>
        <span className={`affordance-mark mark-${row.kind}`} aria-hidden="true">{row.kind === 'copy' ? '“' : row.kind === 'input' ? '▱' : row.kind === 'event' ? '↗' : '·'}</span>
        <span className="row-label" title={row.label}>{row.label}</span>
        <button className={`port ${interaction.pending === `${nodeId}.${row.id}` ? 'is-active' : ''}`}
          aria-label={`Connect from ${label}: ${row.label}`} title="Start a connection"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); interaction.startConnection(`${nodeId}.${row.id}`); }}>+</button>
      </div>)}
      {!rows.length && <div className="empty-node" style={{ height: ROW_HEIGHT }}>{kind === 'component' ? 'No affordances' : 'Add an affordance to shape this place.'}</div>}
      {data.map(row => <div key={row.id} className="data-block" onPointerDown={event => {
        event.stopPropagation();
        if (!interaction.pending) interaction.selectData(nodeId, row.id);
      }}>
        <div className="node-row data-row" style={{ height: ROW_HEIGHT }}><span className="data-mark">DATA</span><span className="row-label" title={row.label}>{row.label}</span></div>
        {row.attributes.length > 0 && <ul className="data-attributes" aria-label={`${row.label} attributes`}>
          {row.attributes.map((attribute, index) => <li key={index} style={{ height: ATTRIBUTE_HEIGHT }} title={attribute}>{attribute}</li>)}
        </ul>}
      </div>)}
    </div>
  </HTMLContainer>;
}

export class BreadboardNodeUtil extends ShapeUtil<NodeShape> {
  static override type = 'breadboard-node' as const;
  static override props = {
    nodeId: T.string, label: T.string, kind: T.string, color: T.string, w: T.number, h: T.number,
    rows: T.arrayOf(T.object({ id: T.string, label: T.string, kind: T.string })),
    data: T.arrayOf(T.object({ id: T.string, label: T.string, kind: T.string, attributes: T.arrayOf(T.string) })),
  };
  getDefaultProps(): NodeProps { return { nodeId: '', label: '', kind: 'place', color: '', rows: [], data: [], w: NODE_WIDTH, h: 144 }; }
  getGeometry(shape: NodeShape) { return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true }); }
  override onTranslateEnd(_initial: NodeShape, current: NodeShape) {
    const before = readModel(this.editor);
    const after = settleNodeDrops(before, [current.props.nodeId]);
    if (after !== before) storeModel(this.editor, after);
  }
  override canResize() { return false; }
  override canEdit() { return false; }
  override canBind() { return false; }
  override hideRotateHandle() { return true; }
  component(shape: NodeShape) { return <NodeContent shape={shape} />; }
  getIndicatorPath(shape: NodeShape) { const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path; }
}

export class BreadboardEdgeUtil extends ShapeUtil<EdgeShape> {
  override hideRotateHandle() { return true; }
  override hideSelectionBoundsBg() { return true; }
  override hideSelectionBoundsFg() { return true; }
  override getHandles(shape: EdgeShape) {
    const p = shape.props;
    return [{ id: 'route', type: 'vertex' as const, index: getIndexAbove(null), x: p.mx, y: (p.sy + p.ey) / 2 }];
  }
  override onHandleDrag(shape: EdgeShape, { handle }: TLHandleDragInfo<EdgeShape>) {
    return { id: shape.id, type: shape.type, props: { mx: handle.x } };
  }
  override onTranslate(initial: EdgeShape) {
    return { id: initial.id, type: initial.type, x: initial.x, y: initial.y };
  }

  static override type = 'breadboard-edge' as const;
  static override props = { loginRequired: T.boolean, association: T.boolean, fromCardinality: T.string, toCardinality: T.string, connectionId: T.string, label: T.string, kind: T.string, sx: T.number, sy: T.number, mx: T.number, ex: T.number, ey: T.number };
  getDefaultProps(): EdgeProps { return { loginRequired: false, association: false, fromCardinality: '', toCardinality: '', connectionId: '', label: '', kind: 'navigate', sx: 0, sy: 0, mx: 50, ex: 100, ey: 50 }; }
  getGeometry(shape: EdgeShape) {
    const p = shape.props;
    return new Polyline2d({ points: [new Vec(p.sx, p.sy), new Vec(p.mx, p.sy), new Vec(p.mx, p.ey), new Vec(p.ex, p.ey)] });
  }
  override canResize() { return false; }
  override canEdit() { return false; }
  override canBind() { return false; }
  component(shape: EdgeShape) {
    const p = shape.props, direction = p.ex >= p.mx ? 1 : -1;
    const dataAccess = !p.association && (p.kind === 'read' || p.kind === 'write');
    const stroke = dataAccess ? (p.kind === 'read' ? '#000000' : '#d97706') : '#647a6c';
    const strokeWidth = dataAccess ? 1 : 1.7;
    return <SVGContainer style={{ pointerEvents: 'none', overflow: 'visible' }}>
      <path d={`M${p.sx},${p.sy} H${p.mx} V${p.ey} H${p.ex}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={p.association ? '6 5' : dataAccess ? '1 4' : undefined} strokeLinecap={dataAccess ? 'round' : undefined} strokeLinejoin="round" />
      {!p.association && <path d={`M${p.ex - direction * 7},${p.ey - 4} L${p.ex},${p.ey} L${p.ex - direction * 7},${p.ey + 4}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />}
      {p.loginRequired && <g role="img" aria-label="Login required">
        <rect x={(p.sx + p.mx) / 2 - 43} y={p.sy - 25} width={86} height={18} rx={8} fill="#f5f3e9" stroke="#c9c4a6" strokeWidth={0.8} />
        <text x={(p.sx + p.mx) / 2} y={p.sy - 13} textAnchor="middle" fontSize="10" fill="#625b32">Login required</text>
      </g>}
      {p.association && <>
        <text x={p.sx + 8} y={p.sy - 9} fill="#607467" fontSize="11">{p.fromCardinality || '?'}</text>
        <text x={p.ex + (direction > 0 ? -12 : 12)} y={p.ey - 9} textAnchor={direction > 0 ? 'end' : 'start'} fill="#607467" fontSize="11">{p.toCardinality || '?'}</text>
      </>}
      <text x={p.association ? p.mx + 9 : (p.sx + p.mx) / 2} y={p.association ? (p.sy + p.ey) / 2 - 9 : p.sy - (p.loginRequired ? 34 : 9)} textAnchor="middle" fill={dataAccess ? stroke : '#607467'} fontSize="10" fontFamily="system-ui, sans-serif">{(p.label || (p.kind === 'navigate' || p.association ? '' : p.kind === 'detour' ? 'detour · returns here' : p.kind)).slice(0, p.association ? 60 : 32)}</text>
    </SVGContainer>;
  }
  getIndicatorPath(shape: EdgeShape) { const p = shape.props; return new Path2D(`M${p.sx},${p.sy} H${p.mx} V${p.ey} H${p.ex}`); }
}

export class BreadboardSliceUtil extends ShapeUtil<SliceShape> {
  static override type = 'breadboard-slice' as const;
  static override props = { sliceId: T.string, label: T.string, count: T.number, w: T.number, h: T.number };
  getDefaultProps(): SliceProps { return { sliceId: '', label: 'New slice', count: 0, w: 640, h: 420 }; }
  getGeometry(shape: SliceShape) { return new Group2d({ children: [new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: false }), new Rectangle2d({ width: shape.props.w, height: 52, isFilled: true })] }); }
  override canEdit() { return false; }
  override canBind() { return false; }
  override hideRotateHandle() { return true; }
  override onResize(shape: SliceShape, info: TLResizeInfo<SliceShape>) { return resizeBox(shape, info, { minWidth: 360, minHeight: 220 }); }
  component(shape: SliceShape) {
    return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'none' }}>
      <div className="breadboard-slice" data-slice-id={shape.props.sliceId}>
        <div className="slice-heading" style={{ pointerEvents: 'all' }} title="Drag the slice heading to move its members; select to resize">
          <span className="slice-marker">SLICE</span><span className="slice-label">{shape.props.label}</span><span className="slice-count">{shape.props.count} {shape.props.count === 1 ? 'member' : 'members'}</span>
        </div>
      </div>
    </HTMLContainer>;
  }
  getIndicatorPath(shape: SliceShape) { const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path; }
}

export const shapeUtils = [BreadboardSliceUtil, BreadboardNodeUtil, BreadboardEdgeUtil];

/** The complete semantic model lives in page metadata so native undo includes hidden fields. */
export function readModel(editor: Editor): Breadboard {
  return editor.getCurrentPage().meta.shaperBreadboard as unknown as Breadboard;
}

function storeModel(editor: Editor, model: Breadboard) {
  validateBreadboard(model);
  const page = editor.getCurrentPage();
  editor.updatePage({ id: page.id, meta: { ...page.meta, shaperBreadboard: model as unknown as JsonObject } });
}

export function createController(editor: Editor, initial: Breadboard) {
  let projecting = false;
  let projected: Breadboard | undefined;
  let disposed = false;

  function project(model: Breadboard) {
    if (projecting || disposed) return;
    projecting = true;
    try {
      editor.run(() => {
        const desired = new Set<string>();
        const regions = [];
        for (const [id, slice] of Object.entries(model.slices ?? {})) {
          const shapeId = sliceShapeId(id), box = model.layout!.slices![id]!;
          desired.add(shapeId); regions.push(shapeId);
          const props: SliceProps = { sliceId: id, label: slice.label, count: sliceMembers(model, id).length, w: box.w, h: box.h };
          const existing = editor.getShape<SliceShape>(shapeId);
          if (!existing) editor.createShape<SliceShape>({ id: shapeId, type: 'breadboard-slice', x: box.x, y: box.y, props });
          else if (existing.x !== box.x || existing.y !== box.y || JSON.stringify(existing.props) !== JSON.stringify(props)) editor.updateShape<SliceShape>({ id: shapeId, type: 'breadboard-slice', x: box.x, y: box.y, props });
        }
        for (const [id, node] of Object.entries(model.nodes)) {
          const shapeId = nodeShapeId(id);
          desired.add(shapeId);
          const position = model.layout!.nodes![id]!;
          const props: NodeProps = { nodeId: id, label: node.label, kind: node.kind, color: node.color ?? '', w: NODE_WIDTH, h: nodeHeight(node), rows: affordanceIds(node).map(rowId => ({ id: rowId, label: node.affordances[rowId]!.label, kind: node.affordances[rowId]!.kind })), data: Object.keys(node.data ?? {}).sort().map(key => ({ id: key, label: node.data![key]!.label, kind: 'data', attributes: node.data![key]!.attributes ?? [] })) };
          const existing = editor.getShape<NodeShape>(shapeId);
          if (!existing) editor.createShape<NodeShape>({ id: shapeId, type: 'breadboard-node', ...position, props });
          else if (existing.x !== position.x || existing.y !== position.y || JSON.stringify(existing.props) !== JSON.stringify(props)) editor.updateShape<NodeShape>({ id: shapeId, type: 'breadboard-node', ...position, props });
        }
        for (const geometry of edgeGeometry(model)) {
          const { id, connection, x, y, sx, sy, mx, ex, ey } = geometry;
          const shapeId = edgeShapeId(id);
          desired.add(shapeId);
          const props: EdgeProps = { loginRequired: Boolean(connection.login), association: false, fromCardinality: '', toCardinality: '', connectionId: id, label: connection.label ?? '', kind: connection.kind, sx, sy, mx, ex, ey };
          const existing = editor.getShape<EdgeShape>(shapeId);
          if (!existing) editor.createShape<EdgeShape>({ id: shapeId, type: 'breadboard-edge', x, y, props });
          else if (existing.x !== x || existing.y !== y || JSON.stringify(existing.props) !== JSON.stringify(props)) editor.updateShape<EdgeShape>({ id: shapeId, type: 'breadboard-edge', x, y, props });
        }
        for (const geometry of associationGeometry(model)) {
          const { id, association, x, y, sx, sy, mx, ex, ey } = geometry;
          const shapeId = associationShapeId(id);
          desired.add(shapeId);
          const props: EdgeProps = { loginRequired: false, association: true, connectionId: id, label: association.label ?? '', kind: 'association', fromCardinality: association.from_cardinality ?? '', toCardinality: association.to_cardinality ?? '', sx, sy, mx, ex, ey };
          const existing = editor.getShape<EdgeShape>(shapeId);
          if (!existing) editor.createShape<EdgeShape>({ id: shapeId, type: 'breadboard-edge', x, y, props });
          else if (existing.x !== x || existing.y !== y || JSON.stringify(existing.props) !== JSON.stringify(props)) editor.updateShape<EdgeShape>({ id: shapeId, type: 'breadboard-edge', x, y, props });
        }
        if (regions.length) editor.sendToBack(regions);
        const obsolete = editor.getCurrentPageShapes().filter(shape => !desired.has(shape.id));
        if (obsolete.length) editor.deleteShapes(obsolete.map(shape => shape.id));
      }, { history: 'ignore', ignoreShapeLock: true });
      projected = model;
    } finally { projecting = false; }
  }

  function writeModel(model: Breadboard) { storeModel(editor, model); }

  function load(model: Breadboard) {
    projecting = true;
    try {
      editor.run(() => {
        editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
        writeModel(coverSliceMembers(withLayout(model)));
      }, { history: 'ignore', ignoreShapeLock: true });
    } finally { projecting = false; }
    project(readModel(editor));
    editor.clearHistory();
    editor.selectNone();
    editor.zoomToFit({ animation: { duration: 0 } });
  }

  load(initial);
  const afterChange = editor.sideEffects.registerAfterChangeHandler('shape', (previous, next) => {
    if (projecting) return;
    if (next.type === 'breadboard-node' && previous.type === 'breadboard-node') {
      if (previous.x === next.x && previous.y === next.y) return;
      let model = structuredClone(readModel(editor));
      if (!Object.hasOwn(model.nodes, next.props.nodeId)) return;
      model.layout!.nodes![next.props.nodeId] = { x: next.x || 0, y: next.y || 0 };
      if (!editor.inputs.getIsPointing()) model = settleNodeDrops(model, [next.props.nodeId]);
      writeModel(model);
    } else if (next.type === 'breadboard-edge' && previous.type === 'breadboard-edge') {
      if (previous.props.mx === next.props.mx) return;
      const model = structuredClone(readModel(editor));
      model.layout ??= {};
      const routes = next.props.association ? (model.layout.associations ??= {}) : (model.layout.connections ??= {});
      routes[next.props.connectionId] = { x: next.x + next.props.mx };
      writeModel(model);
    } else if (next.type === 'breadboard-slice' && previous.type === 'breadboard-slice') {
      const resized = previous.props.w !== next.props.w || previous.props.h !== next.props.h;
      if (!resized && previous.x === next.x && previous.y === next.y) return;
      const model = readModel(editor);
      if (!Object.hasOwn(model.slices ?? {}, next.props.sliceId)) return;
      writeModel(resized
        ? resizeSlice(model, next.props.sliceId, { x: next.x, y: next.y, w: next.props.w, h: next.props.h })
        : moveSlice(model, next.props.sliceId, { x: next.x, y: next.y }));
    }
  });
  const beforeDelete = editor.sideEffects.registerBeforeDeleteHandler('shape', shape => {
    if (!projecting && shape.type === 'breadboard-node' && Object.keys(readModel(editor).nodes).length <= 1) return false;
  });
  const afterDelete = editor.sideEffects.registerAfterDeleteHandler('shape', shape => {
    if (projecting) return;
    const model = readModel(editor);
    if (shape.type === 'breadboard-node' && Object.hasOwn(model.nodes, shape.props.nodeId)) writeModel(deleteNode(model, shape.props.nodeId));
    if (shape.type === 'breadboard-edge') writeModel(shape.props.association ? deleteAssociation(model, shape.props.connectionId) : deleteConnection(model, shape.props.connectionId));
    if (shape.type === 'breadboard-slice' && Object.hasOwn(model.slices ?? {}, shape.props.sliceId)) writeModel(deleteSlice(model, shape.props.sliceId));
  });
  const unlisten = editor.store.listen(() => {
    const model = readModel(editor);
    if (model && model !== projected) project(model);
  }, { scope: 'document' });

  return {
    load,
    update(model: Breadboard) {
      const next = coverSliceMembers(withLayout(model));
      validateBreadboard(next);
      editor.markHistoryStoppingPoint('edit breadboard');
      editor.run(() => writeModel(next));
      project(next);
    },
    undo() {
      const before = JSON.stringify(readModel(editor));
      while (editor.getCanUndo()) {
        editor.undo();
        if (JSON.stringify(readModel(editor)) !== before) break;
      }
    },
    redo() {
      const before = JSON.stringify(readModel(editor));
      while (editor.getCanRedo()) {
        editor.redo();
        if (JSON.stringify(readModel(editor)) !== before) break;
      }
    },
    dispose() { disposed = true; afterChange(); beforeDelete(); afterDelete(); unlisten(); },
  };
}
export type CanvasController = ReturnType<typeof createController>;
