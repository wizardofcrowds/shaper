import { createContext, useContext, useId, useState } from 'react';
import type { Annotations, JsonValue, Metadata } from '../model.ts';
import { validateTag } from '../tags.ts';
import { Field } from './Field.tsx';

export const MetadataVisibility = createContext({ open: false, setOpen: (_open: boolean) => {} });
function MetadataValue({ value }: { value: JsonValue }) {
  if (Array.isArray(value)) {
    if (value.every(item => item === null || typeof item !== 'object')) return <span>{value.map(item => item === null ? 'null' : String(item)).join(', ')}</span>;
    return <ol>{value.map((item, index) => <li key={index}><MetadataValue value={item} /></li>)}</ol>;
  }
  if (value !== null && typeof value === 'object') return <dl>{Object.entries(value).map(([key, child]) => <div key={key}><dt>{key}</dt><dd><MetadataValue value={child} /></dd></div>)}</dl>;
  return <span>{value === null ? 'null' : String(value)}</span>;
}
export function MetadataView({ metadata }: { metadata?: Metadata | undefined }) {
  const { open, setOpen } = useContext(MetadataVisibility);
  const id = useId();
  if (!metadata || !Object.keys(metadata).length) return null;
  return <section className="metadata-view">
    <button type="button" className="metadata-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Metadata <small>Read only</small></button>
    {open && <div className="metadata-values" id={id} aria-label="Metadata values"><MetadataValue value={metadata} /></div>}
  </section>;
}
export function NotesField({ value, onChange }: { value?: string | undefined; onChange: (value: string) => void }) {
  return <Field label="Notes" placeholder="Add a note…" value={value ?? ''} onCommit={onChange} multiline />;
}
export function TagInput({ tags = [], suggestions, onChange }: { tags?: string[] | undefined; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const add = () => {
    try {
      const tag = validateTag(draft);
      if (tags.includes(tag)) throw new Error('This tag is already on the element.');
      onChange([...tags, tag]); setDraft(''); setError(null);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  };
  return <div className="tag-editor"><span>Tags</span>
    <div className="tag-input-chips">{tags.map(tag => <span className="tag-chip" key={tag}>{tag}<button type="button" aria-label={`Remove tag ${tag}`} onClick={() => { onChange(tags.filter(value => value !== tag)); setError(null); }}>×</button></span>)}</div>
    <div className="tag-entry"><input aria-label="Add tag" placeholder="Type a tag and press Enter" list={listId} value={draft} onChange={event => { setDraft(event.target.value); setError(null); }} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (draft.trim()) add(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(''); setError(null); }
    }} /><button type="button" disabled={!draft.trim()} onClick={add}>Add</button></div>
    <datalist id={listId}>{suggestions.filter(tag => !tags.includes(tag)).map(tag => <option key={tag} value={tag} />)}</datalist>
    {error && <p className="attribute-error" role="alert">{error}</p>}
  </div>;
}
export function AnnotationFields({ element, suggestions, onChange }: { element: Annotations & { metadata?: Metadata }; suggestions: string[]; onChange: (change: (element: Annotations) => void) => void }) {
  return <section className="annotation-fields">
    <TagInput tags={element.tags} suggestions={suggestions} onChange={tags => onChange(next => { if (tags.length) next.tags = tags; else delete next.tags; })} />
    <NotesField value={element.notes} onChange={notes => onChange(next => { if (notes.trim()) next.notes = notes; else delete next.notes; })} />
    <MetadataView metadata={element.metadata} />
  </section>;
}
