import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(raiz, 'web');
const destino = join(raiz, 'dist-pages');
const chave = process.env.GOOGLE_MAPS_API_KEY?.trim();

if (!chave) {
  throw new Error('Defina GOOGLE_MAPS_API_KEY para gerar a versão do GitHub Pages.');
}
if (dirname(destino) !== raiz || destino === raiz) {
  throw new Error('Diretório de saída do GitHub Pages inválido.');
}

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });
await cp(origem, destino, { recursive: true });
await writeFile(
  join(destino, 'config.json'),
  JSON.stringify({ googleMapsApiKey: chave }),
  'utf8',
);

const html = await readFile(join(destino, 'index.html'), 'utf8');
if (!html.includes('Atlas Territorial de Abelardo Luz')) {
  throw new Error('A página principal não foi copiada corretamente.');
}

console.log(`GitHub Pages preparado em ${destino}`);
