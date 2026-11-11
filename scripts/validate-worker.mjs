import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
const workerPath = join(root, 'dist', 'server', 'index.js');
const manifestPath = join(root, 'dist', '.openai', 'hosting.json');

const [workerSource, manifestSource] = await Promise.all([
  readFile(workerPath, 'utf8'),
  readFile(manifestPath, 'utf8'),
]);
const manifest = JSON.parse(manifestSource);

if (manifest.project_id !== 'appgprj_6af4c5f849ac81919bd83d073c51dd23') {
  throw new Error('Manifesto sem o project_id esperado.');
}
if ('static' in manifest) {
  throw new Error('Manifesto ainda está configurado como site estático.');
}
if (/AIza[0-9A-Za-z_-]{20,}/.test(workerSource)) {
  throw new Error('Uma possível chave de API foi encontrada no pacote.');
}
if (workerSource.includes('google.maps.importLibrary')) {
  throw new Error('O carregador ainda depende de importLibrary, que não está disponível em todos os navegadores atendidos.');
}

const moduleUrl = `${pathToFileURL(workerPath).href}?validate=${Date.now()}`;
const worker = (await import(moduleUrl)).default;
if (!worker || typeof worker.fetch !== 'function') {
  throw new Error('Worker sem handler fetch válido.');
}

const fakeKey = 'test-key-not-a-real-credential';
const configResponse = await worker.fetch(
  new Request('https://atlas.local/config'),
  { GOOGLE_MAPS_API_KEY: fakeKey },
);
const config = await configResponse.json();
if (configResponse.status !== 200 || config.googleMapsApiKey !== fakeKey) {
  throw new Error('A rota /config não está lendo a variável de ambiente.');
}
if (configResponse.headers.get('cache-control') !== 'no-store, max-age=0') {
  throw new Error('A rota /config precisa impedir cache.');
}

const pageResponse = await worker.fetch(new Request('https://atlas.local/'), {});
const page = await pageResponse.text();
if (pageResponse.status !== 200 || !page.includes('Atlas Territorial de Abelardo Luz')) {
  throw new Error('A página principal não foi empacotada corretamente.');
}
if (!page.includes('google-app.js') || page.toLowerCase().includes('leaflet')) {
  throw new Error('A página ainda não aponta exclusivamente para a integração Google Maps.');
}

for (const path of [
  '/styles.css',
  '/google-app.js',
  '/dados/assentamentos.json',
  '/geojson/abelardo-luz.geojson',
  '/geojson/assentamentos.geojson',
]) {
  const response = await worker.fetch(new Request(`https://atlas.local${path}`), {});
  if (response.status !== 200) throw new Error(`Rota ausente no pacote: ${path}`);
}

console.log('Worker validado: mapa, dados, configuração e manifesto estão consistentes.');
