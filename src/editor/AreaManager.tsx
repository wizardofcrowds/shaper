import { useState } from 'react';
import type { Breadboard } from '../model.ts';
import { addArea, renameArea, deleteArea } from './areas.ts';
import { Field } from './Field.tsx';

export function AreaManager({ model, onChange, onClose }: { model: Breadboard; onChange: (model: Breadboard) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = (operation: () => Breadboard) => {
    try { onChange(operation()); setError(null); return true; }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); return false; }
  };
  return <div className="modal-backdrop" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <section className="area-manager" role="dialog" aria-modal="true" aria-labelledby="area-manager-title">
      <div className="modal-heading"><div><span className="section-eyebrow">ORGANIZE THE BREADBOARD</span><h2 id="area-manager-title">Manage areas</h2></div><button aria-label="Close areas" onClick={onClose}>×</button></div>
      <p className="help">Define shared area names, then assign places and components in their inspector. Renaming an area updates its name everywhere.</p>
      <form onSubmit={event => { event.preventDefault(); if (apply(() => addArea(model, name).model)) setName(''); }}>
        <label className="field"><span>New area name</span><input autoFocus aria-label="New area name" placeholder="e.g. Create an Order" value={name} onChange={event => setName(event.target.value)} /></label>
        <button type="submit" disabled={!name.trim()}>Add area</button>
      </form>
      {error && <p className="attribute-error" role="alert">{error}</p>}
      <div className="area-definitions">{Object.entries(model.areas ?? {}).map(([id, area]) => <section className="area-definition" key={id} data-area-id={id}>
        <Field label="Area name" value={area.label} onCommit={label => { apply(() => renameArea(model, id, label)); }} />
        <small>{Object.values(model.nodes).filter(node => node.area === id).length} residents</small>
        <button className="danger-button" aria-label={`Delete area ${area.label}`} onClick={() => apply(() => deleteArea(model, id))}>Delete area</button>
      </section>)}</div>
      <p className="help">Deleting an area leaves its residents and connections intact and marks them Unassigned. Undo restores the area and assignments.</p>
      <div className="modal-actions"><button onClick={onClose}>Done</button></div>
    </section>
  </div>;
}
