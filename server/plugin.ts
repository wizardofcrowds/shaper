import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { createFileStore, FileError } from './files.ts';

export function allowedRequest(request: IncomingMessage, token: string): boolean {
  const remote = request.socket.remoteAddress;
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') return false;
  const host = request.headers.host ?? '';
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return false;
  const site = request.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  if (request.headers.origin && request.headers.origin !== `http://${host}`) return false;
  return request.method === 'GET' || request.headers['x-shaper-token'] === token;
}

export function localFilesPlugin(): Plugin {
  const token = randomBytes(32).toString('hex');
  const files = createFileStore(process.cwd());
  function middleware(request: IncomingMessage, response: ServerResponse, next: () => void) {
    const route = request.url?.split('?')[0];
    if (!route?.startsWith('/__shaper/')) { next(); return; }
    const reply = (status: number, data: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(data));
    };
    if (!allowedRequest(request, token)) { reply(403, { error: 'Local file access is restricted to this Shaper window. Reload the app and try again.' }); return; }
    if (route === '/__shaper/session' && request.method === 'GET') { reply(200, { token }); return; }
    if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') { reply(405, { error: 'Expected a JSON request.' }); return; }
    void (async () => {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 7 * 1024 * 1024) throw new FileError('This request is too large.', 413);
        chunks.push(Buffer.from(chunk));
      }
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!input || typeof input !== 'object') throw new FileError('Invalid file request.');
      const data = input as Record<string, unknown>;
      const path = data.path;
      if (path !== undefined && typeof path !== 'string') throw new FileError('Invalid file path.');
      if (route === '/__shaper/list') return files.list(path);
      if (typeof path !== 'string' || !path) throw new FileError('Choose a file.');
      if (route === '/__shaper/read') return files.read(path);
      if (route === '/__shaper/inspect') return files.inspect(path);
      if (route === '/__shaper/save' && typeof data.text === 'string' && (data.revision === null || typeof data.revision === 'string')) return files.save(path, data.text, data.revision);
      throw new FileError('Unknown file operation.');
    })().then(result => reply(200, result), error => reply(error instanceof FileError ? error.status : 400, { error: error instanceof Error ? error.message : 'File operation failed.' }));
  }
  return {
    name: 'shaper-local-files',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
