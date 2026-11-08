import type { FileTarget, FolderListing } from '../../server/files.ts';
export type { FileTarget, FolderListing };

async function request<T>(operation: string, data: object): Promise<T> {
  const session = await fetch('/__shaper/session', { cache: 'no-store' });
  if (!session.ok || !session.headers.get('content-type')?.includes('application/json')) throw new Error('Start Shaper with ./dev to open and save local files.');
  const { token } = await session.json() as { token: string };
  const response = await fetch(`/__shaper/${operation}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shaper-Token': token }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'File operation failed.');
  return result as T;
}
export const listFolder = (path?: string) => request<FolderListing>('list', path ? { path } : {});
export const inspectFile = (path: string) => request<FileTarget>('inspect', { path });
export const readLocalFile = (path: string) => request<FileTarget & { text: string }>('read', { path });
export const saveLocalFile = (path: string, text: string, revision: string | null) => request<FileTarget>('save', { path, text, revision });
