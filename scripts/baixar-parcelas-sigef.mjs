#!/usr/bin/env node
/**
 * Portabilidade Node do importador fornecido em
 * imports/lotes-sigef-abelardo/pacote_lotes_atlas_abelardo/scripts/baixar_parcelas_sigef.py.
 * Usa exclusivamente os dois endpoints oficiais declarados no pacote.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const saida = join(raiz, 'web', 'geojson');
const limitePath = join(saida, 'abelardo-luz.geojson');
const assentamentosPath = join(saida, 'assentamentos.geojson');

const SERVICOS = {
  publico: 'https://pamgia.ibama.gov.br/server/rest/services/BasesSincronizadas/lim_sigef_publico_incra_p/FeatureServer/0/query',
  privado: 'https://pamgia.ibama.gov.br/server/rest/services/01_Publicacoes_Bases/lim_imovel_sigef_privado_a/FeatureServer/9/query',
};
const CODIGO_IBGE = 4200101;
const BBOX = [-52.65, -26.85, -51.95, -26.25];
const CAMPOS = 'objectid,parcela_co,codigo_imo,situacao_i,status,municipio_,uf_id';

const pausa = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function consultar(url, parametros, maxTentativas = 3) {
  const fullUrl = `${url}?${new URLSearchParams(parametros)}`;
  let ultimoErro;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
    try {
      const resposta = await fetch(fullUrl, {
        headers: { 'User-Agent': 'AtlasEscolarAbelardoLuz/1.0 (consulta-publica)' },
        signal: AbortSignal.timeout(90_000),
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const dados = await resposta.json();
      if (dados.error) throw new Error(`Erro ArcGIS: ${JSON.stringify(dados.error)}`);
      return dados;
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < maxTentativas) await pausa(2_000 * tentativa);
    }
  }
  throw new Error(`Consulta falhou em ${url}: ${ultimoErro?.message || ultimoErro}`);
}

function bboxGeometria(geometria) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  function visitar(valor) {
    if (!Array.isArray(valor)) return;
    if (typeof valor[0] === 'number' && typeof valor[1] === 'number') {
      bbox[0] = Math.min(bbox[0], valor[0]);
      bbox[1] = Math.min(bbox[1], valor[1]);
      bbox[2] = Math.max(bbox[2], valor[0]);
      bbox[3] = Math.max(bbox[3], valor[1]);
      return;
    }
    valor.forEach(visitar);
  }
  visitar(geometria.coordinates);
  return bbox;
}

function bboxesIntersectam(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function pontoNoAnel([x, y], anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i, i += 1) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    const cruza = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function pontoNoPoligono(ponto, aneis) {
  if (!aneis.length || !pontoNoAnel(ponto, aneis[0])) return false;
  return !aneis.slice(1).some((anel) => pontoNoAnel(ponto, anel));
}

function poligonos(geometria) {
  if (geometria.type === 'Polygon') return [geometria.coordinates];
  if (geometria.type === 'MultiPolygon') return geometria.coordinates;
  return [];
}

function orientacao(a, b, c) {
  const valor = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(valor) < 1e-12) return 0;
  return valor > 0 ? 1 : 2;
}

function noSegmento(a, b, c) {
  return b[0] <= Math.max(a[0], c[0]) + 1e-12 && b[0] >= Math.min(a[0], c[0]) - 1e-12 &&
    b[1] <= Math.max(a[1], c[1]) + 1e-12 && b[1] >= Math.min(a[1], c[1]) - 1e-12;
}

function segmentosIntersectam(p1, q1, p2, q2) {
  const o1 = orientacao(p1, q1, p2);
  const o2 = orientacao(p1, q1, q2);
  const o3 = orientacao(p2, q2, p1);
  const o4 = orientacao(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && noSegmento(p1, p2, q1)) ||
    (o2 === 0 && noSegmento(p1, q2, q1)) ||
    (o3 === 0 && noSegmento(p2, p1, q2)) ||
    (o4 === 0 && noSegmento(p2, q1, q2));
}

function aneisSeCruzam(a, b) {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (segmentosIntersectam(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

function poligonosIntersectam(a, b) {
  if (a[0].some((ponto) => pontoNoPoligono(ponto, b))) return true;
  if (b[0].some((ponto) => pontoNoPoligono(ponto, a))) return true;
  return a.some((anelA) => b.some((anelB) => aneisSeCruzam(anelA, anelB)));
}

function geometriasIntersectam(a, b) {
  if (!bboxesIntersectam(bboxGeometria(a), bboxGeometria(b))) return false;
  return poligonos(a).some((pa) => poligonos(b).some((pb) => poligonosIntersectam(pa, pb)));
}

async function baixar(tipo, url, geometriasMunicipio, assentamentos) {
  console.log(`\nConsultando ${tipo}...`);
  const indices = await consultar(url, {
    where: '1=1',
    geometry: BBOX.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    returnIdsOnly: 'true',
    f: 'json',
  });
  const ids = [...new Set(indices.objectIds || [])];
  console.log(`IDs encontrados na janela de descoberta: ${ids.length}`);
  const registros = [];
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    const selecionados = ids.slice(inicio, inicio + 100);
    const conteudo = await consultar(url, {
      objectIds: selecionados.join(','),
      outFields: CAMPOS,
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
    });
    if (conteudo.type !== 'FeatureCollection') throw new Error('GeoJSON inválido retornado por /query.');
    registros.push(...(conteudo.features || []));
    console.log(`  ${Math.min(inicio + 100, ids.length)}/${ids.length} consultados`);
  }

  const resultado = registros
    .filter((feature) => feature.geometry && geometriasMunicipio.some((geom) => geometriasIntersectam(feature.geometry, geom)))
    .map((feature) => {
      const p = feature.properties || {};
      const bboxParcela = bboxGeometria(feature.geometry);
      const assentamentoIds = assentamentos
        .filter((assentamento) => bboxesIntersectam(bboxParcela, assentamento.bbox))
        .filter((assentamento) => geometriasIntersectam(feature.geometry, assentamento.geometry))
        .map((assentamento) => assentamento.id);
      return {
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          id_sigef: p.parcela_co || null,
          codigo_imovel: p.codigo_imo || null,
          situacao: p.situacao_i || p.status || null,
          municipio_codigo_origem: p.municipio_ || null,
          fonte: `SIGEF ${tipo} / INCRA via IBAMA`,
          tipo_camada: 'parcela_rural_sigef',
          status_validacao_lote: 'NAO_VERIFICADO_COMO_LOTE_DE_ASSENTAMENTO',
          numero_lote_oficial: null,
          assentamento_id: assentamentoIds[0] || null,
          assentamento_ids: assentamentoIds,
          nome_propriedade: null,
          area_oficial_ha: null,
          numero_matricula: null,
          atividade_principal: null,
          observacoes_publicas: null,
          criterio_selecao: 'intersecao_com_limite_municipal_IBGE',
          possui_dados_de_proprietario: false,
        },
      };
    });

  const arquivo = join(saida, `parcelas_sigef_${tipo}_candidatas.geojson`);
  await writeFile(arquivo, JSON.stringify({ type: 'FeatureCollection', features: resultado }), 'utf8');
  const relacionadas = resultado.filter((feature) => feature.properties.assentamento_ids.length > 0).length;
  console.log(`Salvas ${resultado.length} parcelas candidatas em ${arquivo}`);
  console.log(`  ${relacionadas} parcelas cruzam ao menos um assentamento do atlas`);
  return {
    tipo,
    consultadas_bbox: ids.length,
    retidas: resultado.length,
    relacionadas_a_assentamentos: relacionadas,
    arquivo,
    criterio: resultado.length ? 'intersecao_com_limite_municipal_IBGE' : 'nenhum',
  };
}

await mkdir(saida, { recursive: true });
const limite = JSON.parse(await readFile(limitePath, 'utf8'));
const assentamentosGeojson = JSON.parse(await readFile(assentamentosPath, 'utf8'));
const geometriasMunicipio = (limite.features || []).map((feature) => feature.geometry).filter(Boolean);
if (!geometriasMunicipio.length) throw new Error('Limite municipal IBGE ausente ou inválido.');
const assentamentos = (assentamentosGeojson.features || [])
  .filter((feature) => feature.geometry && feature.properties?.identificador_atlas)
  .map((feature) => ({
    id: feature.properties.identificador_atlas,
    geometry: feature.geometry,
    bbox: bboxGeometria(feature.geometry),
  }));
if (!assentamentos.length) throw new Error('Geometrias dos assentamentos ausentes ou inválidas.');
console.log('Limite municipal real para filtragem: SIM');
console.log(`Assentamentos preparados para cruzamento espacial: ${assentamentos.length}`);

const resumo = [];
const erros = [];
for (const [tipo, url] of Object.entries(SERVICOS)) {
  try {
    resumo.push(await baixar(tipo, url, geometriasMunicipio, assentamentos));
  } catch (erro) {
    erros.push({ tipo, erro: erro.message });
    console.error(`ERRO ${tipo}:`, erro.message);
  }
}

const manifest = {
  data_utc: new Date().toISOString(),
  municipio: 'Abelardo Luz/SC',
  codigo_ibge: CODIGO_IBGE,
  bbox_de_busca_nao_oficial: BBOX,
  aviso: 'PARCELAS SIGEF NÃO SÃO NECESSARIAMENTE LOTES DOS ASSENTAMENTOS; número_lote_oficial não disponível.',
  camadas: resumo,
  erros,
};
await writeFile(join(saida, 'resultado_consulta_sigef.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('\nResumo:', JSON.stringify(manifest, null, 2));
if (erros.length) process.exitCode = 1;
