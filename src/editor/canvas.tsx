import { tagRows, tagChipWidth, TAG_HEIGHT, AFFORDANCE_TAG_HEIGHT, NODE_TAG_WIDTH, AFFORDANCE_TAG_WIDTH } from '../geometry.ts';
import { areaNodeIds } from './areas.ts';
import { associationGeometry, deleteAssociation } from './data.ts';
import { createContext, useContext } from 'react';
import {
  createShapeId, HTMLContainer, Polyline2d, Rectangle2d, ShapeUtil,
  SVGContainer, T, Vec, getIndexAbove,
} from 'tldraw';
import type { Editor, JsonObject, TLShape, TLHandleDragInfo } from 'tldraw';
import { validateBreadboard } from '../index.ts';
import type { Breadboard } from '../model.ts';
import { nodeColorStyle } from './colors.ts';
import { affordanceIds, deleteConnection, deleteNode, edgeGeometry, ATTRIBUTE_HEIGHT, HEADER_HEIGHT, NODE_WIDTH, nodeHeight, ROW_HEIGHT, withLayout } from './model.ts';

interface Row { id: string; label: string; kind: string; tags: string[]; notes: string }
interface DataRow extends Pick<Row, 'id' | 'label' | 'kind'> { attributes: string[] }
interface NodeProps { tags: string[]; notes: string; nodeId: string; label: string; kind: string; color: string; areaLabel: string; rows: Row[]; data: DataRow[]; w: number; h: number }
interface EdgeProps { notes: string; loginRequired: boolean; association: boolean; fromCardinality: string; toCardinality: string; connectionId: string; label: string; kind: string; sx: number; sy: number; mx: number; ex: number; ey: number }

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'breadboard-node': NodeProps;
    'breadboard-edge': EdgeProps;
  }
}
export type NodeShape = TLShape<'breadboard-node'>;
type EdgeShape = TLShape<'breadboard-edge'>;
export const nodeShapeId = (id: string) => createShapeId(`shaper-node-${id}`);
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

function CanvasTags({ tags, small = false }: { tags: string[]; small?: boolean }) {
  const width = small ? AFFORDANCE_TAG_WIDTH : NODE_TAG_WIDTH;
  return <div className={`canvas-tags ${small ? 'affordance-tags' : ''}`}>
    {tagRows(tags, width).map((row, index) => <div className="canvas-tag-row" key={index} style={{ height: small ? AFFORDANCE_TAG_HEIGHT : TAG_HEIGHT, width }}>
      {row.map(tag => <span key={tag} className={`canvas-tag ${tag.includes(':') ? 'prefixed-tag' : ''}`} title={tag} style={{ width: tagChipWidth(tag, width) }}>{tag}</span>)}
    </div>)}
  </div>;
}

function NodeContent({ shape }: { shape: NodeShape }) {
  const interaction = useContext(CanvasInteraction);
  const { nodeId, label, kind, rows, data, tags, notes, w, h } = shape.props;
  return <HTMLContainer style={{ width: w, height: h, pointerEvents: 'all' }}>
    <div className={`breadboard-node ${interaction.pending ? 'is-target' : ''}`} data-node-id={nodeId} style={nodeColorStyle(shape.props.color)}>
      <div className="node-heading" style={{ height: HEADER_HEIGHT }} onPointerDown={event => {
        if (interaction.pending) { event.stopPropagation(); interaction.target(nodeId); }
      }}>
        <div className="node-kind">{kind === 'place' ? 'PLACE' : 'COMPONENT'}{shape.props.areaLabel && <span className="node-area-label" title={shape.props.areaLabel}> · {shape.props.areaLabel}</span>}</div>
        <div className="node-label" title={label}>{label}</div>
        {notes.trim() && <span className="note-marker node-note" title={notes} aria-label="Place or component notes">ⓘ</span>}
      </div>
      <CanvasTags tags={tags} />
      {rows.map(row => <div className="affordance-block" key={row.id} onPointerDown={event => {
        event.stopPropagation();
        if (interaction.pending) interaction.target(`${nodeId}.${row.id}`); else interaction.select(nodeId, row.id);
      }}><div className={`node-row ${interaction.selectedRow === `${nodeId}.${row.id}` ? 'is-selected' : ''}`}
        style={{ height: ROW_HEIGHT }}>
        <span className={`affordance-mark mark-${row.kind}`} aria-hidden="true">{row.kind === 'copy' ? '“' : row.kind === 'input' ? '▱' : row.kind === 'event' ? '↗' : '·'}</span>
        <span className="row-label" title={row.label}>{row.label}</span>
        {row.notes.trim() && <span className="note-marker" title={row.notes} aria-label="Affordance notes">ⓘ</span>}
        <button className={`port ${interaction.pending === `${nodeId}.${row.id}` ? 'is-active' : ''}`}
          aria-label={`Connect from ${label}: ${row.label}`} title="Start a connection"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); interaction.startConnection(`${nodeId}.${row.id}`); }}>+</button>
      </div><CanvasTags tags={row.tags} small /></div>)}
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
    tags: T.arrayOf(T.string), notes: T.string, nodeId: T.string, label: T.string, kind: T.string, color: T.string, areaLabel: T.string, w: T.number, h: T.number,
    rows: T.arrayOf(T.object({ id: T.string, label: T.string, kind: T.string, tags: T.arrayOf(T.string), notes: T.string })),
    data: T.arrayOf(T.object({ id: T.string, label: T.string, kind: T.string, attributes: T.arrayOf(T.string) })),
  };
  getDefaultProps(): NodeProps { return { tags: [], notes: '', nodeId: '', label: '', kind: 'place', color: '', areaLabel: '', rows: [], data: [], w: NODE_WIDTH, h: 144 }; }
  getGeometry(shape: NodeShape) { return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true }); }
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
  static override props = { notes: T.string, loginRequired: T.boolean, association: T.boolean, fromCardinality: T.string, toCardinality: T.string, connectionId: T.string, label: T.string, kind: T.string, sx: T.number, sy: T.number, mx: T.number, ex: T.number, ey: T.number };
  getDefaultProps(): EdgeProps { return { notes: '', loginRequired: false, association: false, fromCardinality: '', toCardinality: '', connectionId: '', label: '', kind: 'navigate', sx: 0, sy: 0, mx: 50, ex: 100, ey: 50 }; }
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
      <path d={`M${p.sx},${p.sy} H${p.mx} V${p.ey} H${p.ex}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={p.association ? '6 5' : dataAccess ? '1 4' : p.kind === 'navigate' || p.kind === 'detour' ? undefined : '6 4'} strokeLinecap={dataAccess ? 'round' : undefined} strokeLinejoin="round" />
      {!p.association && <path d={`M${p.ex - direction * 7},${p.ey - 4} L${p.ex},${p.ey} L${p.ex - direction * 7},${p.ey + 4}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />}
      {p.loginRequired && <g role="img" aria-label="Login required">
        <rect x={(p.sx + p.mx) / 2 - 43} y={p.sy - 25} width={86} height={18} rx={8} fill="#f5f3e9" stroke="#c9c4a6" strokeWidth={0.8} />
        <text x={(p.sx + p.mx) / 2} y={p.sy - 13} textAnchor="middle" fontSize="10" fill="#625b32">Login required</text>
      </g>}
      {p.association && <>
        <text x={p.sx + 8} y={p.sy - 9} fill="#607467" fontSize="11">{p.fromCardinality || '?'}</text>
        <text x={p.ex + (direction > 0 ? -12 : 12)} y={p.ey - 9} textAnchor={direction > 0 ? 'end' : 'start'} fill="#607467" fontSize="11">{p.toCardinality || '?'}</text>
      </>}
      <text x={p.association ? p.mx + 9 : (p.sx + p.mx) / 2} y={p.association ? (p.sy + p.ey) / 2 - 9 : p.sy - (p.loginRequired ? 34 : 9)} textAnchor="middle" fill={dataAccess ? stroke : '#607467'} fontSize="10" fontFamily="system-ui, sans-serif">{(p.label || (p.kind === 'navigate' || p.association ? '' : p.kind === 'detour' ? 'detour · returns here' : p.kind)).slice(0, p.association ? 60 : 32)}{p.notes.trim() && <tspan className="note-marker" style={{ pointerEvents: 'all' }} aria-label="Connection notes"><title>{p.notes}</title> ⓘ</tspan>}</text>
    </SVGContainer>;
  }
  getIndicatorPath(shape: EdgeShape) { const p = shape.props; return new Path2D(`M${p.sx},${p.sy} H${p.mx} V${p.ey} H${p.ex}`); }
}

export const shapeUtils = [BreadboardNodeUtil, BreadboardEdgeUtil];

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
  let areaFilter = '';
  let tagFilter = '';

  function project(model: Breadboard) {
    if (projecting || disposed) return;
    projecting = true;
    try {
      editor.run(() => {
        const visible = areaNodeIds(model, areaFilter, tagFilter);
        const desired = new Set<string>();
        for (const [id, node] of Object.entries(model.nodes)) {
          if (!visible.has(id)) continue;
          const shapeId = nodeShapeId(id);
          desired.add(shapeId);
          const position = model.layout!.nodes![id]!;
          const props: NodeProps = { tags: node.tags ?? [], notes: node.notes ?? '', nodeId: id, label: node.label, kind: node.kind, color: node.color ?? '', areaLabel: node.area ? model.areas?.[node.area]?.label ?? 'Missing area' : '', w: NODE_WIDTH, h: nodeHeight(node), rows: affordanceIds(node).map(rowId => ({ id: rowId, label: node.affordances[rowId]!.label, kind: node.affordances[rowId]!.kind, tags: node.affordances[rowId]!.tags ?? [], notes: node.affordances[rowId]!.notes ?? '' })), data: Object.keys(node.data ?? {}).sort().map(key => ({ id: key, label: node.data![key]!.label, kind: 'data', attributes: node.data![key]!.attributes ?? [] })) };
          const existing = editor.getShape<NodeShape>(shapeId);
          if (!existing) editor.createShape<NodeShape>({ id: shapeId, type: 'breadboard-node', ...position, props });
          else if (existing.x !== position.x || existing.y !== position.y || JSON.stringify(existing.props) !== JSON.stringify(props)) editor.updateShape<NodeShape>({ id: shapeId, type: 'breadboard-node', ...position, props });
        }
        for (const geometry of edgeGeometry(model)) {
          const { id, connection, x, y, sx, sy, mx, ex, ey } = geometry;
          if (!visible.has(connection.from.split('.')[0]!) || !visible.has(connection.to.split('.')[0]!)) continue;
          const shapeId = edgeShapeId(id);
          desired.add(shapeId);
          const props: EdgeProps = { notes: connection.notes ?? '', loginRequired: Boolean(connection.login), association: false, fromCardinality: '', toCardinality: '', connectionId: id, label: connection.label ?? '', kind: connection.kind, sx, sy, mx, ex, ey };
          const existing = editor.getShape<EdgeShape>(shapeId);
          if (!existing) editor.createShape<EdgeShape>({ id: shapeId, type: 'breadboard-edge', x, y, props });
          else if (existing.x !== x || existing.y !== y || JSON.stringify(existing.props) !== JSON.stringify(props)) editor.updateShape<EdgeShape>({ id: shapeId, type: 'breadboard-edge', x, y, props });
        }
        for (const geometry of associationGeometry(model)) {
          const { id, association, x, y, sx, sy, mx, ex, ey } = geometry;
          if (!visible.has(association.from.split('.')[0]!) || !visible.has(association.to.split('.')[0]!)) continue;
          const shapeId = associationShapeId(id);
          desired.add(shapeId);
          const props: EdgeProps = { notes: '', loginRequired: false, association: true, connectionId: id, label: association.label ?? '', kind: 'association', fromCardinality: association.from_cardinality ?? '', toCardinality: association.to_cardinality ?? '', sx, sy, mx, ex, ey };
          const existing = editor.getShape<EdgeShape>(shapeId);
          if (!existing) editor.createShape<EdgeShape>({ id: shapeId, type: 'breadboard-edge', x, y, props });
          else if (existing.x !== x || existing.y !== y || JSON.stringify(existing.props) !== JSON.stringify(props)) editor.updateShape<EdgeShape>({ id: shapeId, type: 'breadboard-edge', x, y, props });
        }
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
        writeModel(withLayout(model));
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
      const model = structuredClone(readModel(editor));
      if (!Object.hasOwn(model.nodes, next.props.nodeId)) return;
      model.layout!.nodes![next.props.nodeId] = { x: next.x || 0, y: next.y || 0 };
      writeModel(model);
    } else if (next.type === 'breadboard-edge' && previous.type === 'breadboard-edge') {
      if (previous.props.mx === next.props.mx) return;
      const model = structuredClone(readModel(editor));
      model.layout ??= {};
      const routes = next.props.association ? (model.layout.associations ??= {}) : (model.layout.connections ??= {});
      routes[next.props.connectionId] = { x: next.x + next.props.mx };
      writeModel(model);
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
  });
  const unlisten = editor.store.listen(() => {
    const model = readModel(editor);
    if (model && model !== projected) project(model);
  }, { scope: 'document' });

  return {
    load,
    setView(area: string, tag = '') { areaFilter = area; tagFilter = tag; project(readModel(editor)); },
    update(model: Breadboard) {
      const next = withLayout(model);
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
