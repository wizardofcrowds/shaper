import { useState } from 'react';
import type { Association, Breadboard, Cardinality } from '../model.ts';
import { Field } from './Field.tsx';
import { addAssociation, addAttribute, renameAttribute, deleteAttribute, addData, dataElements, deleteData, editAssociation } from './data.ts';

function DataOptions({ model, source }: { model: Breadboard; source: string }) {
  const nodeId = source.split('.')[0];
  const elements = dataElements(model);
  return <>{[true, false].map(internal => {
    const group = elements.filter(element => (element.nodeId === nodeId) === internal);
    return group.length ? <optgroup key={String(internal)} label={internal ? 'Same component' : 'Other components'}>
      {group.map(element => <option key={element.id} value={element.id}>{element.label}</option>)}
    </optgroup> : null;
  })}</>;
}

export function AssociationFields({ model, id, onChange }: { model: Breadboard; id: string; onChange: (model: Breadboard) => void }) {
  const association = model.associations![id]!;
  const elements = dataElements(model);
  const change = (edit: (entry: Association) => void) => onChange(editAssociation(model, id, edit));
  return <>
    {(['from', 'to'] as const).map(end => <label className="field" key={end}><span>{end === 'from' ? 'Source data element' : 'Related data element'}</span>
      <select aria-label={end === 'from' ? 'Source data element' : 'Related data element'} value={association[end]} onChange={event => change(entry => { entry[end] = event.target.value; })}>
        {!elements.some(element => element.id === association[end]) && <option value={association[end]}>{association[end]} (missing)</option>}
        <DataOptions model={model} source={association.from} />
      </select>
    </label>)}
    <Field label="Association label" placeholder="e.g. contains purchased explorations" value={association.label ?? ''} onCommit={label => change(entry => { if (label) entry.label = label; else delete entry.label; })} />
    {(['from_cardinality', 'to_cardinality'] as const).map((end, index) => <label className="field" key={end}><span>{index === 0 ? 'Source cardinality' : 'Related cardinality'}</span>
      <select aria-label={index === 0 ? 'Source cardinality' : 'Related cardinality'} value={association[end] ?? ''} onChange={event => change(entry => { if (event.target.value) entry[end] = event.target.value as Cardinality; else delete entry[end]; })}>
        <option value="">Unspecified</option><option value="1">One (1)</option><option value="0..1">Zero or one (0..1)</option><option value="0..*">Many (0..*)</option><option value="1..*">One or more (1..*)</option>
      </select>
    </label>)}
    <p className="help">Cardinalities describe each end: Order (1) — LineItem (many) means one order has many line items.</p>
  </>;
}

function DataAttributes({ model, nodeId, dataId, onChange }: { model: Breadboard; nodeId: string; dataId: string; onChange: (model: Breadboard) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const attributes = model.nodes[nodeId]!.data![dataId]!.attributes ?? [];
  const apply = (operation: () => Breadboard) => {
    try { onChange(operation()); setError(null); return true; }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); return false; }
  };
  return <section className="attribute-editor">
    <div className="attribute-heading"><h4>Attributes</h4><button className="tiny-button" aria-label="Add attribute" onClick={() => { setAdding(true); setError(null); }}>+</button></div>
    {attributes.map((attribute, index) => <div className="attribute-item" key={index}>
      <Field label={`Attribute ${index + 1}`} value={attribute} onCommit={name => { apply(() => renameAttribute(model, nodeId, dataId, index, name)); }} />
      <button className="tiny-button" aria-label={`Remove attribute ${attribute}`} title="Remove attribute" onClick={() => apply(() => deleteAttribute(model, nodeId, dataId, index))}>×</button>
    </div>)}
    {adding && <form onSubmit={event => {
      event.preventDefault();
      if (apply(() => addAttribute(model, nodeId, dataId, name))) { setName(''); setAdding(false); }
    }}>
      <label className="field"><span>New attribute</span><input autoFocus aria-label="New attribute" placeholder="e.g. order_id" value={name} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" disabled={!name.trim()}>Add attribute</button><button className="text-button" type="button" onClick={() => { setAdding(false); setName(''); setError(null); }}>Cancel</button>
    </form>}
    {error && <p className="attribute-error" role="alert">{error}</p>}
    {!attributes.length && !adding && <p className="help">No attributes yet.</p>}
  </section>;
}

export function DataPanel({ model, nodeId, onChange, onSelectAssociation }: { model: Breadboard; nodeId: string; onChange: (model: Breadboard) => void; onSelectAssociation: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const node = model.nodes[nodeId]!;
  const elements = dataElements(model);
  return <section className="data-panel">
    <div className="section-heading"><h3>Data elements</h3><button className="tiny-button" aria-label="Add data element" onClick={() => setAdding(true)}>+</button></div>
    <p className="help">Add multiple domain concepts here, such as Order and LineItem. Associate them within this component or with data in another component.</p>
    {adding && <form onSubmit={event => {
      event.preventDefault(); if (!name.trim()) return;
      const result = addData(model, nodeId); result.model.nodes[nodeId]!.data![result.id]!.label = name.trim();
      onChange(result.model); setName(''); setAdding(false);
    }}><label className="field"><span>New data element</span><input autoFocus placeholder="e.g. Order" value={name} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" disabled={!name.trim()}>Add data element</button><button className="text-button" type="button" onClick={() => setAdding(false)}>Cancel</button>
    </form>}
    {Object.keys(node.data ?? {}).sort().map(id => {
      const entry = node.data![id]!, ref = `${nodeId}.${id}`;
      return <section className="data-card" id={`data-element-${ref}`} key={id}>
        <span className="section-eyebrow">DATA</span><code className="semantic-id">{ref}</code>
        <Field label="Data element name" value={entry.label} onCommit={label => { if (!label.trim()) return; const next = structuredClone(model); next.nodes[nodeId]!.data![id]!.label = label; onChange(next); }} />
        <DataAttributes model={model} nodeId={nodeId} dataId={id} onChange={onChange} />
        {Object.entries(model.associations ?? {}).filter(([, association]) => association.from === ref || association.to === ref).map(([key, association]) => <button className="inspector-row" key={key} onClick={() => onSelectAssociation(key)}>
          <span>{association.label || 'Association'} · {elements.find(element => element.id === (association.from === ref ? association.to : association.from))?.label ?? '(missing data element)'}</span><small>{association.from_cardinality ?? '?'} — {association.to_cardinality ?? '?'}</small>
        </button>)}
        <button className="text-button secondary-action" onClick={() => { setSource(ref); setTarget(''); }}>+ Add association</button>
        {source === ref && <form onSubmit={event => {
          event.preventDefault(); if (!target) return;
          const result = addAssociation(model, ref, target); onChange(result.model); setSource(null); onSelectAssociation(result.id);
        }}><label className="field"><span>Related data element</span><select aria-label="Related data element" value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose data element…</option><DataOptions model={model} source={ref} /></select></label>
          <button disabled={!target} type="submit">Create association</button><button type="button" className="text-button" onClick={() => setSource(null)}>Cancel</button>
        </form>}
        <button className="danger-button" onClick={() => onChange(deleteData(model, nodeId, id))}>Delete data element</button>
      </section>;
    })}
    {!Object.keys(node.data ?? {}).length && <p className="help">No data elements. Components can expose behavior without holding data.</p>}
  </section>;
}
