import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tldraw, useValue } from 'tldraw';
import type { Editor } from 'tldraw';
import { BreadboardError, MAX_YAML_BYTES, parseBreadboard, writeBreadboard } from '../index.ts';
import type { Affordance, Breadboard, BreadboardNode, Connection } from '../model.ts';
import example from '../../examples/two-paths.breadboard.yaml?raw';
import componentExample from '../../examples/publishing.breadboard.yaml?raw';
import { CanvasInteraction, createController, nodeShapeId, readModel, shapeUtils } from './canvas.tsx';
import type { CanvasController } from './canvas.tsx';
import { addAffordance, addNode, affordanceIds, checkBreadboard, connect, connectionAt, connections, deleteAffordance, deleteConnection, deleteNode, moveAffordance, moveConnection, withLayout } from './model.ts';

type Selection = { type: 'node'; id: string; row?: string } | { type: 'connection'; id: string } | null;
type Notice = { text: string; error?: boolean } | null;
const initial = withLayout(parseBreadboard(example));
const components = { ContextMenu: null };
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

function Field({ label, value, onCommit, multiline = false }: { label: string; value: string; onCommit: (value: string) => void; multiline?: boolean }) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  const props = { 'aria-label': label, value: draft, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: () => { if (cancelled.current) { cancelled.current = false; return; } if (draft !== value) onCommit(draft); }, onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (event.key === 'Enter' && !multiline) event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setDraft(value); event.currentTarget.blur(); } } };
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
  const [pending, setPending] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(() => window.matchMedia('(max-width: 850px)').matches);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [tab, setTab] = useState<'inspect' | 'connections' | 'checks'>('inspect');
  const [notice, setNotice] = useState<Notice>(null);
  const [filename, setFilename] = useState('two-paths.breadboard.yaml');
  const [saved, setSaved] = useState(() => writeBreadboard(initial));
  const [yamlDraft, setYamlDraft] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const model = useValue('shaper model', () => editor ? readModel(editor) : initial, [editor]);
  const selectedNativeNode = useValue('shaper selection', () => {
    const selected = editor?.getOnlySelectedShape();
    return selected?.type === 'breadboard-node' ? selected.props.nodeId : null;
  }, [editor]);
  const canUndo = useValue('can undo', () => editor?.getCanUndo() ?? false, [editor]);
  const canRedo = useValue('can redo', () => editor?.getCanRedo() ?? false, [editor]);
  const graphConnections = useMemo(() => connections(model), [model]);
  const currentYaml = useMemo(() => writeBreadboard(model), [model]);
  const dirty = saved !== currentYaml;
  const findings = useMemo(() => checkBreadboard(model), [model]);
  const errors = findings.filter(finding => finding.severity === 'error').length;

  useEffect(() => {
    setSelection(previous => selectedNativeNode
      ? previous?.type === 'node' && previous.id === selectedNativeNode ? previous : { type: 'node', id: selectedNativeNode }
      : previous?.type === 'node' ? null : previous);
  }, [selectedNativeNode]);

  const selectNode = useCallback((id: string, row?: string) => {
    editor?.select(nodeShapeId(id));
    setSelection({ type: 'node', id, ...(row ? { row } : {}) });
    setTab('inspect'); setRightCollapsed(false);
  }, [editor]);
  const selectConnection = (id: string) => { editor?.selectNone(); setSelection({ type: 'connection', id }); setTab('inspect'); setRightCollapsed(false); };
  const update = (next: Breadboard) => {
    try { controller.current?.update(next); setNotice(null); }
    catch (error) { setNotice({ text: errorText(error), error: true }); }
  };
  const edit = (change: (next: Breadboard) => void) => { const next = structuredClone(model); change(next); update(next); };
  const requiredLabel = (value: string, change: (next: Breadboard) => void) => {
    if (!value.trim()) { setNotice({ text: 'A label cannot be empty.', error: true }); return; }
    edit(change);
  };

  function download() {
    try {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const text = writeBreadboard(editor ? readModel(editor) : model);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/yaml' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = filename;
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaved(text); setNotice({ text: `Downloaded ${filename}` });
    } catch (error) { setNotice({ text: errorText(error), error: true }); }
  }

  function replaceDocument(text: string, name: string) {
    try {
      const next = withLayout(parseBreadboard(text));
      if (dirty && !window.confirm('Replace this breadboard and discard unsaved changes? Cancel to return and save them first.')) return;
      controller.current?.load(next);
      setSaved(writeBreadboard(next)); setFilename(name); setSelection(null); setPending(null); setNotice(null);
    } catch (error) { setNotice({ text: errorText(error), error: true }); }
  }

  function createNode(kind: BreadboardNode['kind']) {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    const result = addNode(model, kind, { x: Math.round(center.x - 150), y: Math.round(center.y - 70) });
    update(result.model); selectNode(result.id);
  }

  function createConnection(from: string, to: string) {
    const result = connect(model, from, to);
    update(result.model); setPending(null); selectConnection(result.id);
  }

  function deleteSelection() {
    if (!selection) return;
    try {
      if (selection.type === 'connection') {
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopImmediatePropagation(); if (yamlDraft !== null) setNotice({ text: 'Apply YAML edits before saving.', error: true }); else download(); return; }
      if (target?.matches('input, textarea, select') || target?.isContentEditable || yamlDraft !== null) return;
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

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><span className="brand-mark">s</span><span>shaper</span><span className="workspace-divider" /><span className="workspace-kind">Breadboard</span></div>
      <div className="file-tools">
        <button onClick={() => replaceDocument(writeBreadboard({ version: '0.1', title: 'Untitled breadboard', nodes: { home: { kind: 'place', label: 'Home', affordances: {} } } }), 'untitled.breadboard.yaml')}><Icon name="plus" />New</button>
        <button onClick={() => fileInput.current?.click()}><Icon name="open" />Open YAML</button>
        <button onClick={() => setYamlDraft(currentYaml)}><Icon name="code" />YAML</button>
        <button className="primary" onClick={download}><Icon name="save" />Save YAML</button>
      </div>
      <input ref={fileInput} type="file" accept=".yaml,.yml,text/yaml,application/yaml" hidden onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > MAX_YAML_BYTES) { setNotice({ text: 'This file exceeds the 1 MiB limit.', error: true }); return; }
        try { replaceDocument(await file.text(), file.name); }
        catch (error) { setNotice({ text: errorText(error), error: true }); }
      }} />
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
            <span className={`node-symbol ${entry.kind === 'component' ? 'component-symbol' : ''}`} />
            <span><span className="nav-label">{entry.label}</span><small>{Object.keys(entry.affordances).length} affordances</small></span>
          </button>)}
        </div>
        <div className="add-buttons"><button onClick={() => createNode('place')}><Icon name="plus" />Place</button><button onClick={() => createNode('component')}><Icon name="plus" />Component</button></div>
        <div className="navigator-footer"><span>EXAMPLES</span><button onClick={() => replaceDocument(example, 'two-paths.breadboard.yaml')}>Two paths from Home ↗</button><button onClick={() => replaceDocument(componentExample, 'publishing.breadboard.yaml')}>Component interaction ↗</button></div>
      </aside>

      <section className="canvas-region" aria-label="Breadboard canvas">
        {!pending && <div className="canvas-create-tools"><button onClick={() => createNode('place')}><Icon name="plus" />Place</button><button onClick={() => createNode('component')}><Icon name="plus" />Component</button></div>}
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
          </> : node && selection?.type === 'node' ? <>
            <div className="section-eyebrow">{row ? 'AFFORDANCE' : node.kind.toUpperCase()}</div><h2>{row ? 'Edit affordance' : 'Edit place or component'}</h2>
            <code className="semantic-id">{selection.id}{selection.row ? `.${selection.row}` : ''}</code>
            {row && selection.row ? <>
              <Field label="Affordance label" value={row.label} onCommit={value => requiredLabel(value, next => { next.nodes[selection.id]!.affordances[selection.row!]!.label = value; })} multiline />
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
              <button className="wide-button" onClick={() => {
                const result = connect(model, `${selection.id}.${selection.row}`, Object.keys(model.nodes)[0]!);
                update(result.model);
              }}><Icon name="plus" />Add connection</button>
              <button className="text-button" onClick={() => setPending(`${selection.id}.${selection.row}`)}>Choose destination on canvas →</button>
              <div className="affordance-order-actions">
                <button disabled={affordanceIds(node)[0] === selection.row} onClick={() => update(moveAffordance(model, selection.id, selection.row!, -1))}><Icon name="up" />Move up</button>
                <button disabled={affordanceIds(node).at(-1) === selection.row} onClick={() => update(moveAffordance(model, selection.id, selection.row!, 1))}><Icon name="down" />Move down</button>
              </div>
              <button className="text-button" onClick={() => selectNode(selection.id)}>← Back to {node.label}</button>
            </> : <>
              <Field label="Place label" value={node.label} onCommit={value => requiredLabel(value, next => { next.nodes[selection.id]!.label = value; })} multiline />
              <label className="field"><span>Node kind</span><select value={node.kind} onChange={event => edit(next => { next.nodes[selection.id]!.kind = event.target.value as BreadboardNode['kind']; })}><option value="place">Place</option><option value="component">Component</option></select></label>
              <div className="section-heading"><h3>Affordances</h3><button className="tiny-button" aria-label="Add affordance" onClick={() => { const result = addAffordance(model, selection.id); update(result.model); selectNode(selection.id, result.id); }}><Icon name="plus" /></button></div>
              {affordanceIds(node).map((id, index, entries) => { const entry = node.affordances[id]!; return <div className="affordance-list-item" key={id}>
                <button className="inspector-row" onClick={() => selectNode(selection.id, id)}><span>{entry.label}</span><small>{entry.kind} ↗</small></button>
                <div className="reorder-controls">
                  <button aria-label={`Move ${entry.label} up`} title="Move up" disabled={index === 0} onClick={() => update(moveAffordance(model, selection.id, id, -1))}><Icon name="up" /></button>
                  <button aria-label={`Move ${entry.label} down`} title="Move down" disabled={index === entries.length - 1} onClick={() => update(moveAffordance(model, selection.id, id, 1))}><Icon name="down" /></button>
                </div>
              </div>; })}
              {!Object.keys(node.affordances).length && <p className="help">What can someone do or read here?</p>}
              <button className="wide-button" onClick={() => { const result = addAffordance(model, selection.id); update(result.model); selectNode(selection.id, result.id); }}><Icon name="plus" />Add affordance</button>
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
            <p className="help">Choose an endpoint to reconnect this path. Moving a place keeps the same endpoints.</p><button className="danger-button" onClick={deleteSelection}>Delete connection</button>
          </> : <div className="inspector-empty"><span className="empty-symbol">↖</span><h2>Give the idea a shape.</h2><p>Select a place, affordance, or connection to edit it.</p><div className="mini-breadboard"><strong>A place</strong><span>An affordance <span>→</span></span></div><p className="help">Keep the words and connections. Leave the visual design open.</p></div>}
        </div>
      </aside>
    </main>
    <footer className="status-bar"><span className="status-file">{filename}</span><span>{Object.keys(model.nodes).length} nodes · {graphConnections.length} connections · {model.scenarios?.length ?? 0} scenarios</span><span className="local-indicator">Local workspace</span></footer>

    {yamlDraft !== null && <div className="modal-backdrop"><section className="yaml-modal" role="dialog" aria-modal="true" aria-labelledby="yaml-title"><div className="modal-heading"><div><span className="section-eyebrow">BREADBOARD FILE</span><h2 id="yaml-title">Read and edit the YAML</h2></div><button aria-label="Close YAML" onClick={() => setYamlDraft(null)}>×</button></div><p className="help">Applying validates the document first. Metadata, scenarios, and layout remain part of the file.</p><textarea aria-label="YAML document" spellCheck={false} value={yamlDraft} onChange={event => setYamlDraft(event.target.value)} />{notice?.error && <div className="yaml-error" role="alert">{notice.text}</div>}<div className="modal-actions"><button onClick={() => setYamlDraft(null)}>Cancel</button><button className="primary" onClick={() => {
      try { const next = withLayout(parseBreadboard(yamlDraft)); controller.current?.update(next); editor?.selectNone(); setYamlDraft(null); setPending(null); setSelection(null); setNotice(null); }
      catch (error) { setNotice({ text: errorText(error), error: true }); }
    }}>Apply YAML</button></div></section></div>}
  </div>;
}
