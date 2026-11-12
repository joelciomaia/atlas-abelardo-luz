const CAMINHOS = {
  assentamentos: './dados/assentamentos.json',
  localidades: './dados/localidades.json',
  metadados: './dados/metadados.json',
  limite: './geojson/abelardo-luz.geojson',
  geometrias: './geojson/assentamentos.geojson',
};

const estado = {
  catalogo: [],
  localidades: [],
  metadados: null,
  porId: new Map(),
  localidadesPorAssentamento: new Map(),
  featuresPorId: new Map(),
  selecionado: null,
  parcelaSelecionadaSigef: null,
  limiteBounds: null,
  baseAtual: 'roadmap',
  camadas: { assentamentos: true, municipio: true, parcelasSigef: false },
};

let mapa;
let assentamentosLayer;
let municipioLayer;
let mascaraMunicipal;
let infoWindow;
let falhaAutenticacaoGoogle = null;
let mapaBaseCarregado = false;
let parcelasSigefLayers = [];
let parcelasSigefCarregadas = false;
let parcelasSigefCarregando = null;

const arquivosParcelasSigef = [
  { url: './geojson/parcelas_sigef_publico_candidatas.geojson', tipo: 'Pública', cor: '#eab308' },
  { url: './geojson/parcelas_sigef_privado_candidatas.geojson', tipo: 'Privada', cor: '#f59e0b' },
];

const nomesIndicadores = {
  araucaria_ou_pinheiro: 'Araucária ou pinheiro',
  erva_mate: 'Erva-mate',
  arvores_frutiferas: 'Árvores frutíferas',
  eucalipto: 'Eucalipto',
  rios_ou_riachos: 'Rios ou riachos',
  acudes: 'Açudes',
  nascentes_ou_vertentes: 'Nascentes ou vertentes',
  pocos: 'Poços',
  sangas: 'Sangas',
  lagoas: 'Lagoas',
  milho: 'Milho',
  soja: 'Soja',
  fumo_ou_tabaco: 'Fumo ou tabaco',
  feijao: 'Feijão',
  pastagem: 'Pastagem',
  hortalicas: 'Hortaliças',
  bovinos: 'Bovinos',
  suinos: 'Suínos',
  aves: 'Aves',
  ovinos: 'Ovinos',
  queima: 'Queima',
  enterro_ou_fossa: 'Enterro ou fossa',
  reciclagem: 'Reciclagem',
  levado_a_cidade: 'Levado à cidade',
  reaproveitamento_organico: 'Reaproveitamento orgânico',
};

const gruposIndicadores = [
  ['vegetacao_relatada', 'Vegetação percebida'],
  ['fontes_agua_relatadas', 'Fontes de água'],
  ['cultivos_relatados', 'Cultivos mencionados'],
  ['criacao_animais_relatada', 'Criação de animais'],
  ['destinacao_residuos_relatada', 'Destinação de resíduos'],
];

const situacoesSigef = {
  REGISTRADA: 'Registrada',
  TITULADANAOREGISTRADA: 'Titulada, não registrada',
  NAOTITULADA: 'Não titulada',
};

const $ = (seletor) => document.querySelector(seletor);

const elementos = {
  lista: $('#lista-assentamentos'),
  busca: $('#busca'),
  painel: $('#painel-detalhes'),
  conteudo: $('#conteudo-detalhes'),
  status: $('#status'),
  totalAssentamentos: $('#total-assentamentos'),
  totalRespostas: $('#total-respostas'),
  explorador: $('#explorador'),
  backdrop: $('#backdrop'),
  fontes: $('#fontes-dialog'),
};

const normalizar = (valor = '') =>
  String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^pa\s+/, '')
    .replace(/\bd[oa]\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const escapar = (valor = '') =>
  String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatarNumero = (valor, casas = 0) => {
  if (valor === null || valor === undefined || valor === '') return 'Não disponível';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return escapar(valor);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(numero);
};

function nomeMunicipio(valor) {
  if (!valor) return 'Abelardo Luz';
  return String(valor)
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)\p{L}/gu, (letra) => letra.toLocaleUpperCase('pt-BR'));
}

function itemDaFeature(feature) {
  const propriedades = feature.properties || {};
  if (propriedades.cd_sipra) {
    const porSipra = estado.catalogo.find((item) => item.codigo_sipra === propriedades.cd_sipra);
    if (porSipra) return porSipra;
  }
  const chaves = [propriedades.nome_proje, propriedades.assentamento]
    .filter(Boolean)
    .map(normalizar);
  return estado.catalogo.find((item) => chaves.includes(normalizar(item.nome))) || null;
}

function estiloAssentamento(feature) {
  const id = feature.getProperty('atlas_id');
  if (estado.selecionado === id) {
    return {
      clickable: true,
      cursor: 'pointer',
      fillColor: '#ef8354',
      fillOpacity: 0.12,
      strokeColor: '#fff5e9',
      strokeOpacity: 1,
      strokeWeight: 4,
      zIndex: 18,
    };
  }
  return {
    clickable: true,
    cursor: 'pointer',
    fillColor: '#76b947',
    fillOpacity: 0.46,
    strokeColor: '#fff8dc',
    strokeOpacity: 1,
    strokeWeight: 2,
    zIndex: 20,
  };
}

function estiloHover() {
  return {
    fillColor: '#f2b35e',
    fillOpacity: 0.72,
    strokeColor: '#ffffff',
    strokeOpacity: 1,
    strokeWeight: 4,
    zIndex: 40,
  };
}

function expandirBounds(bounds, coordenadas) {
  if (!Array.isArray(coordenadas)) return;
  if (typeof coordenadas[0] === 'number' && typeof coordenadas[1] === 'number') {
    bounds.extend({ lng: coordenadas[0], lat: coordenadas[1] });
    return;
  }
  coordenadas.forEach((parte) => expandirBounds(bounds, parte));
}

function boundsDaFeature(feature) {
  const bounds = new google.maps.LatLngBounds();
  feature.getGeometry()?.forEachLatLng((latLng) => bounds.extend(latLng));
  return bounds;
}

function paddingVisaoGeral() {
  if (window.matchMedia('(max-width: 900px)').matches) {
    return { top: 92, right: 28, bottom: 78, left: 28 };
  }
  return document.body.classList.contains('explorer-collapsed')
    ? { top: 112, right: 72, bottom: 66, left: 72 }
    : { top: 112, right: 72, bottom: 66, left: 370 };
}

function recenterMunicipio() {
  if (!mapa || !estado.limiteBounds) return;
  mapa.fitBounds(estado.limiteBounds, paddingVisaoGeral());
}

function assentamentosComId(geojson) {
  return {
    ...geojson,
    features: geojson.features
      .map((feature) => {
        const item = itemDaFeature(feature);
        if (!item) return null;
        return {
          ...feature,
          id: item.id,
          properties: { ...(feature.properties || {}), atlas_id: item.id },
        };
      })
      .filter(Boolean),
  };
}

function areaAssinada(coordenadas) {
  let area = 0;
  for (let i = 0; i < coordenadas.length - 1; i += 1) {
    area += coordenadas[i][0] * coordenadas[i + 1][1] - coordenadas[i + 1][0] * coordenadas[i][1];
  }
  return area / 2;
}

function criarMascara(limite) {
  const anelMunicipal = limite.features[0]?.geometry?.coordinates?.[0];
  if (!anelMunicipal?.length) return null;
  const mundo = [[-179, -84], [179, -84], [179, 84], [-179, 84], [-179, -84]];
  const exterior = areaAssinada(mundo) > 0 ? mundo : [...mundo].reverse();
  const interior = areaAssinada(anelMunicipal) < 0 ? anelMunicipal : [...anelMunicipal].reverse();
  return new google.maps.Polygon({
    map: mapa,
    paths: [
      exterior.map(([lng, lat]) => ({ lat, lng })),
      interior.map(([lng, lat]) => ({ lat, lng })),
    ],
    clickable: false,
    fillColor: '#0b211c',
    fillOpacity: 0.22,
    strokeOpacity: 0,
    zIndex: 1,
  });
}

function mostrarTooltip(event, titulo, subtitulo) {
  infoWindow.setContent(
    `<div class="google-tooltip"><strong>${escapar(titulo)}</strong><span>${escapar(subtitulo)}</span></div>`,
  );
  infoWindow.setPosition(event.latLng);
  infoWindow.open({ map: mapa, shouldFocus: false });
}

function configurarCamadas(geojsonAssentamentos, geojsonMunicipio) {
  municipioLayer = new google.maps.Data({ map: mapa });
  municipioLayer.addGeoJson(geojsonMunicipio);
  municipioLayer.setStyle({
    clickable: true,
    cursor: 'pointer',
    fillColor: '#173c32',
    fillOpacity: 0.05,
    strokeColor: '#ffffff',
    strokeOpacity: 1,
    strokeWeight: 5,
    zIndex: 10,
  });

  assentamentosLayer = new google.maps.Data({ map: mapa });
  const features = assentamentosLayer.addGeoJson(assentamentosComId(geojsonAssentamentos), {
    idPropertyName: 'atlas_id',
  });
  features.forEach((feature) => {
    const id = feature.getProperty('atlas_id');
    if (id) estado.featuresPorId.set(id, feature);
  });
  assentamentosLayer.setStyle(estiloAssentamento);

  assentamentosLayer.addListener('mouseover', (event) => {
    const id = event.feature.getProperty('atlas_id');
    const item = estado.porId.get(id);
    if (!item) return;
    assentamentosLayer.overrideStyle(event.feature, estiloHover());
    mostrarTooltip(event, item.nome, `${formatarNumero(item.area_hectares, 1)} ha · clique para conhecer`);
  });
  assentamentosLayer.addListener('mouseout', (event) => {
    assentamentosLayer.revertStyle(event.feature);
    infoWindow.close();
  });
  assentamentosLayer.addListener('click', (event) => selecionar(event.feature.getProperty('atlas_id'), true));

  municipioLayer.addListener('mouseover', (event) => {
    municipioLayer.overrideStyle(event.feature, { strokeColor: '#d9f4a6', strokeWeight: 6, fillOpacity: 0.08 });
    mostrarTooltip(event, 'Abelardo Luz', 'Clique para abrir os dados municipais');
  });
  municipioLayer.addListener('mouseout', (event) => {
    municipioLayer.revertStyle(event.feature);
    infoWindow.close();
  });
  municipioLayer.addListener('click', selecionarMunicipio);
  mascaraMunicipal = criarMascara(geojsonMunicipio);
}

function atualizarControleParcelasSigef() {
  const botao = document.querySelector('[data-layer="parcelasSigef"]');
  if (!botao) return;
  const assentamentoId = estado.porId.has(estado.selecionado) ? estado.selecionado : null;
  const ativaManual = estado.camadas.parcelasSigef;
  const ativa = ativaManual || Boolean(assentamentoId);
  const zoomSuficiente = (mapa?.getZoom() || 0) >= 13;
  botao.classList.toggle('is-active', ativa);
  botao.setAttribute('aria-pressed', String(ativaManual));
  const rotulo = botao.querySelector('i');
  if (!ativa) rotulo.textContent = 'Oculta';
  else if (!zoomSuficiente) rotulo.textContent = 'Zoom ≥ 13';
  else if (!parcelasSigefCarregadas) rotulo.textContent = 'Carregando';
  else if (assentamentoId && !ativaManual) rotulo.textContent = 'No assentamento';
  else rotulo.textContent = 'Ativa';
}

function idsAssentamentosDaParcela(feature) {
  const ids = feature.getProperty('assentamento_ids');
  if (Array.isArray(ids)) return ids;
  const id = feature.getProperty('assentamento_id');
  return id ? [id] : [];
}

function assentamentoSelecionadoId() {
  return estado.porId.has(estado.selecionado) ? estado.selecionado : null;
}

function parcelaVisivelNoContexto(feature) {
  const assentamentoId = assentamentoSelecionadoId();
  if (assentamentoId) return idsAssentamentosDaParcela(feature).includes(assentamentoId);
  return estado.camadas.parcelasSigef;
}

function estiloParcelaSigef(feature, arquivo) {
  const selecionada = estado.parcelaSelecionadaSigef?.feature === feature;
  return {
    clickable: parcelaVisivelNoContexto(feature),
    cursor: 'pointer',
    visible: parcelaVisivelNoContexto(feature),
    fillColor: selecionada ? '#ef8354' : arquivo.cor,
    fillOpacity: selecionada ? 0.38 : 0.08,
    strokeColor: selecionada ? '#ffffff' : arquivo.cor,
    strokeOpacity: 1,
    strokeWeight: selecionada ? 3.2 : 1.5,
    zIndex: selecionada ? 48 : 32,
  };
}

function atualizarEstilosParcelasSigef() {
  parcelasSigefLayers.forEach(({ camada, arquivo }) => {
    camada.setStyle((feature) => estiloParcelaSigef(feature, arquivo));
  });
}

function contarParcelasDoAssentamento(assentamentoId) {
  let total = 0;
  parcelasSigefLayers.forEach(({ camada }) => {
    camada.forEach((feature) => {
      if (idsAssentamentosDaParcela(feature).includes(assentamentoId)) total += 1;
    });
  });
  return total;
}

async function carregarParcelasSigef() {
  if (parcelasSigefCarregadas) return;
  if (parcelasSigefCarregando) return parcelasSigefCarregando;

  parcelasSigefCarregando = (async () => {
    mostrarStatus('Carregando parcelas SIGEF…');
    let total = 0;
    const novasCamadas = [];
    for (const arquivo of arquivosParcelasSigef) {
      const resposta = await fetch(arquivo.url);
      if (!resposta.ok) throw new Error(`Não foi possível carregar ${arquivo.tipo.toLowerCase()} SIGEF.`);
      const geojson = await resposta.json();
      if (geojson.type !== 'FeatureCollection') throw new Error('O arquivo de parcelas SIGEF é inválido.');

      const camada = new google.maps.Data();
      const features = camada.addGeoJson(geojson);
      total += features.length;
      camada.setStyle((feature) => estiloParcelaSigef(feature, arquivo));
      camada.addListener('mouseover', (event) => {
        camada.overrideStyle(event.feature, {
          fillOpacity: 0.3,
          strokeColor: '#fff4b8',
          strokeWeight: 2.6,
          zIndex: 46,
        });
      });
      camada.addListener('mouseout', (event) => camada.revertStyle(event.feature));
      camada.addListener('click', (event) => {
        estado.parcelaSelecionadaSigef = { feature: event.feature, tipo: arquivo.tipo };
        atualizarEstilosParcelasSigef();
        renderizarDetalhesParcelaSigef(event.feature, arquivo.tipo);
        abrirPainel();
      });
      novasCamadas.push({ camada, arquivo });
    }

    if (!total) throw new Error('A consulta SIGEF não retornou parcelas para Abelardo Luz.');
    parcelasSigefLayers = novasCamadas;
    parcelasSigefCarregadas = true;
    mostrarStatus(`${formatarNumero(total)} parcelas SIGEF carregadas`);
  })();

  try {
    await parcelasSigefCarregando;
  } catch (erro) {
    estado.camadas.parcelasSigef = false;
    const botao = document.querySelector('[data-layer="parcelasSigef"]');
    if (botao) {
      botao.disabled = true;
      botao.classList.add('is-pending');
      botao.querySelector('i').textContent = 'Indisponível';
    }
    mostrarStatus(erro.message, true);
    throw erro;
  } finally {
    parcelasSigefCarregando = null;
  }
}

async function sincronizarParcelasSigef() {
  const assentamentoId = assentamentoSelecionadoId();
  const ativa = estado.camadas.parcelasSigef || Boolean(assentamentoId);
  const zoomSuficiente = (mapa?.getZoom() || 0) >= 13;
  atualizarControleParcelasSigef();

  if (ativa && zoomSuficiente && !parcelasSigefCarregadas) {
    try {
      await carregarParcelasSigef();
    } catch (erro) {
      console.error('[Atlas] Falha ao carregar parcelas SIGEF:', erro);
      return;
    }
  }

  const exibir = ativa && (mapa?.getZoom() || 0) >= 13 && parcelasSigefCarregadas;
  parcelasSigefLayers.forEach(({ camada }) => camada.setMap(exibir ? mapa : null));
  if (parcelasSigefCarregadas) atualizarEstilosParcelasSigef();
  atualizarControleParcelasSigef();

  if (ativa && !zoomSuficiente) {
    mostrarStatus('Parcelas SIGEF: aproxime o mapa até o zoom 13');
  } else if (exibir && assentamentoId) {
    const total = contarParcelasDoAssentamento(assentamentoId);
    const nome = estado.porId.get(assentamentoId)?.nome || 'o assentamento';
    mostrarStatus(total
      ? `${formatarNumero(total)} parcelas SIGEF relacionadas a ${nome}`
      : `Nenhuma parcela SIGEF candidata cruza ${nome}`);
  }
}

function renderizarLista(filtro = '') {
  const termo = normalizar(filtro);
  const itens = estado.catalogo
    .filter((item) => normalizar(item.nome).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const municipioVisivel = normalizar('Abelardo Luz município').includes(termo);
  if (!itens.length && !municipioVisivel) {
    elementos.lista.innerHTML = '<div class="empty-survey">Nenhum território encontrado.</div>';
    return;
  }
  const municipio = municipioVisivel
    ? `<button class="territory-item municipality-item ${estado.selecionado === 'municipio' ? 'is-active' : ''}" type="button" data-municipio="true">
        <span class="territory-index">MUN</span>
        <span class="territory-name"><strong>Abelardo Luz</strong><small>Município · código IBGE 4200101</small></span>
        <span class="response-badge">SC</span>
      </button>`
    : '';
  elementos.lista.innerHTML = municipio + itens.map((item, indice) => {
    const respostas = Number(item.quantidade_respostas_na_pesquisa || 0);
    return `<button class="territory-item ${estado.selecionado === item.id ? 'is-active' : ''}" type="button" data-id="${escapar(item.id)}">
        <span class="territory-index">${String(indice + 1).padStart(2, '0')}</span>
        <span class="territory-name"><strong>${escapar(item.nome)}</strong><small>${formatarNumero(item.area_hectares, 1)} ha · ${escapar(nomeMunicipio(item.municipio_sede))}/${escapar(item.uf_sede || item.uf || 'SC')}</small></span>
        <span class="response-badge ${respostas ? '' : 'is-empty'}" title="${respostas} respostas na pesquisa">${respostas || '—'}</span>
      </button>`;
  }).join('');
  elementos.lista.querySelector('[data-municipio]')?.addEventListener('click', selecionarMunicipio);
  elementos.lista.querySelectorAll('[data-id]').forEach((botao) => {
    botao.addEventListener('click', () => selecionar(botao.dataset.id, true));
    botao.addEventListener('mouseenter', () => {
      const feature = estado.featuresPorId.get(botao.dataset.id);
      if (feature && estado.camadas.assentamentos) assentamentosLayer.overrideStyle(feature, estiloHover());
    });
    botao.addEventListener('mouseleave', () => {
      const feature = estado.featuresPorId.get(botao.dataset.id);
      if (feature) assentamentosLayer.revertStyle(feature);
    });
  });
}

function barras(indicador, respostas) {
  if (!indicador?.mencoes_por_estudante) return '';
  return Object.entries(indicador.mencoes_por_estudante)
    .filter(([, valor]) => Number(valor) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([chave, valor]) => {
      const largura = Math.min(100, (Number(valor) / Math.max(1, respostas)) * 100);
      return `<div class="bar-row"><span>${escapar(nomesIndicadores[chave] || chave)}</span><span class="bar-track"><i style="width:${largura}%"></i></span><span class="bar-value">${valor}</span></div>`;
    }).join('');
}

function secaoPesquisa(localidade) {
  if (!localidade) {
    return `<section class="detail-section"><div class="section-title-row"><div><span class="detail-label">Inventário da realidade</span><h3>Vozes da comunidade</h3></div></div><div class="empty-survey">Ainda não há respostas de estudantes vinculadas a este território. A área permanece no atlas com seus dados oficiais.</div></section>`;
  }
  const respostas = Number(localidade.quantidade_registros_questionario || 0);
  const grupos = gruposIndicadores.map(([chave, titulo]) => {
    const conteudo = barras(localidade.indicadores?.[chave], respostas);
    return conteudo ? `<div class="indicator-group"><h4>${titulo}</h4>${conteudo}</div>` : '';
  }).join('');
  const internet = Object.entries(localidade.internet_diaria || {})
    .map(([faixa, quantidade]) => `<span class="tag">${escapar(faixa)} · ${quantidade}</span>`).join('');
  return `<section class="detail-section"><div class="section-title-row"><div><span class="detail-label">Inventário da realidade</span><h3>O que os estudantes relatam</h3></div><span class="sample-count">${respostas} ${respostas === 1 ? 'resposta' : 'respostas'}</span></div>${grupos}${internet ? `<div class="indicator-group"><h4>Uso diário de internet</h4><div class="tag-list">${internet}</div></div>` : ''}<p class="data-note">As menções podem se sobrepor e representam apenas os estudantes respondentes, não a população total.</p></section>`;
}

function renderizarDetalhes(item) {
  const localidade = estado.localidadesPorAssentamento.get(item.id);
  elementos.conteudo.innerHTML = `<div class="detail-hero"><span class="detail-kicker">Projeto de assentamento</span><h2>${escapar(item.nome)}</h2><p class="detail-municipality">Município-sede: ${escapar(nomeMunicipio(item.municipio_sede))} · ${escapar(item.uf_sede || item.uf || 'SC')}</p></div>
    <div class="metric-grid"><div class="metric"><span>Área oficial</span><strong>${formatarNumero(item.area_hectares, 1)}</strong><small>hectares</small></div><div class="metric"><span>Famílias assentadas</span><strong>${formatarNumero(item.familias_assentadas)}</strong><small>capacidade: ${formatarNumero(item.capacidade_familias)}</small></div><div class="metric"><span>Código SIPRA</span><strong>${escapar(item.codigo_sipra || 'Não disponível')}</strong></div><div class="metric"><span>Criação</span><strong>${escapar(item.data_criacao || 'Não disponível')}</strong></div></div>
    ${secaoPesquisa(localidade)}
    <section class="detail-section"><span class="detail-label">Registro oficial</span><h3>Dados do território</h3><div class="official-row"><span>Geometria</span><strong>${item.geometria_disponivel ? 'Disponível' : 'Pendente'}</strong></div><div class="official-row"><span>Tipo</span><strong>${escapar(item.tipo || 'Projeto de Assentamento')}</strong></div><div class="official-row"><span>Fonte</span><strong>INCRA / IBAMA</strong></div><p class="data-note">O polígono representa o projeto oficial e pode atravessar limites municipais.</p></section>`;
}

function propriedadeSigef(feature, nome, padrao = 'Não informado') {
  const valor = feature.getProperty(nome);
  return valor === null || valor === undefined || valor === '' ? padrao : String(valor);
}

function renderizarDetalhesParcelaSigef(feature, tipo) {
  const codigo = propriedadeSigef(feature, 'id_sigef', 'Indisponível');
  const codigoImovel = propriedadeSigef(feature, 'codigo_imovel');
  const situacaoBruta = feature.getProperty('situacao');
  const situacao = situacoesSigef[situacaoBruta] || situacaoBruta || 'Não informada';
  const fonte = propriedadeSigef(feature, 'fonte', `SIGEF ${tipo}`);
  const ids = idsAssentamentosDaParcela(feature);
  const assentamentos = ids
    .map((id) => estado.porId.get(id)?.nome)
    .filter(Boolean)
    .join(', ') || 'Sem relação espacial identificada';
  const nomePropriedade = propriedadeSigef(feature, 'nome_propriedade');
  const area = feature.getProperty('area_oficial_ha');
  const matricula = propriedadeSigef(feature, 'numero_matricula');
  const atividade = propriedadeSigef(feature, 'atividade_principal');
  const observacoes = propriedadeSigef(feature, 'observacoes_publicas', 'Não informadas');
  const numeroLote = propriedadeSigef(feature, 'numero_lote_oficial', 'Não disponível na base SIGEF');
  const areaFormatada = area === null || area === undefined || area === ''
    ? 'Não informada'
    : `${formatarNumero(area, 2)} ha`;

  elementos.conteudo.innerHTML = `<div class="detail-hero"><span class="detail-kicker">Parcela rural candidata</span><h2>Parcela SIGEF</h2><p class="detail-municipality">Código SIGEF: ${escapar(codigo)}</p></div>
    <div class="metric-grid"><div class="metric"><span>Situação</span><strong>${escapar(situacao)}</strong></div><div class="metric"><span>Camada</span><strong>${escapar(tipo)}</strong><small>SIGEF</small></div><div class="metric"><span>Assentamento relacionado</span><strong>${escapar(assentamentos)}</strong><small>por interseção espacial</small></div><div class="metric"><span>Código do imóvel</span><strong>${escapar(codigoImovel)}</strong></div></div>
    <section class="detail-section"><span class="detail-label">Ficha da propriedade</span><h3>Informações disponíveis</h3><div class="official-row"><span>Nome da propriedade</span><strong>${escapar(nomePropriedade)}</strong></div><div class="official-row"><span>Área oficial</span><strong>${escapar(areaFormatada)}</strong></div><div class="official-row"><span>Matrícula</span><strong>${escapar(matricula)}</strong></div><div class="official-row"><span>Atividade principal</span><strong>${escapar(atividade)}</strong></div><div class="official-row"><span>Número oficial do lote</span><strong>${escapar(numeroLote)}</strong></div><div class="official-row"><span>Observações públicas</span><strong>${escapar(observacoes)}</strong></div><p class="data-note">Os campos já estão preparados para receber dados oficiais futuros. Ausências são exibidas como “não informado”; nenhum número de lote foi criado pelo atlas.</p></section>
    <section class="detail-section"><span class="detail-label">Origem cartográfica</span><h3>Rastreabilidade</h3><div class="official-row"><span>Base</span><strong>${escapar(fonte)}</strong></div><div class="official-row"><span>Relação com assentamento</span><strong>Interseção espacial</strong></div><p class="data-note">Parcela SIGEF candidata. A geometria não confirma, por si só, que se trata de lote interno oficial do assentamento.</p></section>`;
}

function renderizarMunicipio() {
  const municipio = estado.metadados?.municipio || {};
  elementos.conteudo.innerHTML = `<div class="detail-hero"><span class="detail-kicker">Território municipal</span><h2>Abelardo Luz</h2><p class="detail-municipality">Santa Catarina · código IBGE 4200101</p></div>
    <div class="metric-grid"><div class="metric"><span>Área territorial</span><strong>954,0</strong><small>km² · IBGE 2025</small></div><div class="metric"><span>População</span><strong>${formatarNumero(municipio.populacao_censo_2022)}</strong><small>Censo 2022</small></div><div class="metric"><span>Estimativa 2026</span><strong>${formatarNumero(municipio.populacao_estimada_2026)}</strong><small>habitantes</small></div><div class="metric"><span>Assentamentos</span><strong>${estado.catalogo.length}</strong><small>no atlas</small></div></div>
    <section class="detail-section"><span class="detail-label">Leitura territorial</span><h3>Um município em camadas</h3><p class="data-note">Use o painel de camadas para comparar assentamentos e, nas próximas etapas, área urbana, imóveis rurais, ambiente, infraestrutura e indicadores sociais e econômicos.</p></section>
    <section class="detail-section"><span class="detail-label">Fontes</span><h3>Limite oficial</h3><div class="official-row"><span>Geometria municipal</span><strong>IBGE</strong></div><div class="official-row"><span>Código</span><strong>4200101</strong></div></section>`;
}

function emTelaPequena() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function sincronizarControleExplorador() {
  const aberto = emTelaPequena()
    ? elementos.explorador.classList.contains('is-open')
    : !elementos.explorador.classList.contains('is-collapsed');
  const controle = $('#toggle-explorador');
  controle.setAttribute('aria-expanded', String(aberto));
  controle.setAttribute('aria-label', aberto ? 'Ocultar painel de camadas' : 'Exibir painel de camadas');
  elementos.explorador.setAttribute('aria-hidden', String(!aberto));
}

function atualizarMapaAposPainel() {
  window.setTimeout(() => {
    if (mapa) google.maps.event.trigger(mapa, 'resize');
  }, 260);
}

function fecharExplorador() {
  if (emTelaPequena()) {
    elementos.explorador.classList.remove('is-open');
    elementos.backdrop.hidden = true;
  } else {
    elementos.explorador.classList.add('is-collapsed');
    document.body.classList.add('explorer-collapsed');
  }
  sincronizarControleExplorador();
  atualizarMapaAposPainel();
}

function abrirExplorador() {
  if (emTelaPequena()) {
    elementos.explorador.classList.add('is-open');
    elementos.backdrop.hidden = false;
  } else {
    elementos.explorador.classList.remove('is-collapsed');
    document.body.classList.remove('explorer-collapsed');
  }
  sincronizarControleExplorador();
  atualizarMapaAposPainel();
}

function alternarExplorador() {
  const aberto = emTelaPequena()
    ? elementos.explorador.classList.contains('is-open')
    : !elementos.explorador.classList.contains('is-collapsed');
  if (aberto) fecharExplorador();
  else abrirExplorador();
}

function abrirPainel() {
  elementos.painel.classList.add('is-open');
  elementos.painel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-selection');
  if (emTelaPequena()) fecharExplorador();
}

function selecionar(id, ajustarMapa = false) {
  const item = estado.porId.get(id);
  const feature = estado.featuresPorId.get(id);
  if (!item || !feature) return;
  estado.selecionado = id;
  estado.parcelaSelecionadaSigef = null;
  assentamentosLayer.setStyle(estiloAssentamento);
  renderizarDetalhes(item);
  abrirPainel();
  renderizarLista(elementos.busca.value);
  if (ajustarMapa) {
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    google.maps.event.addListenerOnce(mapa, 'idle', () => {
      if ((mapa.getZoom() || 0) < 13) mapa.setZoom(13);
      sincronizarParcelasSigef();
    });
    mapa.fitBounds(boundsDaFeature(feature), mobile
      ? { top: 90, right: 28, bottom: 260, left: 28 }
      : {
          top: 112,
          right: 430,
          bottom: 58,
          left: document.body.classList.contains('explorer-collapsed') ? 72 : 360,
        });
  }
  sincronizarParcelasSigef();
}

function selecionarMunicipio() {
  estado.selecionado = 'municipio';
  estado.parcelaSelecionadaSigef = null;
  assentamentosLayer?.setStyle(estiloAssentamento);
  renderizarMunicipio();
  abrirPainel();
  renderizarLista(elementos.busca.value);
  recenterMunicipio();
  sincronizarParcelasSigef();
}

function limparSelecao(voltar = false) {
  estado.selecionado = null;
  estado.parcelaSelecionadaSigef = null;
  assentamentosLayer?.setStyle(estiloAssentamento);
  atualizarEstilosParcelasSigef();
  elementos.painel.classList.remove('is-open');
  elementos.painel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-selection');
  renderizarLista(elementos.busca.value);
  if (voltar) recenterMunicipio();
  sincronizarParcelasSigef();
}

function fecharDetalhes() {
  if (estado.parcelaSelecionadaSigef && assentamentoSelecionadoId()) {
    estado.parcelaSelecionadaSigef = null;
    atualizarEstilosParcelasSigef();
    renderizarDetalhes(estado.porId.get(estado.selecionado));
    return;
  }
  limparSelecao(false);
}

function alternarBase() {
  estado.baseAtual = estado.baseAtual === 'roadmap' ? 'satellite' : 'roadmap';
  mapa.setMapTypeId(estado.baseAtual);
  $('#base-label').textContent = estado.baseAtual === 'roadmap' ? 'Ver satélite' : 'Ver mapa';
}

function alternarCamada(botao) {
  const nome = botao.dataset.layer;
  estado.camadas[nome] = !estado.camadas[nome];
  const ativa = estado.camadas[nome];
  if (nome === 'parcelasSigef') {
    sincronizarParcelasSigef();
    return;
  }
  botao.classList.toggle('is-active', ativa);
  botao.setAttribute('aria-pressed', String(ativa));
  botao.querySelector('i').textContent = ativa ? 'Ativa' : 'Oculta';
  if (nome === 'assentamentos') assentamentosLayer.setMap(ativa ? mapa : null);
  if (nome === 'municipio') {
    municipioLayer.setMap(ativa ? mapa : null);
    mascaraMunicipal?.setMap(ativa ? mapa : null);
  }
}

function mostrarStatus(mensagem, erro = false) {
  elementos.status.classList.remove('is-ready');
  elementos.status.innerHTML = `<span class="pulse"></span> ${escapar(mensagem)}`;
  if (!erro) setTimeout(() => elementos.status.classList.add('is-ready'), 1100);
}

function mostrarFalhaMapa(titulo, mensagem) {
  mostrarStatus(titulo, true);
  console.error(`[Atlas] ${titulo}: ${mensagem}`);
  let cartao = document.querySelector('.map-error-card');
  if (!cartao) {
    cartao = document.createElement('div');
    cartao.className = 'map-error-card';
    cartao.setAttribute('role', 'alert');
    document.querySelector('.atlas-shell').append(cartao);
  }
  cartao.innerHTML = `<strong>${escapar(titulo)}</strong><span>${escapar(mensagem)}</span>`;
}

function monitorarMapaBase() {
  google.maps.event.addListenerOnce(mapa, 'tilesloaded', () => {
    mapaBaseCarregado = true;
    document.querySelector('.map-error-card')?.remove();
    mostrarStatus('Atlas territorial pronto');
  });

  window.setTimeout(() => {
    if (mapaBaseCarregado || falhaAutenticacaoGoogle) return;
    const estruturaGoogle = document.querySelector('#map .gm-style');
    const creditosGoogle = document.querySelector('#map a[href*="google.com/maps"]');
    if (!estruturaGoogle) {
      mostrarFalhaMapa(
        'O mapa não foi montado',
        'O Google carregou o código, mas não criou a área do mapa. Recarregue a página; se continuar, envie esta mensagem.',
      );
      return;
    }
    if (!creditosGoogle) {
      mostrarFalhaMapa(
        'A base do Google foi bloqueada',
        'Confirme no Google Cloud: Maps JavaScript API ativa, faturamento vinculado e este endereço autorizado. Extensões de bloqueio também podem impedir os mapas.',
      );
    }
  }, 7000);
}

async function carregarGoogleMaps() {
  const resposta = await fetch('/config', { cache: 'no-store' });
  if (!resposta.ok) throw new Error('Não foi possível obter a configuração do mapa.');
  const config = await resposta.json();
  if (!config.googleMapsApiKey) throw new Error('A chave do Google Maps não está configurada.');
  await new Promise((resolve, reject) => {
    let finalizado = false;
    window.gm_authFailure = () => {
      falhaAutenticacaoGoogle = new Error('A chave do Google Maps foi recusada.');
      mostrarFalhaMapa(
        'O Google recusou a chave do mapa',
        'Ative a Maps JavaScript API, vincule o faturamento e autorize este domínio nas restrições HTTP da chave.',
      );
      if (!finalizado) reject(falhaAutenticacaoGoogle);
    };
    const callback = '__atlasGoogleMapsReady';
    window[callback] = () => {
      finalizado = true;
      delete window[callback];
      resolve();
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsApiKey)}&v=weekly&loading=async&callback=${callback}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete window[callback];
      reject(new Error('Não foi possível carregar o Google Maps.'));
    };
    document.head.append(script);
  });
  if (!window.google?.maps?.Map || !window.google?.maps?.Data) {
    throw new Error('O Google Maps carregou sem os recursos necessários.');
  }
}

async function carregar() {
  try {
    const dadosPromise = Promise.all(Object.values(CAMINHOS).map(async (caminho) => {
      const resposta = await fetch(caminho);
      if (!resposta.ok) throw new Error(`Falha ao carregar ${caminho}`);
      return resposta.json();
    }));
    await carregarGoogleMaps();
    const [catalogo, localidades, metadados, limite, geometrias] = await dadosPromise;
    estado.catalogo = catalogo;
    estado.localidades = localidades;
    estado.metadados = metadados;
    estado.porId = new Map(catalogo.map((item) => [item.id, item]));
    estado.localidadesPorAssentamento = new Map(
      localidades.filter((item) => item.id_assentamento).map((item) => [item.id_assentamento, item]),
    );

    mapa = new google.maps.Map($('#map'), {
      center: { lat: -26.56, lng: -52.33 },
      zoom: 10,
      mapTypeId: 'roadmap',
      mapTypeControl: false,
      zoomControl: false,
      fullscreenControl: false,
      streetViewControl: false,
      scaleControl: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
      backgroundColor: '#173c32',
    });
    mostrarStatus('Carregando a base do Google Maps…');
    monitorarMapaBase();
    infoWindow = new google.maps.InfoWindow({ disableAutoPan: true, headerDisabled: true });
    mapa.addListener('zoom_changed', sincronizarParcelasSigef);
    const bounds = new google.maps.LatLngBounds();
    expandirBounds(bounds, limite.features[0]?.geometry?.coordinates);
    estado.limiteBounds = bounds;
    configurarCamadas(geometrias, limite);
    recenterMunicipio();
    elementos.totalAssentamentos.textContent = catalogo.length;
    elementos.totalRespostas.textContent = localidades.reduce(
      (total, item) => total + Number(item.quantidade_registros_questionario || 0), 0,
    );
    renderizarLista();
  } catch (erro) {
    console.error(erro);
    if (!falhaAutenticacaoGoogle) mostrarFalhaMapa('Não foi possível abrir o mapa', erro.message);
    elementos.lista.innerHTML = `<div class="empty-survey">${escapar(erro.message)}</div>`;
  }
}

elementos.busca.addEventListener('input', () => renderizarLista(elementos.busca.value));
$('#fechar-detalhes').addEventListener('click', fecharDetalhes);
$('#visao-geral').addEventListener('click', () => limparSelecao(true));
$('#zoom-in').addEventListener('click', () => mapa?.setZoom((mapa.getZoom() || 10) + 1));
$('#zoom-out').addEventListener('click', () => mapa?.setZoom((mapa.getZoom() || 10) - 1));
$('#toggle-base').addEventListener('click', () => mapa && alternarBase());
$('#toggle-explorador').addEventListener('click', alternarExplorador);
$('#fechar-explorador').addEventListener('click', fecharExplorador);
elementos.backdrop.addEventListener('click', fecharExplorador);
$('#abrir-fontes').addEventListener('click', () => elementos.fontes.showModal());
document.querySelectorAll('[data-layer]').forEach((botao) => {
  botao.addEventListener('click', () => mapa && alternarCamada(botao));
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (estado.selecionado || estado.parcelaSelecionadaSigef)) fecharDetalhes();
});

let telaPequenaAnterior = emTelaPequena();
window.addEventListener('resize', () => {
  const telaPequenaAtual = emTelaPequena();
  if (telaPequenaAtual === telaPequenaAnterior) return;
  telaPequenaAnterior = telaPequenaAtual;
  elementos.explorador.classList.remove('is-open', 'is-collapsed');
  document.body.classList.remove('explorer-collapsed');
  elementos.backdrop.hidden = true;
  sincronizarControleExplorador();
});

sincronizarControleExplorador();
carregar();
