import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const raiz = path.resolve(process.cwd());
const origem = path.join(raiz, 'atlas_assentamentos_base');
const destinoDados = path.join(raiz, 'dist', 'dados');
const destinoGeo = path.join(raiz, 'dist', 'geojson');

const URL_LIMITE =
  'https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4200101?formato=application%2Fvnd.geo%2Bjson&qualidade=maxima';
const URL_ASSENTAMENTOS =
  'https://pamgia.ibama.gov.br/server/rest/services/01_Publicacoes_Bases/assentamentos_incra/MapServer/1/query';

const normalizar = (valor = '') =>
  String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^pa\s+/, '')
    .replace(/\bd[oa]\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const slug = (valor) => normalizar(valor).replace(/\s+/g, '-');

async function obter(url, opcoes = {}) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      const resposta = await fetch(url, {
        ...opcoes,
        headers: {
          'User-Agent': 'AtlasEscolarAbelardoLuz/1.0',
          ...(opcoes.headers || {}),
        },
      });
      if (!resposta.ok) {
        throw new Error(`${resposta.status} ${resposta.statusText}`);
      }
      return resposta;
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < 3) {
        await new Promise((resolve) => setTimeout(resolve, tentativa * 800));
      }
    }
  }
  throw ultimoErro;
}

function comoColecao(payload) {
  if (payload.type === 'FeatureCollection') return payload;
  if (payload.type === 'Feature') {
    return { type: 'FeatureCollection', features: [payload] };
  }
  if (payload.type === 'Polygon' || payload.type === 'MultiPolygon') {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: payload }],
    };
  }
  throw new Error(`GeoJSON inesperado: ${payload.type || 'sem tipo'}`);
}

function paraRings(geometria) {
  if (geometria.type === 'Polygon') return geometria.coordinates;
  if (geometria.type === 'MultiPolygon') return geometria.coordinates.flat();
  throw new Error(`Geometria municipal incompatível: ${geometria.type}`);
}

function numeroBR(valor) {
  if (typeof valor === 'number') return valor;
  if (valor === null || valor === undefined || valor === '') return null;
  const texto = String(valor).trim();
  const convertido = texto.includes(',')
    ? Number(texto.replace(/\./g, '').replace(',', '.'))
    : Number(texto);
  return Number.isFinite(convertido) ? convertido : null;
}

await fs.mkdir(destinoDados, { recursive: true });
await fs.mkdir(destinoGeo, { recursive: true });

console.log('Baixando o limite municipal do IBGE...');
const limitePayload = await (await obter(URL_LIMITE)).json();
const limite = comoColecao(limitePayload);
const geometriaMunicipal = limite.features[0]?.geometry;
if (!geometriaMunicipal) throw new Error('O IBGE não retornou a geometria municipal.');

limite.features = limite.features.map((feature) => ({
  ...feature,
  properties: {
    ...(feature.properties || {}),
    nome: 'Abelardo Luz',
    codigo_ibge: '4200101',
    origem_dados: 'IBGE',
  },
}));

console.log('Consultando os assentamentos que cruzam o município...');
const parametros = new URLSearchParams({
  where: '1=1',
  outFields: '*',
  returnGeometry: 'true',
  outSR: '4326',
  geometryType: 'esriGeometryPolygon',
  inSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  geometry: JSON.stringify({
    rings: paraRings(geometriaMunicipal),
    spatialReference: { wkid: 4326 },
  }),
  resultRecordCount: '2000',
  f: 'geojson',
});

const assentamentosPayload = await (
  await obter(URL_ASSENTAMENTOS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: parametros,
  })
).json();

if (assentamentosPayload.error) {
  throw new Error(`Serviço GIS: ${JSON.stringify(assentamentosPayload.error)}`);
}

const assentamentosGeo = comoColecao(assentamentosPayload);
assentamentosGeo.features = assentamentosGeo.features.map((feature) => {
  const propriedades = feature.properties || {};
  const nome = propriedades.nome_proje || propriedades.assentamento || propriedades.cd_sipra;
  return {
    ...feature,
    properties: {
      ...propriedades,
      identificador_atlas: slug(nome),
      origem_dados: 'INCRA / serviço cartográfico do IBAMA',
    },
  };
});

const catalogo = JSON.parse(
  await fs.readFile(path.join(origem, 'dados', 'assentamentos_catalogo.json'), 'utf8'),
);
const localidades = JSON.parse(
  await fs.readFile(
    path.join(origem, 'dados', 'localidades_questionario_anonimizadas.json'),
    'utf8',
  ),
);
const metadados = JSON.parse(
  await fs.readFile(path.join(origem, 'dados', 'metadados_fontes.json'), 'utf8'),
);

const chavesCatalogo = new Set(catalogo.map((item) => normalizar(item.nome)));
const geometriasForaDoCatalogo = assentamentosGeo.features.filter((feature) => {
  const propriedades = feature.properties || {};
  const nomes = [propriedades.nome_proje, propriedades.assentamento]
    .filter(Boolean)
    .map(normalizar);
  return !nomes.some((nome) => chavesCatalogo.has(nome));
});
assentamentosGeo.features = assentamentosGeo.features.filter(
  (feature) => !geometriasForaDoCatalogo.includes(feature),
);

const porNome = new Map();
for (const feature of assentamentosGeo.features) {
  const propriedades = feature.properties || {};
  for (const nome of [propriedades.nome_proje, propriedades.assentamento]) {
    if (nome) porNome.set(normalizar(nome), propriedades);
  }
}

const catalogoEnriquecido = catalogo.map((item) => {
  const oficial = porNome.get(normalizar(item.nome));
  return {
    ...item,
    codigo_sipra: oficial?.cd_sipra || null,
    municipio_sede: oficial?.municipio || item.municipio,
    uf_sede: oficial?.uf || item.uf,
    area_hectares: numeroBR(oficial?.area_hecta) ?? item.area_hectares,
    capacidade_familias: oficial?.capacidade ?? null,
    familias_assentadas: oficial?.num_famili ?? item.familias_assentadas,
    data_criacao: oficial?.data_de_cr || null,
    fase: oficial?.fase ?? null,
    geometria_disponivel: Boolean(oficial),
  };
});

await Promise.all([
  fs.writeFile(
    path.join(destinoGeo, 'abelardo-luz.geojson'),
    JSON.stringify(limite),
    'utf8',
  ),
  fs.writeFile(
    path.join(destinoGeo, 'assentamentos.geojson'),
    JSON.stringify(assentamentosGeo),
    'utf8',
  ),
  fs.writeFile(
    path.join(destinoDados, 'assentamentos.json'),
    JSON.stringify(catalogoEnriquecido, null, 2),
    'utf8',
  ),
  fs.writeFile(
    path.join(destinoDados, 'localidades.json'),
    JSON.stringify(localidades, null, 2),
    'utf8',
  ),
  fs.writeFile(
    path.join(destinoDados, 'metadados.json'),
    JSON.stringify(metadados, null, 2),
    'utf8',
  ),
]);

const encontrados = catalogoEnriquecido.filter((item) => item.geometria_disponivel).length;

console.log(`Polígonos que cruzam Abelardo Luz: ${assentamentosGeo.features.length}`);
console.log(`Itens do catálogo associados à geometria: ${encontrados}/${catalogo.length}`);
if (geometriasForaDoCatalogo.length) {
  console.log(
    `Geometrias oficiais fora do escopo escolar: ${geometriasForaDoCatalogo
      .map((feature) => feature.properties?.nome_proje || feature.properties?.assentamento)
      .join(', ')}`,
  );
}
