import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tldraw, useValue } from 'tldraw';
import type { Editor } from 'tldraw';
import { BreadboardError, parseBreadboard, writeBreadboard } from '../index.ts';
import type { Affordance, Breadboard, BreadboardNode, Connection } from '../model.ts';
import example from '../../examples/two-paths.breadboard.yaml?raw';
import componentExample from '../../examples/publishing.breadboard.yaml?raw';
import sliceExample from '../../examples/slices.breadboard.yaml?raw';
import { CanvasInteraction, createController, edgeShapeId, nodeShapeId, sliceShapeId, readModel, shapeUtils } from './canvas.tsx';
import type { CanvasController } from './canvas.tsx';
import { FileDialog } from './FileDialog.tsx';
import { inspectFile, readLocalFile, saveLocalFile } from './files.ts';
import type { FileTarget } from './files.ts';
import { addSlice, assignSlice, boundaryConnections, deleteSlice, resizeSlice, settleNodeDrops, sliceMembers } from './slices.ts';
import { NODE_COLORS } from '../colors.ts';
import { nodeColorStyle } from './colors.ts';
import { addAffordance, addNode, affordanceIds, checkBreadboard, connect, connectionAt, connections, deleteAffordance, deleteConnection, deleteNode, moveAffordance, moveConnection, withLayout } from './model.ts';

type Selection = { type: 'node'; id: string; row?: string } | { type: 'connection'; id: string } | { type: 'slice'; id: string } | null;
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
const connectionKinds: Connection['kind'][] = ['navigate', 'invoke', 'emit', 'read', 'write'];

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

function Field({ label, value, onCommit, multiline = false, placeholder }: { label: string; value: string; onCommit: (value: string) => void; multiline?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  const props = { 'aria-label': label, placeholder, value: draft, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: () => { if (cancelled.current) { cancelled.current = false; return; } if (draft !== value) onCommit(draft); }, onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (event.key === 'Enter' && !multiline) event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setDraft(value); event.currentTarget.blur(); } } };
  return <label className="field"><span>{label}</span>{multiline ? <textarea rows={2} {...props} /> : <input {...props} />}</label>;
}

function endpointLabel(model: Breadboard, ref: string): string {
  const [node, row] = ref.split('.') as [string, string | undefined];
  const entry = Object.hasOwn(model.nodes, node) ? model.nodes[node] : undefined;
  if (!entry) return `${ref} (missing)`;
  if (row) return entry.affordances[row]?.label ?? `${ref} (missing)`;
  return entry.label;
}

function ReferenceSelect({ label, value, model, source, onChange }: { label: string; value: string; model: Breadboard; source?: boolean; onChange: (ref: string) => void }) {
  const refs = Object.entries(model.nodes).flatMap(([nodeId, node]) => [...(source ? [] : [{ id: nodeId, label: node.label }]), ...Object.entries(node.affordances).map(([id, row]) => ({ id: `${nodeId}.${id}`, label: `${node.label} / ${row.label}` }))]);
  return <label className="field"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>
    {!refs.some(ref => ref.id === value) && <option value={value}>{value} (missing)</option>}
    {refs.map(ref => <option key={ref.id} value={ref.id}>{ref.label}</option>)}
  </select></label>;
}

function ConnectionFields({ connection, model, onChange }: { connection: Connection; model: Breadboard; onChange: (change: (edge: Connection) => void) => void }) {
  return <>
    <ReferenceSelect label="To place or affordance" model={model} value={connection.to} onChange={to => onChange(edge => { edge.to = to; })} />
    <label className="field"><span>Connection kind</span><select value={connection.kind} onChange={event => onChange(edge => { edge.kind = event.target.value as Connection['kind']; })}>{connectionKinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
    <Field label="Connection label (optional)" value={connection.label ?? ''} onCommit={value => onChange(edge => { if (value) edge.label = value; else delete edge.label; })} />
  </>;
}

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const controller = useRef<CanvasController | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [unlabeledAffordances, setUnlabeledAffordances] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(() => window.matchMedia('(max-width: 850px)').matches);
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
    if (selected?.type === 'breadboard-edge') return `connection:${selected.props.connectionId}`;
    if (selected?.type === 'breadboard-node') return `node:${selected.props.nodeId}`;
    if (selected?.type === 'breadboard-slice') return `slice:${selected.props.sliceId}`;
    return null;
  }, [editor]);
  const canUndo = useValue('can undo', () => editor?.getCanUndo() ?? false, [editor]);
  const canRedo = useValue('can redo', () => editor?.getCanRedo() ?? false, [editor]);
  const graphConnections = useMemo(() => connections(model), [model]);
  const currentYaml = useMemo(() => writeBreadboard(model), [model]);
  const dirty = saved !== currentYaml;
  const findings = useMemo(() => checkBreadboard(model), [model]);
  const errors = findings.filter(finding => finding.severity === 'error').length;

  useEffect(() => {
    if (selectedNative) { setTab('inspect'); setRightCollapsed(false); }
    setSelection(previous => {
      if (!selectedNative) return previous?.type === 'connection' ? previous : null;
      const [type, id] = selectedNative.split(':') as ['node' | 'slice' | 'connection', string];
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
      controller.current?.load(next);
      setSaved(writeBreadboard(next)); setFilename(opened.name); setFileTarget(opened);
      setSelection(null); setPending(null); setUnlabeledAffordances(new Set()); setNotice(null);
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
    editor?.select(nodeShapeId(id));
    setSelection({ type: 'node', id, ...(row ? { row } : {}) });
    setTab('inspect'); setRightCollapsed(false);
  }, [editor]);
  const selectSlice = (id: string) => { editor?.select(sliceShapeId(id)); setSelection({ type: 'slice', id }); setTab('inspect'); setRightCollapsed(false); };
  const selectConnection = (id: string) => { editor?.select(edgeShapeId(id)); setSelection({ type: 'connection', id }); setTab('inspect'); setRightCollapsed(false); };
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
      controller.current?.load(next);
      rememberFile(target?.path ?? null);
      setSaved(writeBreadboard(next)); setFilename(name); setFileTarget(target); setSelection(null); setPending(null); setUnlabeledAffordances(new Set()); setNotice(null);
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
    update(settleNodeDrops(result.model, [result.id])); selectNode(result.id);
  }

  function createSlice() {
    if (!editor) return;
    const right = Math.max(0, ...Object.values(model.layout?.nodes ?? {}).map(point => point.x + 300), ...Object.values(model.layout?.slices ?? {}).map(box => box.x + box.w));
    const result = addSlice(model, { x: right + 100, y: editor.getViewportPageBounds().center.y - 210 });
    update(result.model); selectSlice(result.id);
    editor.zoomToFit({ animation: { duration: 180 } });
  }

  function setSliceSize(id: string, axis: 'w' | 'h', value: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) { setNotice({ text: 'Enter a positive size.', error: true }); return; }
    update(resizeSlice(model, id, { ...model.layout!.slices![id]!, [axis]: number }));
  }

  function createConnection(from: string, to: string) {
    const result = connect(model, from, to);
    update(result.model); setPending(null); selectConnection(result.id);
  }

  function deleteSelection() {
    if (!selection) return;
    try {
      if (selection.type === 'slice') {
        update(deleteSlice(model, selection.id)); setSelection(null); editor?.selectNone();
      } else if (selection.type === 'connection') {
        update(deleteConnection(model, selection.id)); setSelection(null);
      } else if (selection.row) {
        const row = selection.row;
        update(deleteAffordance(model, selection.id, row)); selectNode(selection.id); setTab('checks');
      } else {
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
  const slice = selection?.type === 'slice' ? model.slices?.[selection.id] : undefined;
  const connection = selection?.type === 'connection' ? graphConnections.find(edge => edge.id === selection.id) : undefined;

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
        <div className="panel-heading"><span>PLACES & COMPONENTS</span><span className="subtle">{Object.keys(model.nodes).length}</span></div>
        <div className="node-list">
          {Object.entries(model.nodes).map(([id, entry]) => <button key={id} className={`nav-item ${selection?.type === 'node' && selection.id === id ? 'active' : ''}`} onClick={() => selectNode(id)}>
            <span className={`node-symbol ${entry.kind === 'component' ? 'component-symbol' : ''}`} style={nodeColorStyle(entry.color)} />
            <span><span className="nav-label">{entry.label}</span><small>{Object.keys(entry.affordances).length} affordances{entry.slice && ` · ${model.slices?.[entry.slice]?.label ?? "Missing slice"}`}</small></span>
          </button>)}
        </div>
        <div className="add-buttons"><button onClick={() => createNode('place')}><Icon name="plus" />Place</button><button onClick={() => createNode('component')}><Icon name="plus" />Component</button></div>
        <div className="panel-heading slice-list-heading"><span>SLICES</span><button className="tiny-button" aria-label="Add slice" onClick={createSlice}><Icon name="plus" /></button></div>
        {Object.entries(model.slices ?? {}).map(([id, entry]) => <button key={id} className={`nav-item ${selection?.type === 'slice' && selection.id === id ? 'active' : ''}`} onClick={() => selectSlice(id)}><span className="slice-symbol" /><span><span className="nav-label">{entry.label}</span><small>{sliceMembers(model, id).length} {sliceMembers(model, id).length === 1 ? 'member' : 'members'}</small></span></button>)}
        {!Object.keys(model.slices ?? {}).length && <p className="help slice-list-help">Group places and components around a useful outcome.</p>}
        <div className="navigator-footer"><span>EXAMPLES</span><button disabled={fileBusy} onClick={() => replaceDocument(example, 'two-paths.breadboard.yaml')}>Two paths from Home ↗</button><button disabled={fileBusy} onClick={() => replaceDocument(componentExample, 'publishing.breadboard.yaml')}>Component interaction ↗</button><button disabled={fileBusy} onClick={() => replaceDocument(sliceExample, 'slices.breadboard.yaml')}>Sliced journey ↗</button></div>
      </aside>

      <section className="canvas-region" aria-label="Breadboard canvas">
        {!pending && <div className="canvas-create-tools"><button onClick={() => createNode('place')}><Icon name="plus" />Place</button><button onClick={() => createNode('component')}><Icon name="plus" />Component</button><button onClick={createSlice}><Icon name="plus" />Slice</button></div>}
        {pending && <div className="connect-banner"><span>Connect <strong>{endpointLabel(model, pending)}</strong> · choose a heading or affordance</span><button onClick={() => setPending(null)}>Cancel</button></div>}
        <CanvasInteraction.Provider value={{ pending, selectedRow: selection?.type === 'node' && selection.row ? `${selection.id}.${selection.row}` : null, select: selectNode, startConnection: ref => { setPending(ref); setNotice(null); }, target: ref => { if (pending) createConnection(pending, ref); } }}>
          <Tldraw hideUi shapeUtils={shapeUtils} components={components} onMount={mounted => {
            const canvas = createController(mounted, initial);
            controller.current = canvas; setEditor(mounted);
            return () => { canvas.dispose(); controller.current = null; };
          }} />
        </CanvasInteraction.Provider>
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
          </> : tab === 'checks' ? <>
            <div className="section-eyebrow">STRUCTURE & SCENARIOS</div><h2>{errors ? `${errors} ${errors === 1 ? 'issue' : 'issues'} to resolve` : 'Structure looks connected'}</h2>
            <p className="help">These checks follow references and navigation scenarios. They do not establish whether the design meets its user’s needs.</p>
            {!findings.length && <div className="check-success"><Icon name="check" /><span>References resolve and navigation scenarios reach their expected destinations.</span></div>}
            {findings.map((finding, index) => <div key={index} className={`finding finding-${finding.severity}`}><span className="finding-kind">{finding.severity}</span><p>{finding.message}</p></div>)}
            <p className="help check-note">Unfinished connections can still be saved. Deleting a place or affordance removes its outgoing paths. Incoming references and scenarios remain here until you resolve them.</p>
          </> : slice && selection?.type === 'slice' ? <>
            <div className="section-eyebrow">SLICE</div><h2>Edit slice</h2><code className="semantic-id">{selection.id}</code>
            <Field label="Slice name" value={slice.label} onCommit={value => requiredLabel(value, next => { next.slices![selection.id]!.label = value; })} multiline />
            <p className="help">Drag a place or component into this region to assign it. Drag the slice heading to move all its members. Resize with the corner handles.</p>
            <div className="slice-size-fields"><Field label="Slice width" value={String(Math.round(model.layout!.slices![selection.id]!.w))} onCommit={value => setSliceSize(selection.id, 'w', value)} /><Field label="Slice height" value={String(Math.round(model.layout!.slices![selection.id]!.h))} onCommit={value => setSliceSize(selection.id, 'h', value)} /></div>
            <div className="section-heading"><h3>Members</h3><span className="subtle">{sliceMembers(model, selection.id).length}</span></div>
            {sliceMembers(model, selection.id).map(id => <div className="slice-member" key={id}><button className="inspector-row" onClick={() => selectNode(id)}>{model.nodes[id]!.label}<small>{model.nodes[id]!.kind}</small></button><button className="text-button" aria-label={`Unassign ${model.nodes[id]!.label}`} onClick={() => { update(assignSlice(model, id, null)); editor?.zoomToFit({ animation: { duration: 180 } }); }}>Unassign</button></div>)}
            {!sliceMembers(model, selection.id).length && <p className="help">No members yet. Move a node here, or choose this slice in a node’s inspector.</p>}
            <div className="section-heading"><h3>Connections across boundary</h3></div>
            {boundaryConnections(model, selection.id).map(edge => <button className="inspector-row" key={edge.id} onClick={() => selectConnection(edge.id)}>{endpointLabel(model, edge.from)} → {endpointLabel(model, edge.to)}<small>{edge.kind}</small></button>)}
            {!boundaryConnections(model, selection.id).length && <p className="help">No connections cross this slice’s boundary.</p>}
            <p className="help">These are existing node connections. Use them to consider prerequisites and where to start.</p>
            <button className="danger-button" onClick={deleteSelection}>Delete slice · keep members</button>
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
                  <ConnectionFields connection={edge} model={model} onChange={change => edit(next => change(connectionAt(next, id)))} />
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
              <Field label="Place label" value={node.label} onCommit={value => requiredLabel(value, next => { next.nodes[selection.id]!.label = value; })} multiline />
              <label className="field"><span>Node kind</span><select value={node.kind} onChange={event => edit(next => { next.nodes[selection.id]!.kind = event.target.value as BreadboardNode['kind']; })}><option value="place">Place</option><option value="component">Component</option></select></label>
              <label className="field"><span>Slice</span><select aria-label="Slice" value={node.slice ?? ''} onChange={event => { update(assignSlice(model, selection.id, event.target.value || null)); editor?.zoomToFit({ animation: { duration: 180 } }); }}>
                <option value="">Unassigned</option>
                {node.slice && !Object.hasOwn(model.slices ?? {}, node.slice) && <option value={node.slice}>{node.slice} (missing)</option>}
                {Object.entries(model.slices ?? {}).map(([id, entry]) => <option value={id} key={id}>{entry.label}</option>)}
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
            </>}
            <p className="help id-note">Labels can change while connections keep their identity.</p>
            <button className="danger-button" onClick={deleteSelection}>Delete {row ? 'affordance' : node.kind}</button>
          </> : connection && selection?.type === 'connection' ? <>
            <div className="section-eyebrow">CONNECTION</div><h2>Edit connection</h2><code className="semantic-id">{selection.id}</code>
            <ReferenceSelect label="From affordance" model={model} source value={connection.from} onChange={ref => {
              const moved = moveConnection(model, selection.id, ref); update(moved.model); selectConnection(moved.id);
            }} />
            <button className="text-button" onClick={() => { const [nodeId, rowId] = connection.from.split('.'); selectNode(nodeId!, rowId); }}>Edit source affordance →</button>
            <ConnectionFields key={selection.id} connection={connection} model={model} onChange={change => edit(next => change(connectionAt(next, selection.id)))} />
            <p className="help">Drag the arrow’s round handle left or right to route it around places. The vertical segment stays at that canvas position when places move.</p>
            <button disabled={!model.layout?.connections?.[selection.id]} onClick={() => edit(next => { if (next.layout?.connections) delete next.layout.connections[selection.id]; })}>Reset route</button>
            <p className="help">Choose an endpoint to reconnect this path. Moving a place keeps the same endpoints.</p><button className="danger-button" onClick={deleteSelection}>Delete connection</button>
          </> : <div className="inspector-empty"><p>No component/place is selected.</p></div>}
        </div>
      </aside>
    </main>
    <footer className="status-bar">
      <div className="status-details"><span className="status-file" title={fileTarget?.path}>{fileTarget?.path ?? filename}{!fileTarget && <span> · Not saved to a file</span>}</span><span>{Object.keys(model.nodes).length} nodes · {Object.keys(model.slices ?? {}).length} slices · {graphConnections.length} connections · {model.scenarios?.length ?? 0} scenarios</span><span className="local-indicator">Local workspace</span></div>
      <div className="canvas-shortcuts" aria-label="Keyboard and mouse instructions">
        <span><strong>Pan</strong> <kbd>Space</kbd> + drag or two-finger scroll</span>
        <span><strong>Zoom</strong> pinch or <kbd>⌘ / Ctrl</kbd> + scroll</span>
        <span><strong>Page</strong> <kbd>Space</kbd> + <kbd>↑ ↓ ← →</kbd></span>
        <span><strong>Fit</strong> click Fit to view</span>
        <span><strong>Save</strong> <kbd>⌘ / Ctrl</kbd> + <kbd>S</kbd> · add <kbd>Shift</kbd> for Save As</span>
      </div>
    </footer>

    {fileDialog !== null && <FileDialog mode={fileDialog} directory={fileTarget ? fileTarget.path.slice(0, fileTarget.path.lastIndexOf('/')) : lastDirectory} filename={filename} onChoose={chooseFile} onCancel={() => setFileDialog(null)} />}
    {yamlDraft !== null && <div className="modal-backdrop"><section className="yaml-modal" role="dialog" aria-modal="true" aria-labelledby="yaml-title"><div className="modal-heading"><div><span className="section-eyebrow">BREADBOARD FILE</span><h2 id="yaml-title">Read and edit the YAML</h2></div><button aria-label="Close YAML" onClick={() => setYamlDraft(null)}>×</button></div><p className="help">Applying validates the document first. Metadata, scenarios, and layout remain part of the file.</p><textarea aria-label="YAML document" spellCheck={false} value={yamlDraft} onChange={event => setYamlDraft(event.target.value)} />{notice?.error && <div className="yaml-error" role="alert">{notice.text}</div>}<div className="modal-actions"><button onClick={() => setYamlDraft(null)}>Cancel</button><button className="primary" onClick={() => {
      try { const next = withLayout(parseBreadboard(yamlDraft)); controller.current?.update(next); editor?.selectNone(); setYamlDraft(null); setPending(null); setSelection(null); setNotice(null); }
      catch (error) { setNotice({ text: errorText(error), error: true }); }
    }}>Apply YAML</button></div></section></div>}
  </div>;
}
