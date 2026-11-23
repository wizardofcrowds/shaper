import { AreaManager } from './AreaManager.tsx';
import { areaNodeIds, areaCrossings, assignArea, UNASSIGNED_AREA } from './areas.ts';
import { ReferenceSelect } from './ReferenceSelect.tsx';
import { DataPanel, AssociationFields } from './DataPanel.tsx';
import { deleteAssociation } from './data.ts';
import { Field } from './Field.tsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tldraw, useValue } from 'tldraw';
import type { Editor } from 'tldraw';
import { BreadboardError, parseBreadboard, writeBreadboard } from '../index.ts';
import type { Affordance, Breadboard, BreadboardNode, Connection } from '../model.ts';
import example from '../../examples/two-paths.breadboard.yaml?raw';
import componentExample from '../../examples/publishing.breadboard.yaml?raw';
import orderingExample from '../../examples/ordering.breadboard.yaml?raw';
import loginExample from '../../examples/login.breadboard.yaml?raw';
import { CanvasInteraction, createController, associationShapeId, edgeShapeId, nodeShapeId, readModel, shapeUtils } from './canvas.tsx';
import type { CanvasController } from './canvas.tsx';
import { FileDialog } from './FileDialog.tsx';
import { inspectFile, readLocalFile, saveLocalFile } from './files.ts';
import type { FileTarget } from './files.ts';
import { NODE_COLORS } from '../colors.ts';
import { nodeColorStyle } from './colors.ts';
import { addAffordance, addNode, affordanceIds, checkBreadboard, connect, connectionAt, connections, deleteAffordance, deleteConnection, deleteNode, moveAffordance, moveConnection, withLayout } from './model.ts';

type Selection = { type: 'node'; id: string; row?: string } | { type: 'connection' | 'association'; id: string } | null;
type Notice = { text: string; error?: boolean } | null;
const initial = withLayout(parseBreadboard(example));
const components = { ContextMenu: null };

function rememberFile(path: string | null) {
  const url = new URL(window.location.href);
  if (path) url.searchParams.set('file', path);
  else url.searchParams.delete('file');
  window.history.replaceState(window.history.state, '', url);
}
const affordanceKinds: Affordance['kind'][] = ['action', 'input', 'copy', 'capability', 'event'];
const connectionKinds: Connection['kind'][] = ['navigate', 'detour', 'invoke', 'emit', 'read', 'write'];

function errorText(error: unknown): string {
  if (error instanceof BreadboardError) return error.issues.map(issue => `${issue.line ? `Line ${issue.line}, column ${issue.column}: ` : `${issue.path || '/'}: `}${issue.message}`).join('\n');
  return error instanceof Error ? error.message : String(error);
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    open: 'M3 7h6l2 2h10l-3 11H3z M3 7V4h7l2 3h7v2',
    save: 'M12 3v12m-5-5 5 5 5-5 M4 15v5h16v-5',
    undo: 'M8 5 3 10l5 5 M3 10h10a7 7 0 0 1 7 7',
    redo: 'm16 5 5 5-5 5 M21 10h-10a7 7 0 0 0-7 7',
    fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
    check: 'm5 12 4 4L19 6',
    code: 'm8 6-6 6 6 6 m8-12 6 6-6 6 m-3-15-2 18',
    plus: 'M12 5v14 M5 12h14',
    leftPane: 'M4 4h16v16H4z M9 4v16',
    rightPane: 'M4 4h16v16H4z M15 4v16',
    up: 'M12 19V5 m-5 5 5-5 5 5',
    down: 'M12 5v14 m-5-5 5 5 5-5',
    arrow: 'M4 12h16 m-6-6 6 6-6 6',
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.plus} /></svg>;
}


function endpointLabel(model: Breadboard, ref: string): string {
  const [node, row] = ref.split('.') as [string, string | undefined];
  const entry = Object.hasOwn(model.nodes, node) ? model.nodes[node] : undefined;
  if (!entry) return `${ref} (missing)`;
  if (row) return entry.affordances[row]?.label ?? `${ref} (missing)`;
  return entry.label;
}


function ConnectionFields({ connection, model, source, onChange }: { connection: Connection; source: string; model: Breadboard; onChange: (change: (edge: Connection) => void) => void }) {
  return <>
    <ReferenceSelect label={connection.kind === 'detour' || connection.login ? 'To place' : 'To place or affordance'} placesOnly={connection.kind === 'detour' || Boolean(connection.login)} model={model} value={connection.to} onChange={to => onChange(edge => { edge.to = to; })} />
    <label className="field"><span>Connection kind</span><select aria-label="Connection kind" value={connection.kind} onChange={event => onChange(edge => { edge.kind = event.target.value as Connection['kind']; if (edge.kind !== 'navigate') delete edge.login; })}>{connectionKinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
    {connection.kind === 'navigate' && <>
      <label className="login-toggle"><input type="checkbox" checked={Boolean(connection.login)} onChange={event => onChange(edge => { if (event.target.checked) edge.login = {}; else delete edge.login; })} />Login required</label>
      {connection.login && <>
        <label className="field"><span>Login place</span><select aria-label="Login place" value={connection.login.via ?? ''} onChange={event => onChange(edge => { edge.login = event.target.value ? { via: event.target.value } : {}; })}>
          <option value="">Not specified yet</option>
          {connection.login.via && model.nodes[connection.login.via]?.kind !== 'place' && <option value={connection.login.via}>{connection.login.via} (unavailable)</option>}
          {Object.entries(model.nodes).filter(([, node]) => node.kind === 'place').map(([id, node]) => <option value={id} key={id}>{node.label}</option>)}
        </select></label>
        <p className="help">If signed out, log in first, then continue to this destination with the selected item. Cancel stays at {model.nodes[source]?.label ?? source}. No extra login arrow is drawn.</p>
      </>}
    </>}
    {connection.kind === 'detour' && <p className="help">Visit this place, then return to {model.nodes[source]?.label ?? source} after completion or cancellation, keeping the current task and entered information. Use this for optional member login.</p>}
    <Field label="Connection label (optional)" value={connection.label ?? ''} onCommit={value => onChange(edge => { if (value) edge.label = value; else delete edge.label; })} />
  </>;
}

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const controller = useRef<CanvasController | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [unlabeledNodes, setUnlabeledNodes] = useState<Set<string>>(() => new Set());
  const [unlabeledAffordances, setUnlabeledAffordances] = useState<Set<string>>(() => new Set());
  const [activeArea, setActiveArea] = useState('');
  const [areaManagerOpen, setAreaManagerOpen] = useState(false);
  const areaCameras = useRef(new Map<string, { x: number; y: number; z: number }>());
  const previousArea = useRef<string | null>(null);
  const areaFocus = useRef<Selection>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [tab, setTab] = useState<'inspect' | 'connections' | 'checks'>('inspect');
  const [notice, setNotice] = useState<Notice>(null);
  const [filename, setFilename] = useState('two-paths.breadboard.yaml');
  const [saved, setSaved] = useState(() => writeBreadboard(initial));
  const [yamlDraft, setYamlDraft] = useState<string | null>(null);
  const [fileTarget, setFileTarget] = useState<FileTarget | null>(null);
  const [fileDialog, setFileDialog] = useState<'open' | 'save' | null>(null);
  const [lastDirectory, setLastDirectory] = useState<string>();
  const startupFile = useRef(new URL(window.location.href).searchParams.get('file'));
  const [fileBusy, setFileBusy] = useState(Boolean(startupFile.current));
  const fileOperation = useRef(false);
  const model = useValue('shaper model', () => editor ? readModel(editor) : initial, [editor]);
  const selectedNative = useValue('shaper selection', () => {
    const selected = editor?.getOnlySelectedShape();
    if (selected?.type === 'breadboard-edge') return `${selected.props.association ? 'association' : 'connection'}:${selected.props.connectionId}`;
    if (selected?.type === 'breadboard-node') return `node:${selected.props.nodeId}`;
    return null;
  }, [editor]);
  const canUndo = useValue('can undo', () => editor?.getCanUndo() ?? false, [editor]);
  const canRedo = useValue('can redo', () => editor?.getCanRedo() ?? false, [editor]);
  const areaFilter = activeArea && activeArea !== UNASSIGNED_AREA && !Object.hasOwn(model.areas ?? {}, activeArea) ? '' : activeArea;
  const visibleNodes = useMemo(() => areaNodeIds(model, areaFilter), [model, areaFilter]);
  const crossings = useMemo(() => areaCrossings(model, areaFilter), [model, areaFilter]);
  useEffect(() => {
    if (!editor || !controller.current) return;
    if (previousArea.current !== null) areaCameras.current.set(previousArea.current, editor.getCamera());
    controller.current.setArea(areaFilter);
    editor.selectNone(); setSelection(null); setPending(null);
    const camera = areaCameras.current.get(areaFilter);
    if (camera) editor.setCamera(camera, { animation: { duration: 0 } });
    else editor.zoomToFit({ animation: { duration: 0 } });
    previousArea.current = areaFilter;
    const focus = areaFocus.current;
    areaFocus.current = null;
    if (focus) {
      editor.select(focus.type === 'node' ? nodeShapeId(focus.id) : focus.type === 'association' ? associationShapeId(focus.id) : edgeShapeId(focus.id));
      setSelection(focus); setTab('inspect'); setRightCollapsed(false);
    }
  }, [editor, areaFilter]);

  function resetAreaView() {
    setActiveArea(''); areaCameras.current.clear(); previousArea.current = ''; areaFocus.current = null;
    controller.current?.setArea('');
  }

  const graphConnections = useMemo(() => connections(model), [model]);
  const currentYaml = useMemo(() => writeBreadboard(model), [model]);
  const dirty = saved !== currentYaml;
  const findings = useMemo(() => checkBreadboard(model), [model]);
  const errors = findings.filter(finding => finding.severity === 'error').length;

  useEffect(() => {
    if (selectedNative) { setTab('inspect'); setRightCollapsed(false); }
    setSelection(previous => {
      if (!selectedNative) return previous?.type === 'connection' || previous?.type === 'association' ? previous : null;
      const [type, id] = selectedNative.split(':') as ['node' | 'connection' | 'association', string];
      return previous?.type === type && previous.id === id ? previous : { type, id };
    });
  }, [selectedNative]);

  useEffect(() => {
    if (!editor || !startupFile.current) return;
    let cancelled = false;
    fileOperation.current = true;
    setFileBusy(true);
    void readLocalFile(startupFile.current).then(opened => {
      if (cancelled) return;
      const next = withLayout(parseBreadboard(opened.text));
      resetAreaView(); controller.current?.load(next);
      setSaved(writeBreadboard(next)); setFilename(opened.name); setFileTarget(opened);
      setSelection(null); setPending(null); setUnlabeledAffordances(new Set()); setUnlabeledNodes(new Set()); setNotice(null);
      setLastDirectory(opened.path.slice(0, opened.path.lastIndexOf('/')) || '/');
      rememberFile(opened.path);
    }).catch(error => {
      if (!cancelled) setNotice({ text: `Could not reopen ${startupFile.current}: ${errorText(error)}`, error: true });
    }).finally(() => {
      if (!cancelled) {
        startupFile.current = null;
        fileOperation.current = false; setFileBusy(false);
      }
    });
    return () => { cancelled = true; };
  }, [editor]);

  const selectNode = useCallback((id: string, row?: string) => {
    if (model.nodes[id] && !visibleNodes.has(id)) {
      const area = model.nodes[id]!.area;
      areaFocus.current = { type: 'node', id, ...(row ? { row } : {}) };
      setActiveArea(area && Object.hasOwn(model.areas ?? {}, area) ? area : area ? '' : UNASSIGNED_AREA);
      return;
    }
    editor?.select(nodeShapeId(id));
    setSelection({ type: 'node', id, ...(row ? { row } : {}) });
    setTab('inspect'); setRightCollapsed(false);
  }, [editor, model, visibleNodes]);
  const selectAssociation = (id: string) => { if (areaFilter && !editor?.getShape(associationShapeId(id))) { areaFocus.current = { type: 'association', id }; setActiveArea(''); return; } editor?.select(associationShapeId(id)); setSelection({ type: 'association', id }); setTab('inspect'); setRightCollapsed(false); };
  const selectConnection = (id: string) => { if (areaFilter && !editor?.getShape(edgeShapeId(id))) { areaFocus.current = { type: 'connection', id }; setActiveArea(''); return; } editor?.select(edgeShapeId(id)); setSelection({ type: 'connection', id }); setTab('inspect'); setRightCollapsed(false); };
  const update = (next: Breadboard) => {
    try { controller.current?.update(next); setNotice(null); }
    catch (error) { setNotice({ text: errorText(error), error: true }); }
  };
  const edit = (change: (next: Breadboard) => void) => { const next = structuredClone(model); change(next); update(next); };
  const requiredLabel = (value: string, change: (next: Breadboard) => void) => {
    if (!value.trim()) { setNotice({ text: 'A label cannot be empty.', error: true }); return; }
    edit(change);
  };

  function serializeCurrent() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return writeBreadboard(editor ? readModel(editor) : model);
  }

  async function saveDocument(as = false) {
    if (fileOperation.current || fileDialog !== null) return;
    if (yamlDraft !== null) { setNotice({ text: 'Apply YAML edits before saving.', error: true }); return; }
    if (as || !fileTarget) { serializeCurrent(); setFileDialog('save'); return; }
    fileOperation.current = true; setFileBusy(true);
    try {
      const text = serializeCurrent();
      const target = await saveLocalFile(fileTarget.path, text, fileTarget.revision);
      rememberFile(target.path); setFileTarget(target); setFilename(target.name); setSaved(text); setNotice({ text: `Saved ${target.path}` });
    } catch (error) { setNotice({ text: errorText(error), error: true }); }
    finally { fileOperation.current = false; setFileBusy(false); }
  }

  function replaceDocument(text: string, name: string, target: FileTarget | null = null): boolean {
    try {
      const next = withLayout(parseBreadboard(text));
      if (dirty && !window.confirm('Replace this breadboard and discard unsaved changes? Cancel to return and save them first.')) return false;
      resetAreaView(); controller.current?.load(next);
      rememberFile(target?.path ?? null);
      setSaved(writeBreadboard(next)); setFilename(name); setFileTarget(target); setSelection(null); setPending(null); setUnlabeledAffordances(new Set()); setUnlabeledNodes(new Set()); setNotice(null);
      return true;
    } catch (error) { setNotice({ text: errorText(error), error: true }); return false; }
  }

  async function chooseFile(path: string) {
    if (fileOperation.current) return;
    fileOperation.current = true; setFileBusy(true);
    try {
      if (fileDialog === 'open') {
        const opened = await readLocalFile(path);
        if (!replaceDocument(opened.text, opened.name, opened)) return;
      } else {
        const destination = await inspectFile(path);
        if (destination.revision !== null && !window.confirm(`Replace “${destination.path}” with this breadboard?`)) return;
        const text = serializeCurrent();
        const target = await saveLocalFile(destination.path, text, destination.revision);
        rememberFile(target.path); setFileTarget(target); setFilename(target.name); setSaved(text); setNotice({ text: `Saved ${target.path}` });
      }
      setLastDirectory(path.slice(0, path.lastIndexOf('/')) || '/');
      setFileDialog(null);
    } finally { fileOperation.current = false; setFileBusy(false); }
  }

  function createNode(kind: BreadboardNode['kind']) {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    const result = addNode(model, kind, { x: Math.round(center.x - 150), y: Math.round(center.y - 70) });
    if (areaFilter && areaFilter !== UNASSIGNED_AREA) result.model.nodes[result.id]!.area = areaFilter;
    update(result.model);
    setUnlabeledNodes(previous => new Set(previous).add(result.id));
    selectNode(result.id);
  }

  function createConnection(from: string, to: string) {
    const result = connect(model, from, to);
    update(result.model); setPending(null); selectConnection(result.id);
  }

  function deleteSelection() {
    if (!selection) return;
    try {
      if (selection.type === 'association') {
        update(deleteAssociation(model, selection.id)); setSelection(null); editor?.selectNone();
      } else if (selection.type === 'connection') {
        update(deleteConnection(model, selection.id)); setSelection(null);
      } else if (selection.type === 'node' && selection.row) {
        const row = selection.row;
        update(deleteAffordance(model, selection.id, row)); selectNode(selection.id); setTab('checks');
      } else if (selection.type === 'node') {
        update(deleteNode(model, selection.id)); setSelection(null); editor?.selectNone(); setTab('checks');
      }
    } catch (error) { setNotice({ text: errorText(error), error: true }); }
  }

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (areaManagerOpen) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopImmediatePropagation(); if (yamlDraft !== null) setNotice({ text: 'Apply YAML edits before saving.', error: true }); else void saveDocument(event.shiftKey); return; }
      if (target?.matches('input, textarea, select') || target?.isContentEditable || yamlDraft !== null || fileDialog !== null || fileBusy) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopImmediatePropagation(); if (event.shiftKey) controller.current?.redo(); else controller.current?.undo(); }
      if (event.key === 'Escape') setPending(null);
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopImmediatePropagation(); deleteSelection(); }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  });

  const node = selection?.type === 'node' ? model.nodes[selection.id] : undefined;
  const row = selection?.type === 'node' && selection.row ? node?.affordances[selection.row] : undefined;
  const connection = selection?.type === 'connection' ? graphConnections.find(edge => edge.id === selection.id) : undefined;
  const association = selection?.type === 'association' ? model.associations?.[selection.id] : undefined;
  const associationComponentId = association?.from.split('.')[0];
  const associationComponent = associationComponentId ? model.nodes[associationComponentId] : undefined;

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><span className="brand-mark">s</span><span>shaper</span><span className="workspace-divider" /><span className="workspace-kind">Breadboard</span></div>
      <div className="file-tools">
        <button disabled={fileBusy} onClick={() => replaceDocument(writeBreadboard({ version: '0.1', title: 'Untitled breadboard', nodes: { home: { kind: 'place', label: 'Home', affordances: {} } } }), 'untitled.breadboard.yaml')}><Icon name="plus" />New</button>
        <button disabled={fileBusy} onClick={() => { serializeCurrent(); setFileDialog('open'); }}><Icon name="open" />Open</button>
        <button disabled={fileBusy} onClick={() => setYamlDraft(currentYaml)}><Icon name="code" />YAML</button>
        <button disabled={fileBusy} className="primary" onClick={() => void saveDocument()}><Icon name="save" />Save</button>
        <button disabled={fileBusy} onClick={() => void saveDocument(true)}>Save As</button>
      </div>
    </header>

    <div className="document-bar">
      <div className="document-title"><Field label="Breadboard title" value={model.title} onCommit={value => requiredLabel(value, next => { next.title = value; })} /><span className={`save-state ${dirty ? 'dirty' : ''}`}>{dirty ? 'Unsaved changes' : 'No changes'}</span></div>
      <div className="document-actions">
        <button className="icon-button" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={() => controller.current?.undo()}><Icon name="undo" /></button>
        <button className="icon-button" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={() => controller.current?.redo()}><Icon name="redo" /></button>
        <span className="toolbar-divider" />
        <button className="icon-button pane-toggle" aria-label={leftCollapsed ? 'Show left pane' : 'Hide left pane'} title={leftCollapsed ? 'Show left pane' : 'Hide left pane'} aria-expanded={!leftCollapsed} aria-controls="navigator-pane" onClick={() => setLeftCollapsed(value => !value)}><Icon name="leftPane" /></button>
        <button className="icon-button pane-toggle" aria-label={rightCollapsed ? 'Show right pane' : 'Hide right pane'} title={rightCollapsed ? 'Show right pane' : 'Hide right pane'} aria-expanded={!rightCollapsed} aria-controls="inspector-pane" onClick={() => setRightCollapsed(value => !value)}><Icon name="rightPane" /></button>
        <span className="toolbar-divider" />
        <button onClick={() => { setRightCollapsed(false); setTab('checks'); }} className={errors ? 'has-errors' : ''}><Icon name="check" />Check{errors > 0 && <span className="count-badge">{errors}</span>}</button>
      </div>
    </div>

    {notice && <div className={`notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span><button aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>}

    <main className={`workspace ${leftCollapsed ? 'is-left-collapsed' : ''} ${rightCollapsed ? 'is-right-collapsed' : ''}`}>
      <aside id="navigator-pane" className="navigator" aria-label="Places and components" hidden={leftCollapsed}>
        <div className="panel-heading"><span>PLACES & COMPONENTS</span><span className="subtle">{visibleNodes.size}</span></div>
        <div className="node-list">
          {Object.entries(model.nodes).filter(([id]) => visibleNodes.has(id)).map(([id, entry]) => <button key={id} className={`nav-item ${selection?.type === 'node' && selection.id === id ? 'active' : ''}`} onClick={() => selectNode(id)}>
            <span className={`node-symbol ${entry.kind === 'component' ? 'component-symbol' : ''}`} style={nodeColorStyle(entry.color)} />
            <span><span className="nav-label">{entry.label}</span><small>{Object.keys(entry.affordances).length} affordances{entry.area && ` · ${model.areas?.[entry.area]?.label ?? "Missing area"}`}</small></span>
          </button>)}
        </div>
        <div className="add-buttons"><button onClick={() => createNode('place')}><Icon name="plus" />Place</button><button onClick={() => createNode('component')}><Icon name="plus" />Component</button></div>
        <div className="navigator-footer"><span>EXAMPLES</span><button disabled={fileBusy} onClick={() => replaceDocument(example, 'two-paths.breadboard.yaml')}>Two paths from Home ↗</button><button disabled={fileBusy} onClick={() => replaceDocument(componentExample, 'publishing.breadboard.yaml')}>Component interaction ↗</button><button disabled={fileBusy} onClick={() => replaceDocument(orderingExample, 'ordering.breadboard.yaml')}>Order and line items ↗</button><button disabled={fileBusy} onClick={() => replaceDocument(loginExample, 'login.breadboard.yaml')}>Login and detours ↗</button></div>
      </aside>

      <section className="canvas-region" aria-label="Breadboard canvas">
        {!pending && <div className="canvas-create-tools">
          <button onClick={() => createNode('place')}><Icon name="plus" />Place</button>
          <button onClick={() => createNode('component')}><Icon name="plus" />Component</button>
          <div className="canvas-area-tools">
      <label>Area <select aria-label="Area view" value={areaFilter} onChange={event => { areaFocus.current = null; setActiveArea(event.target.value); }}>
        <option value="">All areas</option><option value={UNASSIGNED_AREA}>Unassigned</option>
        {Object.entries(model.areas ?? {}).map(([id, area]) => <option key={id} value={id}>{area.label}</option>)}
      </select></label>
      <button disabled={fileBusy} onClick={() => setAreaManagerOpen(true)}>Manage areas</button>
    </div>
        </div>}
        {pending && <div className="connect-banner"><span>Connect <strong>{endpointLabel(model, pending)}</strong> · choose a heading or affordance</span><button onClick={() => setPending(null)}>Cancel</button></div>}
        <CanvasInteraction.Provider value={{ pending, selectedRow: selection?.type === 'node' && selection.row ? `${selection.id}.${selection.row}` : null, select: selectNode, selectData: (nodeId, id) => {
          selectNode(nodeId);
          requestAnimationFrame(() => document.getElementById(`data-element-${nodeId}.${id}`)?.scrollIntoView({ block: 'nearest' }));
        }, startConnection: ref => { setPending(ref); setNotice(null); }, target: ref => { if (pending) createConnection(pending, ref); } }}>
          <Tldraw hideUi shapeUtils={shapeUtils} components={components} onMount={mounted => {
            const canvas = createController(mounted, initial);
            controller.current = canvas; setEditor(mounted);
            return () => { canvas.dispose(); controller.current = null; };
          }} />
        </CanvasInteraction.Provider>
        {areaFilter && !visibleNodes.size && <p className="empty-area-message">No residents here yet. Create a place or component, or assign existing elements in their Area selector.</p>}
        {crossings.length > 0 && <details className="area-boundary-panel" open>
          <summary>Outside this area · {crossings.length} connections</summary>
          <div>{crossings.map(crossing => {
            const outsideId = crossing.outside.split('.')[0]!, outside = model.nodes[outsideId];
            const refLabel = (ref: string) => { const [id, row] = ref.split('.'); const node = model.nodes[id!]; return node ? `${node.label}${row ? ` / ${node.affordances[row]?.label ?? node.data?.[row]?.label ?? row}` : ''}` : `${ref} (missing)`; };
            return <button key={crossing.id} disabled={!outside} onClick={() => selectNode(outsideId)} title="Open the connected element's area">
              <span>{refLabel(crossing.inside)} {crossing.direction === 'out' ? '→' : '←'} {refLabel(crossing.outside)}</span>
              <small>{crossing.label} · {outside?.area ? model.areas?.[outside.area]?.label ?? 'Missing area' : 'Unassigned'}</small>
            </button>;
          })}</div>
        </details>}
        <div className="canvas-caption">Drag a heading to move · select an affordance to edit · + to connect</div>
        <button className="fit-button" onClick={() => editor?.zoomToFit({ animation: { duration: 180 } })}><Icon name="fit" />Fit to view</button>
      </section>

      <aside id="inspector-pane" className="inspector" aria-label="Inspector" hidden={rightCollapsed}>
        <div className="inspector-tabs"><button className={tab === 'inspect' ? 'active' : ''} onClick={() => setTab('inspect')}>Inspect</button><button className={tab === 'connections' ? 'active' : ''} onClick={() => setTab('connections')}>Connections</button><button className={tab === 'checks' ? 'active' : ''} onClick={() => setTab('checks')}>Checks{findings.length > 0 && <span>{findings.length}</span>}</button></div>
        <div className="inspector-content">
          {tab === 'connections' ? <>
            <div className="section-eyebrow">PATHS THROUGH THE IDEA</div><h2>Connections</h2>
            <p className="help">Select a path to change its source, destination, or kind.</p>
            {graphConnections.map(edge => <button key={edge.id} className="inspector-row" onClick={() => selectConnection(edge.id)}><span>{endpointLabel(model, edge.from)} → {endpointLabel(model, edge.to)}</span><small>{edge.kind} · {edge.id}</small></button>)}
            {!graphConnections.length && <p className="help">Choose an affordance’s + port on the canvas, then choose its destination.</p>}
            <div className="section-heading"><h3>Data associations</h3></div>
            <p className="help">Dashed lines connect data elements; they do not describe actions or navigation.</p>
            {Object.entries(model.associations ?? {}).map(([id, entry]) => <button className="inspector-row" key={id} onClick={() => selectAssociation(id)}><span>{entry.label || `${entry.from} — ${entry.to}`}</span><small>{entry.from_cardinality ?? '?'} — {entry.to_cardinality ?? '?'}</small></button>)}
            {!Object.keys(model.associations ?? {}).length && <p className="help">Add data elements in a component to associate them.</p>}
          </> : tab === 'checks' ? <>
            <div className="section-eyebrow">STRUCTURE & SCENARIOS</div><h2>{errors ? `${errors} ${errors === 1 ? 'issue' : 'issues'} to resolve` : 'Structure looks connected'}</h2>
            <p className="help">These checks follow references and navigation scenarios. They do not establish whether the design meets its user’s needs.</p>
            {!findings.length && <div className="check-success"><Icon name="check" /><span>References resolve and navigation scenarios reach their expected destinations.</span></div>}
            {findings.map((finding, index) => <div key={index} className={`finding finding-${finding.severity}`}><span className="finding-kind">{finding.severity}</span><p>{finding.message}</p></div>)}
            <p className="help check-note">Unfinished connections can still be saved. Deleting a place or affordance removes its outgoing paths. Incoming references and scenarios remain here until you resolve them.</p>
          </> : node && selection?.type === 'node' ? <>
            <div className="section-eyebrow">{row ? 'AFFORDANCE' : node.kind.toUpperCase()}</div><h2>{row ? 'Edit affordance' : 'Edit place or component'}</h2>
            <code className="semantic-id">{selection.id}{selection.row ? `.${selection.row}` : ''}</code>
            {row && selection.row ? <>
              <Field key={`${selection.id}.${selection.row}`} label="Affordance label" placeholder="New affordance" value={unlabeledAffordances.has(`${selection.id}.${selection.row}`) && row.label === 'New affordance' ? '' : row.label} onCommit={value => requiredLabel(value, next => {
                next.nodes[selection.id]!.affordances[selection.row!]!.label = value;
                setUnlabeledAffordances(previous => { const updated = new Set(previous); updated.delete(`${selection.id}.${selection.row}`); return updated; });
              })} multiline />
              <label className="field"><span>Affordance kind</span><select value={row.kind} onChange={event => edit(next => { next.nodes[selection.id]!.affordances[selection.row!]!.kind = event.target.value as Affordance['kind']; })}>{affordanceKinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
              <div className="section-heading"><h3>Outgoing connections</h3></div>
              <p className="help">Each path starts from this affordance.</p>
              {Object.entries(row.connections ?? {}).map(([key, edge]) => {
                const id = `${selection.id}.${selection.row}.${key}`;
                return <section className="connection-card" aria-label={`Connection ${key}`} key={id}>
                  <code className="semantic-id">{key}</code>
                  <ConnectionFields connection={edge} model={model} source={selection.id} onChange={change => edit(next => change(connectionAt(next, id)))} />
                  <button className="danger-button" onClick={() => update(deleteConnection(model, id))}>Delete connection</button>
                </section>;
              })}
              {!Object.keys(row.connections ?? {}).length && <p className="help">No outgoing connections yet.</p>}
              <button className="text-button secondary-action" onClick={() => {
                const result = connect(model, `${selection.id}.${selection.row}`, Object.keys(model.nodes)[0]!);
                update(result.model);
              }}><Icon name="plus" />Add connection</button>
              <button className="text-button" onClick={() => setPending(`${selection.id}.${selection.row}`)}>Choose destination on canvas →</button>
              <button className="parent-navigation" onClick={() => selectNode(selection.id)}>← Back to {node.label}</button>
              <button className="text-button secondary-action" onClick={() => { const result = addAffordance(model, selection.id); update(result.model); setUnlabeledAffordances(previous => new Set(previous).add(`${selection.id}.${result.id}`)); selectNode(selection.id, result.id); }}><Icon name="plus" />Add a New Affordance</button>
              <div className="affordance-order-actions">
                <button disabled={affordanceIds(node)[0] === selection.row} onClick={() => update(moveAffordance(model, selection.id, selection.row!, -1))}><Icon name="up" />Move up</button>
                <button disabled={affordanceIds(node).at(-1) === selection.row} onClick={() => update(moveAffordance(model, selection.id, selection.row!, 1))}><Icon name="down" />Move down</button>
              </div>
            </> : <>
              <Field key={`node-label:${selection.id}`} label={node.kind === 'component' ? 'Component label' : 'Place label'} placeholder={node.kind === 'component' ? 'New component' : 'New place'} value={unlabeledNodes.has(selection.id) && (node.label === 'New component' || node.label === 'New place') ? '' : node.label} onCommit={value => requiredLabel(value, next => {
                next.nodes[selection.id]!.label = value;
                setUnlabeledNodes(previous => { const updated = new Set(previous); updated.delete(selection.id); return updated; });
              })} multiline />
              <label className="field"><span>Node kind</span><select value={node.kind} onChange={event => edit(next => { next.nodes[selection.id]!.kind = event.target.value as BreadboardNode['kind']; if (event.target.value === 'place') delete next.nodes[selection.id]!.data; })}><option value="place" disabled={Boolean(Object.keys(node.data ?? {}).length)}>Place</option><option value="component">Component</option></select></label>
              <label className="field"><span>Area</span><select aria-label="Area" value={node.area ?? ''} onChange={event => update(assignArea(model, selection.id, event.target.value || null))}>
                <option value="">Unassigned</option>
                {node.area && !Object.hasOwn(model.areas ?? {}, node.area) && <option value={node.area}>{node.area} (missing)</option>}
                {Object.entries(model.areas ?? {}).map(([id, area]) => <option value={id} key={id}>{area.label}</option>)}
              </select></label>
              <fieldset className="node-color-picker"><legend>Color</legend>
                <div className="color-swatches" role="group" aria-label="Place or component color">
                  {NODE_COLORS.map(tone => <button key={tone.id} type="button" className="color-swatch" style={nodeColorStyle(tone.id)} aria-label={`${tone.label} color`} title={tone.label} aria-pressed={node.color === tone.id}
                    onClick={() => edit(next => { next.nodes[selection.id]!.color = tone.id; })}>
                    {node.color === tone.id && <Icon name="check" />}
                  </button>)}
                </div>
                <div className="color-selection"><span>{NODE_COLORS.find(tone => tone.id === node.color)?.label ?? 'Default'}</span><button type="button" className="text-button" disabled={!node.color} onClick={() => edit(next => { delete next.nodes[selection.id]!.color; })}>Reset to default</button></div>
              </fieldset>
              <div className="section-heading"><h3>Affordances</h3><button className="tiny-button" aria-label="Add affordance" onClick={() => { const result = addAffordance(model, selection.id); update(result.model); setUnlabeledAffordances(previous => new Set(previous).add(`${selection.id}.${result.id}`)); selectNode(selection.id, result.id); }}><Icon name="plus" /></button></div>
              {affordanceIds(node).map((id, index, entries) => { const entry = node.affordances[id]!; return <div className="affordance-list-item" key={id}>
                <button className="inspector-row" onClick={() => selectNode(selection.id, id)}><span>{entry.label}</span><small>{entry.kind} ↗</small></button>
                <div className="reorder-controls">
                  <button aria-label={`Move ${entry.label} up`} title="Move up" disabled={index === 0} onClick={() => update(moveAffordance(model, selection.id, id, -1))}><Icon name="up" /></button>
                  <button aria-label={`Move ${entry.label} down`} title="Move down" disabled={index === entries.length - 1} onClick={() => update(moveAffordance(model, selection.id, id, 1))}><Icon name="down" /></button>
                </div>
              </div>; })}
              {!Object.keys(node.affordances).length && <p className="help">What can someone do or read here?</p>}
              {node.kind === 'component' && <DataPanel key={`node-data:${selection.id}`} model={model} nodeId={selection.id} onChange={update} onSelectAssociation={selectAssociation} />}
            </>}
            <p className="help id-note">Labels can change while connections keep their identity.</p>
            <button className="danger-button" onClick={deleteSelection}>Delete {row ? 'affordance' : node.kind}</button>
          </> : selection?.type === 'association' && model.associations?.[selection.id] ? <>
            <div className="section-eyebrow">DATA ASSOCIATION</div><h2>Edit association</h2><code className="semantic-id">{selection.id}</code>
            <AssociationFields key={selection.id} model={model} id={selection.id} onChange={update} />
            <p className="help">Drag the dashed line’s handle left or right to adjust its route.</p>
            <button disabled={!model.layout?.associations?.[selection.id]} onClick={() => edit(next => { if (next.layout?.associations) delete next.layout.associations[selection.id]; })}>Reset route</button>
            <button className="parent-navigation" disabled={associationComponent?.kind !== 'component'} title={associationComponent ? `Back to ${associationComponent.label}` : 'Source component is unavailable'} onClick={() => { if (associationComponentId) selectNode(associationComponentId); }}>← Back to Component</button>
            <button className="danger-button" onClick={deleteSelection}>Delete association</button>
          </> : connection && selection?.type === 'connection' ? <>
            <div className="section-eyebrow">CONNECTION</div><h2>Edit connection</h2><code className="semantic-id">{selection.id}</code>
            <ReferenceSelect label="From affordance" model={model} source value={connection.from} onChange={ref => {
              const moved = moveConnection(model, selection.id, ref); update(moved.model); selectConnection(moved.id);
            }} />
            <button className="text-button" onClick={() => { const [nodeId, rowId] = connection.from.split('.'); selectNode(nodeId!, rowId); }}>Edit source affordance →</button>
            <ConnectionFields key={selection.id} connection={connection} model={model} source={connection.from.split('.')[0]!} onChange={change => edit(next => change(connectionAt(next, selection.id)))} />
            <p className="help">Drag the arrow’s round handle left or right to route it around places. The vertical segment stays at that canvas position when places move.</p>
            <button disabled={!model.layout?.connections?.[selection.id]} onClick={() => edit(next => { if (next.layout?.connections) delete next.layout.connections[selection.id]; })}>Reset route</button>
            <p className="help">Choose an endpoint to reconnect this path. Moving a place keeps the same endpoints.</p><button className="danger-button" onClick={deleteSelection}>Delete connection</button>
          </> : <div className="inspector-empty"><p>No component/place is selected.</p></div>}
        </div>
      </aside>
    </main>
    <footer className="status-bar">
      <div className="status-details"><span className="status-file" title={fileTarget?.path}>{fileTarget?.path ?? filename}{!fileTarget && <span> · Not saved to a file</span>}</span><span>{Object.keys(model.nodes).length} nodes · {graphConnections.length} connections · {Object.keys(model.associations ?? {}).length} associations · {model.scenarios?.length ?? 0} scenarios</span><span className="local-indicator">Local workspace</span></div>
      <div className="canvas-shortcuts" aria-label="Keyboard and mouse instructions">
        <span><strong>Pan</strong> <kbd>Space</kbd> + drag or two-finger scroll</span>
        <span><strong>Zoom</strong> pinch or <kbd>⌘ / Ctrl</kbd> + scroll</span>
        <span><strong>Page</strong> <kbd>Space</kbd> + <kbd>↑ ↓ ← →</kbd></span>
        <span><strong>Fit</strong> click Fit to view</span>
        <span><strong>Save</strong> <kbd>⌘ / Ctrl</kbd> + <kbd>S</kbd> · add <kbd>Shift</kbd> for Save As</span>
      </div>
    </footer>

    {areaManagerOpen && <AreaManager model={model} onChange={update} onClose={() => setAreaManagerOpen(false)} />}
    {fileDialog !== null && <FileDialog mode={fileDialog} directory={fileTarget ? fileTarget.path.slice(0, fileTarget.path.lastIndexOf('/')) : lastDirectory} filename={filename} onChoose={chooseFile} onCancel={() => setFileDialog(null)} />}
    {yamlDraft !== null && <div className="modal-backdrop"><section className="yaml-modal" role="dialog" aria-modal="true" aria-labelledby="yaml-title"><div className="modal-heading"><div><span className="section-eyebrow">BREADBOARD FILE</span><h2 id="yaml-title">Read and edit the YAML</h2></div><button aria-label="Close YAML" onClick={() => setYamlDraft(null)}>×</button></div><p className="help">Applying validates the document first. Metadata, scenarios, and layout remain part of the file.</p><textarea aria-label="YAML document" spellCheck={false} value={yamlDraft} onChange={event => setYamlDraft(event.target.value)} />{notice?.error && <div className="yaml-error" role="alert">{notice.text}</div>}<div className="modal-actions"><button onClick={() => setYamlDraft(null)}>Cancel</button><button className="primary" onClick={() => {
      try { const next = withLayout(parseBreadboard(yamlDraft)); controller.current?.update(next); editor?.selectNone(); setYamlDraft(null); setPending(null); setSelection(null); setNotice(null); }
      catch (error) { setNotice({ text: errorText(error), error: true }); }
    }}>Apply YAML</button></div></section></div>}
  </div>;
}
