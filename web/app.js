const CAMINHOS = {
  assentamentos: './dados/assentamentos.json',
  localidades: './dados/localidades.json',
  limite: './geojson/abelardo-luz.geojson',
  geometrias: './geojson/assentamentos.geojson',
};

const estado = {
  catalogo: [],
  localidades: [],
  porId: new Map(),
  localidadesPorAssentamento: new Map(),
  camadasPorId: new Map(),
  selecionado: null,
  limiteBounds: null,
  baseAtual: 'mapa',
  errosSatelite: 0,
};

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

const mapa = L.map('map', {
  zoomControl: false,
  attributionControl: true,
  minZoom: 8,
  maxZoom: 18,
  preferCanvas: false,
}).setView([-26.56, -52.33], 10);

mapa.createPane('assentamentosPane');
mapa.getPane('assentamentosPane').style.zIndex = '430';
mapa.createPane('limitePane');
mapa.getPane('limitePane').style.zIndex = '440';

const bases = {
  satelite: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 18,
      attribution: 'Imagens © Esri e colaboradores',
    },
  ),
  mapa: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'mapa-base-ruas',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
};

bases.mapa.addTo(mapa);

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

function itemDaFeature(feature) {
  const propriedades = feature.properties || {};
  const sipra = propriedades.cd_sipra;
  if (sipra) {
    const porSipra = estado.catalogo.find((item) => item.codigo_sipra === sipra);
    if (porSipra) return porSipra;
  }
  const chaves = [propriedades.nome_proje, propriedades.assentamento]
    .filter(Boolean)
    .map(normalizar);
  return estado.catalogo.find((item) => chaves.includes(normalizar(item.nome))) || null;
}

function estiloPadrao() {
  return {
    color: '#fff8dc',
    weight: 2.2,
    opacity: 0.98,
    fillColor: '#76b947',
    fillOpacity: 0.48,
    className: 'assentamento-shape',
  };
}

function estiloHover() {
  return {
    color: '#fff0cf',
    weight: 4,
    opacity: 1,
    fillColor: '#f2b35e',
    fillOpacity: 0.72,
  };
}

function estiloSelecionado() {
  return {
    color: '#fff5e9',
    weight: 4.5,
    opacity: 1,
    fillColor: '#ef8354',
    fillOpacity: 0.78,
  };
}

function nomeMunicipio(valor) {
  if (!valor) return 'Abelardo Luz';
  return String(valor)
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)\p{L}/gu, (letra) => letra.toLocaleUpperCase('pt-BR'));
}

function configurarAcessibilidadeCamada(layer, item) {
  const el = layer.getElement();
  if (!el || !item) return;
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `Selecionar assentamento ${item.nome}`);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selecionar(item.id, true);
    }
  });
}

function adicionarGeometrias(geojson) {
  const camada = L.geoJSON(geojson, {
    pane: 'assentamentosPane',
    style: estiloPadrao,
    onEachFeature(feature, layer) {
      const item = itemDaFeature(feature);
      if (!item) return;

      estado.camadasPorId.set(item.id, layer);
      layer.bindTooltip(
        `<strong>${escapar(item.nome)}</strong><span>${formatarNumero(item.area_hectares, 1)} ha · clique para conhecer</span>`,
        { className: 'atlas-tooltip', sticky: true, direction: 'top', offset: [0, -8] },
      );

      layer.on({
        mouseover() {
          if (estado.selecionado !== item.id) layer.setStyle(estiloHover());
          layer.bringToFront();
        },
        mouseout() {
          if (estado.selecionado !== item.id) layer.setStyle(estiloPadrao());
        },
        click(event) {
          L.DomEvent.stopPropagation(event);
          selecionar(item.id, true);
        },
        add() {
          configurarAcessibilidadeCamada(layer, item);
        },
      });
    },
  }).addTo(mapa);

  return camada;
}

function renderizarLista(filtro = '') {
  const termo = normalizar(filtro);
  const itens = estado.catalogo
    .filter((item) => normalizar(item.nome).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (!itens.length) {
    elementos.lista.innerHTML = '<div class="empty-survey">Nenhum assentamento encontrado.</div>';
    return;
  }

  elementos.lista.innerHTML = itens
    .map((item, indice) => {
      const respostas = Number(item.quantidade_respostas_na_pesquisa || 0);
      return `
        <button class="territory-item ${estado.selecionado === item.id ? 'is-active' : ''}" type="button" data-id="${escapar(item.id)}">
          <span class="territory-index">${String(indice + 1).padStart(2, '0')}</span>
          <span class="territory-name">
            <strong>${escapar(item.nome)}</strong>
            <small>${formatarNumero(item.area_hectares, 1)} ha · ${escapar(nomeMunicipio(item.municipio_sede))}/${escapar(item.uf_sede || item.uf || 'SC')}</small>
          </span>
          <span class="response-badge ${respostas ? '' : 'is-empty'}" title="${respostas} respostas na pesquisa">${respostas || '—'}</span>
        </button>`;
    })
    .join('');

  elementos.lista.querySelectorAll('.territory-item').forEach((botao) => {
    botao.addEventListener('click', () => selecionar(botao.dataset.id, true));
  });
}

function barras(indicador, respostas) {
  if (!indicador?.mencoes_por_estudante) return '';
  const valores = Object.entries(indicador.mencoes_por_estudante)
    .filter(([, valor]) => Number(valor) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (!valores.length) return '';

  return valores
    .map(([chave, valor]) => {
      const largura = Math.min(100, (Number(valor) / Math.max(1, respostas)) * 100);
      return `
        <div class="bar-row">
          <span>${escapar(nomesIndicadores[chave] || chave)}</span>
          <span class="bar-track"><i style="width:${largura}%"></i></span>
          <span class="bar-value">${valor}</span>
        </div>`;
    })
    .join('');
}

function secaoPesquisa(localidade, item) {
  if (!localidade) {
    return `
      <section class="detail-section">
        <div class="section-title-row">
          <div><span class="detail-label">Inventário da realidade</span><h3>Vozes da comunidade</h3></div>
        </div>
        <div class="empty-survey">
          Ainda não há respostas de estudantes vinculadas a este assentamento. A área permanece no atlas com seus dados oficiais.
        </div>
      </section>`;
  }

  const respostas = Number(localidade.quantidade_registros_questionario || 0);
  const grupos = gruposIndicadores
    .map(([chave, titulo]) => {
      const conteudo = barras(localidade.indicadores?.[chave], respostas);
      return conteudo ? `<div class="indicator-group"><h4>${titulo}</h4>${conteudo}</div>` : '';
    })
    .join('');

  const internet = Object.entries(localidade.internet_diaria || {})
    .map(([faixa, quantidade]) => `<span class="tag">${escapar(faixa)} · ${quantidade}</span>`)
    .join('');

  return `
    <section class="detail-section">
      <div class="section-title-row">
        <div><span class="detail-label">Inventário da realidade</span><h3>O que os estudantes relatam</h3></div>
        <span class="sample-count">${respostas} ${respostas === 1 ? 'resposta' : 'respostas'}</span>
      </div>
      ${grupos}
      ${internet ? `<div class="indicator-group"><h4>Uso diário de internet</h4><div class="tag-list">${internet}</div></div>` : ''}
      <p class="data-note">As menções podem se sobrepor e representam apenas os estudantes respondentes, não a população total.</p>
    </section>`;
}

function renderizarDetalhes(item) {
  const localidade = estado.localidadesPorAssentamento.get(item.id);
  const familias = formatarNumero(item.familias_assentadas);
  const capacidade = formatarNumero(item.capacidade_familias);
  elementos.conteudo.innerHTML = `
    <div class="detail-hero">
      <span class="detail-kicker">Projeto de assentamento</span>
      <h2>${escapar(item.nome)}</h2>
      <p class="detail-municipality">Município-sede: ${escapar(nomeMunicipio(item.municipio_sede))} · ${escapar(item.uf_sede || item.uf || 'SC')}</p>
    </div>

    <div class="metric-grid">
      <div class="metric"><span>Área oficial</span><strong>${formatarNumero(item.area_hectares, 1)}</strong><small>hectares</small></div>
      <div class="metric"><span>Famílias assentadas</span><strong>${familias}</strong><small>capacidade: ${capacidade}</small></div>
      <div class="metric"><span>Código SIPRA</span><strong>${escapar(item.codigo_sipra || 'Não disponível')}</strong></div>
      <div class="metric"><span>Criação</span><strong>${escapar(item.data_criacao || 'Não disponível')}</strong></div>
    </div>

    ${secaoPesquisa(localidade, item)}

    <section class="detail-section">
      <span class="detail-label">Registro oficial</span>
      <h3>Dados do território</h3>
      <div class="official-row"><span>Situação da geometria</span><strong>${item.geometria_disponivel ? 'Disponível' : 'Pendente'}</strong></div>
      <div class="official-row"><span>Tipo</span><strong>${escapar(item.tipo || 'Projeto de Assentamento')}</strong></div>
      <div class="official-row"><span>Fonte cartográfica</span><strong>INCRA / IBAMA</strong></div>
      <p class="data-note">O polígono representa o projeto de assentamento oficial e pode atravessar limites municipais.</p>
    </section>`;
}

function fecharExplorador() {
  elementos.explorador.classList.remove('is-open');
  elementos.backdrop.hidden = true;
  $('#toggle-explorador').setAttribute('aria-expanded', 'false');
}

function abrirExplorador() {
  elementos.explorador.classList.add('is-open');
  elementos.backdrop.hidden = false;
  $('#toggle-explorador').setAttribute('aria-expanded', 'true');
}

function selecionar(id, ajustarMapa = false) {
  const item = estado.porId.get(id);
  const camada = estado.camadasPorId.get(id);
  if (!item) return;

  if (estado.selecionado && estado.camadasPorId.has(estado.selecionado)) {
    estado.camadasPorId.get(estado.selecionado).setStyle(estiloPadrao());
  }

  estado.selecionado = id;
  if (camada) {
    camada.setStyle(estiloSelecionado());
    camada.bringToFront();
  }

  renderizarDetalhes(item);
  elementos.painel.classList.add('is-open');
  elementos.painel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-selection');
  renderizarLista(elementos.busca.value);
  fecharExplorador();

  if (ajustarMapa && camada) {
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    mapa.fitBounds(camada.getBounds(), {
      paddingTopLeft: mobile ? [28, 100] : [360, 115],
      paddingBottomRight: mobile ? [28, 270] : [430, 50],
      maxZoom: 13,
      animate: true,
    });
  }
}

function paddingVisaoGeral() {
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  return mobile
    ? { paddingTopLeft: [28, 94], paddingBottomRight: [28, 82] }
    : { paddingTopLeft: [375, 115], paddingBottomRight: [72, 60] };
}

function limparSelecao(voltar = false) {
  if (estado.selecionado && estado.camadasPorId.has(estado.selecionado)) {
    estado.camadasPorId.get(estado.selecionado).setStyle(estiloPadrao());
  }
  estado.selecionado = null;
  elementos.painel.classList.remove('is-open');
  elementos.painel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-selection');
  renderizarLista(elementos.busca.value);
  if (voltar && estado.limiteBounds) {
    mapa.fitBounds(estado.limiteBounds, { ...paddingVisaoGeral(), animate: true });
  }
}

function atualizarBotaoBase() {
  $('#base-label').textContent = estado.baseAtual === 'mapa' ? 'Ver satélite' : 'Ver mapa';
  $('#base-attribution').textContent = estado.baseAtual === 'mapa' ? 'Base © OpenStreetMap' : 'Imagens © Esri';
  $('#base-attribution').href = estado.baseAtual === 'mapa'
    ? 'https://www.openstreetmap.org/copyright'
    : 'https://www.esri.com/';
}

function mostrarAviso(mensagem) {
  elementos.status.classList.remove('is-ready');
  elementos.status.innerHTML = `<span class="pulse"></span> ${escapar(mensagem)}`;
  setTimeout(() => elementos.status.classList.add('is-ready'), 3200);
}

function voltarAoMapaBase() {
  if (mapa.hasLayer(bases.satelite)) mapa.removeLayer(bases.satelite);
  if (!mapa.hasLayer(bases.mapa)) bases.mapa.addTo(mapa).bringToBack();
  estado.baseAtual = 'mapa';
  atualizarBotaoBase();
}

function alternarBase() {
  const proxima = estado.baseAtual === 'satelite' ? 'mapa' : 'satelite';
  mapa.removeLayer(bases[estado.baseAtual]);
  bases[proxima].addTo(mapa).bringToBack();
  estado.baseAtual = proxima;
  if (proxima === 'satelite') estado.errosSatelite = 0;
  atualizarBotaoBase();
}

async function carregar() {
  try {
    if (!window.L) throw new Error('A biblioteca do mapa não foi carregada.');
    const [catalogo, localidades, limite, geometrias] = await Promise.all(
      Object.values(CAMINHOS).map(async (caminho) => {
        const resposta = await fetch(caminho);
        if (!resposta.ok) throw new Error(`Falha ao carregar ${caminho}`);
        return resposta.json();
      }),
    );

    estado.catalogo = catalogo;
    estado.localidades = localidades;
    estado.porId = new Map(catalogo.map((item) => [item.id, item]));
    estado.localidadesPorAssentamento = new Map(
      localidades.filter((item) => item.id_assentamento).map((item) => [item.id_assentamento, item]),
    );

    const limiteLayer = L.geoJSON(limite, {
      pane: 'limitePane',
      style: {
        color: '#ffffff',
        weight: 5,
        opacity: 0.95,
        dashArray: '9 7',
        fillColor: '#0f392f',
        fillOpacity: 0,
        className: 'limite-municipal',
      },
      interactive: false,
    }).addTo(mapa);

    estado.limiteBounds = limiteLayer.getBounds();
    adicionarGeometrias(geometrias);
    limiteLayer.bringToFront();
    mapa.fitBounds(estado.limiteBounds, { ...paddingVisaoGeral(), animate: false });

    elementos.totalAssentamentos.textContent = catalogo.length;
    elementos.totalRespostas.textContent = localidades.reduce(
      (total, item) => total + Number(item.quantidade_registros_questionario || 0),
      0,
    );
    renderizarLista();
    elementos.status.innerHTML = '<span class="pulse"></span> Atlas pronto';
    setTimeout(() => elementos.status.classList.add('is-ready'), 900);
  } catch (erro) {
    console.error(erro);
    elementos.status.innerHTML = `<span class="pulse"></span> ${escapar(erro.message)}`;
    elementos.lista.innerHTML = '<div class="empty-survey">Não foi possível carregar os dados do mapa. Tente novamente em instantes.</div>';
  }
}

elementos.busca.addEventListener('input', () => renderizarLista(elementos.busca.value));
$('#fechar-detalhes').addEventListener('click', () => limparSelecao(false));
$('#visao-geral').addEventListener('click', () => limparSelecao(true));
$('#zoom-in').addEventListener('click', () => mapa.zoomIn());
$('#zoom-out').addEventListener('click', () => mapa.zoomOut());
$('#toggle-base').addEventListener('click', alternarBase);
$('#toggle-explorador').addEventListener('click', abrirExplorador);
$('#fechar-explorador').addEventListener('click', fecharExplorador);
elementos.backdrop.addEventListener('click', fecharExplorador);
$('#abrir-fontes').addEventListener('click', () => elementos.fontes.showModal());
mapa.on('click', () => limparSelecao(false));

bases.satelite.on('tileerror', () => {
  estado.errosSatelite += 1;
  if (estado.baseAtual === 'satelite' && estado.errosSatelite >= 3) {
    voltarAoMapaBase();
    mostrarAviso('Satélite indisponível; voltamos ao mapa convencional');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && estado.selecionado) limparSelecao(false);
});

carregar();
