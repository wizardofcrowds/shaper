import { useState, useRef, useEffect } from 'react';

export function Field({ label, value, onCommit, multiline = false, placeholder }: { label: string; value: string; onCommit: (value: string) => void; multiline?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  const props = { 'aria-label': label, placeholder, value: draft, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: () => { if (cancelled.current) { cancelled.current = false; return; } if (draft !== value) onCommit(draft); }, onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (event.key === 'Enter' && !multiline) event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setDraft(value); event.currentTarget.blur(); } } };
  return <label className="field"><span>{label}</span>{multiline ? <textarea rows={2} {...props} /> : <input {...props} />}</label>;
}
