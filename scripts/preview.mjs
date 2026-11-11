import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const raiz = path.resolve(process.cwd(), 'dist');
const porta = Number(process.env.ATLAS_PREVIEW_PORT || 4173);
const tipos = {
  '.css': 'text/css; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relativo = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const arquivo = path.resolve(raiz, relativo);
    if (!arquivo.startsWith(raiz)) throw new Error('Caminho inválido');
    const info = await stat(arquivo);
    if (!info.isFile()) throw new Error('Não encontrado');
    res.writeHead(200, {
      'Content-Type': tipos[path.extname(arquivo)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(arquivo).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
  }
}).listen(porta, '127.0.0.1', () => {
  console.log(`Atlas disponível em http://127.0.0.1:${porta}`);
});
