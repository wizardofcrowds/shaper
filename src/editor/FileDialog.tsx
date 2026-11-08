import { useEffect, useRef, useState } from 'react';
import { listFolder } from './files.ts';
import type { FolderListing } from './files.ts';

export function FileDialog({ mode, directory, filename, onChoose, onCancel }: {
  mode: 'open' | 'save'; directory?: string | undefined; filename: string;
  onChoose: (path: string) => Promise<void>; onCancel: () => void;
}) {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [folder, setFolder] = useState(directory ?? '');
  const [name, setName] = useState(mode === 'save' ? filename : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const generation = useRef(0);
  async function navigate(path?: string) {
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const next = await listFolder(path);
      if (generation.current !== current) return;
      setListing(next); setFolder(next.path);
    } catch (error) { if (generation.current === current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (generation.current === current) setBusy(false); }
  }
  useEffect(() => { void navigate(directory); return () => { generation.current++; }; }, []);
  useEffect(() => { dialog.current?.focus(); }, []);
  async function choose(selected = name) {
    if (!listing || busy || !selected.trim()) return;
    if (/[\\/\x00-\x1f]/.test(selected) || selected === '.' || selected === '..') { setError('Enter a filename without folder separators.'); return; }
    const finalName = mode === 'save' && !/\.ya?ml$/i.test(selected) ? `${selected}.yaml` : selected;
    setBusy(true); setError('');
    try { await onChoose(`${listing.path}/${finalName}`); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section ref={dialog} tabIndex={-1} className="file-modal" role="dialog" aria-modal="true" aria-labelledby="file-dialog-title" onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation(); onCancel(); }
    if (event.key === 'Tab') {
      const items = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="modal-heading"><h2 id="file-dialog-title">{mode === 'open' ? 'Open breadboard' : 'Save breadboard as'}</h2><button aria-label="Close file dialog" disabled={busy} onClick={onCancel}>×</button></div>
    <p className="help">{mode === 'open' ? 'Choose a YAML breadboard on this computer.' : 'Choose a folder and filename on this computer.'}</p>
    <div className="folder-shortcuts"><button disabled={!listing || busy} onClick={() => void navigate(listing!.parent)}>↑ Up</button><button disabled={!listing || busy} onClick={() => void navigate(listing!.home)}>Home</button><button disabled={!listing || busy} onClick={() => void navigate(listing!.project)}>Shaper</button></div>
    <div className="folder-path"><label className="field"><span>Folder</span><input aria-label="Folder" value={folder} disabled={busy} onChange={event => setFolder(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void navigate(folder); } }} /></label><button disabled={busy || !folder} onClick={() => void navigate(folder)}>Go</button></div>
    <div className="file-list" aria-label="Files and folders" aria-busy={busy}>
      {listing?.entries.map(entry => <button key={entry.name} disabled={busy} className={!entry.directory && name === entry.name ? 'selected' : ''}
        onClick={() => entry.directory ? void navigate(`${listing.path}/${entry.name}`) : setName(entry.name)}
        onDoubleClick={() => { if (!entry.directory && mode === 'open') void choose(entry.name); }}>
        <span aria-hidden="true">{entry.directory ? '▸' : '◇'}</span><span>{entry.name}</span>{entry.directory && <small>Folder</small>}
      </button>)}
      {listing && !listing.entries.length && <p className="help">No folders or YAML files here.</p>}
      {!listing && busy && <p className="help">Loading folders…</p>}
    </div>
    <form onSubmit={event => { event.preventDefault(); void choose(); }}>
      <label className="field"><span>File name</span><input aria-label="File name" value={name} disabled={busy} onChange={event => setName(event.target.value)} autoComplete="off" /></label>
      {error && <p className="file-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="primary" disabled={busy || !listing || !name.trim()}>{busy ? 'Working…' : mode === 'open' ? 'Open' : 'Save'}</button></div>
    </form>
  </section></div>;
}
