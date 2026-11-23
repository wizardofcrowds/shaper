import { useEffect, useId, useState } from 'react';
import type { Breadboard } from '../model.ts';

export function ReferenceSelect({ label, value, model, source, placesOnly, onChange }: { label: string; value: string; model: Breadboard; source?: boolean; placesOnly?: boolean; onChange: (ref: string) => void }) {
  const [query, setQuery] = useState('');
  const statusId = useId();
  useEffect(() => setQuery(''), [value, source, placesOnly]);
  const refs = Object.entries(model.nodes).filter(([, node]) => !placesOnly || node.kind === 'place').flatMap(([nodeId, node]) => [...(source ? [] : [{ id: nodeId, label: node.label, affordance: false }]), ...(placesOnly ? [] : Object.entries(node.affordances).map(([id, row]) => ({ id: `${nodeId}.${id}`, label: `${node.label} / ${row.label}`, affordance: true })))]);
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = refs.filter(ref => terms.every(term => `${ref.label} ${ref.id}`.toLocaleLowerCase().includes(term)));
  const groups = [{ label: placesOnly ? 'Places' : 'Places and components', options: matches.filter(ref => !ref.affordance) }, { label: 'Affordances', options: matches.filter(ref => ref.affordance) }].filter(group => group.options.length);
  const current = refs.find(ref => ref.id === value);
  const currentMatches = matches.some(ref => ref.id === value);
  return <div className="field reference-select"><span>{label}</span>
    <div className="reference-filter">
      <input type="search" aria-label={`Filter ${label}`} placeholder="Type to filter by name or ID…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setQuery(''); }
      }} />
      {query && <button type="button" className="tiny-button" aria-label={`Clear ${label} filter`} onClick={() => setQuery('')}>×</button>}
    </div>
    <select size={terms.length ? Math.min(8, Math.max(2, matches.length + groups.length + (currentMatches ? 0 : 1))) : undefined} aria-label={label} aria-describedby={statusId} value={value} disabled={matches.length === 0} onChange={event => { onChange(event.target.value); setQuery(''); }}>
      {!currentMatches && <option value={value}>{current ? `${current.label} (current)` : `${value} (unavailable)`}</option>}
      {groups.map(group => <optgroup label={group.label} key={group.label}>{group.options.map(ref => <option key={ref.id} value={ref.id}>{ref.label}</option>)}</optgroup>)}
    </select>
    <small id={statusId} className="reference-filter-status" role="status">{terms.length > 0 ? (matches.length ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}` : 'No matches. Clear or change the filter.') : `${refs.length} choices`}</small>
  </div>;
}
