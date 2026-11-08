import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { MAX_YAML_BYTES, parseBreadboard } from '../src/index.ts';

export interface FileTarget { path: string; name: string; revision: string | null }
export interface FolderListing { path: string; parent: string; home: string; project: string; entries: { name: string; directory: boolean }[] }
export class FileError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

/** Only YAML files are exposed, and symbolic file links are never overwritten. */
export function createFileStore(project: string) {
  let writes: Promise<unknown> = Promise.resolve();
  async function filePath(input: string) {
    if (!/\.ya?ml$/i.test(input)) throw new FileError('Choose a .yaml or .yml file.');
    const path = resolve(input.startsWith('~/') ? join(homedir(), input.slice(2)) : input);
    return join(await realpath(dirname(path)), basename(path));
  }
  async function snapshot(path: string): Promise<{ data: Buffer; mode: number } | null> {
    let file;
    try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) { if (missing(error)) return null; throw error; }
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw new FileError('Choose a regular YAML file.');
      if (stat.size > MAX_YAML_BYTES) throw new FileError('This file exceeds the 1 MiB limit.');
      const data = await file.readFile();
      if (data.length > MAX_YAML_BYTES) throw new FileError('This file exceeds the 1 MiB limit.');
      return { data, mode: stat.mode & 0o777 };
    } finally { await file.close(); }
  }
  async function inspect(input: string): Promise<FileTarget> {
    const path = await filePath(input), current = await snapshot(path);
    return { path, name: basename(path), revision: current ? digest(current.data) : null };
  }
  return {
    async list(input = project): Promise<FolderListing> {
      const path = await realpath(resolve(input.startsWith('~/') ? join(homedir(), input.slice(2)) : input));
      const entries = (await readdir(path, { withFileTypes: true }))
        .filter(entry => !entry.name.startsWith('.') && (entry.isDirectory() || (entry.isFile() && /\.ya?ml$/i.test(entry.name))))
        .map(entry => ({ name: entry.name, directory: entry.isDirectory() }))
        .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
      return { path, parent: dirname(path), home: homedir(), project, entries };
    },
    inspect,
    async read(input: string) {
      const path = await filePath(input), current = await snapshot(path);
      if (!current) throw new FileError('This file no longer exists.', 404);
      const text = current.data.toString('utf8');
      parseBreadboard(text);
      return { path, name: basename(path), revision: digest(current.data), text };
    },
    save(input: string, text: string, revision: string | null): Promise<FileTarget> {
      const run = async () => {
        parseBreadboard(text); // Refuse invalid data before touching a file.
        const path = await filePath(input), current = await snapshot(path);
        if ((current ? digest(current.data) : null) !== revision) {
          throw new FileError('The file changed on disk. Open it again to review the changes, or use Save As to keep your version.', 409);
        }
        const temp = join(dirname(path), `.shaper-${randomUUID()}.tmp`);
        const file = await open(temp, 'wx', current?.mode ?? 0o600);
        try {
          try { await file.writeFile(text, 'utf8'); await file.sync(); }
          finally { await file.close(); }
          if (current) {
            const latest = await snapshot(path);
            if (!latest || digest(latest.data) !== revision) throw new FileError('The file changed while saving. Use Save As to keep your version.', 409);
            await rename(temp, path);
          } else {
            // Linking exclusively prevents a newly-created file from being overwritten.
            await link(temp, path);
          }
        } finally { await unlink(temp).catch(() => {}); }
        return { path, name: basename(path), revision: digest(Buffer.from(text)) };
      };
      const result = writes.then(run);
      writes = result.catch(() => {});
      return result;
    },
  };
}
