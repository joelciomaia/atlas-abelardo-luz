# Prompt pronto para colar no Codex (VSCode)

Desenvolva um portal web chamado **Atlas Interativo dos Assentamentos de Abelardo Luz**.

## Stack
- React + TypeScript + Vite
- react-leaflet + leaflet (comece aqui; não introduza banco de dados antes de precisar)
- CSS responsivo com paleta institucional neutra e mapa central como protagonista.

## Arquitetura
- Leia os dados existentes em `dados/assentamentos_catalogo.json`, `dados/localidades_questionario_anonimizadas.json`, `dados/metadados_fontes.json`.
- Leia as geometrias de `public/geojson/assentamentos.geojson` e `public/geojson/abelardo-luz.geojson`.
- Separe componentes em `MapaAtlas`, `BarraCamadas`, `PainelAssentamento`, `IndicadoresPesquisa`, `Legenda`, `Fontes`.
- Use `L.geoJSON` ou `<GeoJSON>` do react-leaflet: `onEachFeature` para mouseover/mouseout/click. Ao passar o mouse, altere contorno, cor e espessura; clique fixa a seleção e abre painel lateral. Adicione zoom automático ao polígono.
- Relacione polígonos ao catálogo preferencialmente por identificador oficial SIPRA, quando existir; até então, implemente normalização de nomes e avise sobre associações ambíguas.
- Implemente toggles para limites municipais, assentamentos, rios e matas; camadas não disponibilizadas devem aparecer como 'dados indisponíveis', nunca desenhadas de forma fictícia.
- Implementar busca textual por assentamento, filtros temáticos e tabela/resumo com fontes, ano e limites da amostra.
- Legenda e barra de escala, atribuição das fontes cartográficas, compatibilidade com teclado e celular, controles de zoom e botão 'voltar à visão geral'.
- Hospedagem estática compatível com GitHub Pages. Utilizar rotas e caminhos de arquivo que funcionem com base URL do Vite.

## Regras obrigatórias de dados
1. Não desenhar limites, rios, nascentes, reservas ou pontos de interesse a partir de palpites ou da imagem digitalizada; aguardar GeoJSON real.
2. Nunca confundir `quantidade_respostas_na_pesquisa` com habitantes ou famílias assentadas.
3. Para `familias_assentadas`, `area_hectares`, `habitantes` nulos, mostrar 'Não disponível' sem inventar números.
4. Relatos dos estudantes são indicadores qualitativos amostrais, não comprovação espacial.
5. Não mostrar informações individuais de estudantes nem respostas sensíveis.
6. Associar visualmente as informações à fonte e ao ano; revisar nomes de assentamentos e duplicidades.
7. Não mostrar camada de rio/mata 'completa' enquanto os respectivos dados georreferenciados não tiverem sido incluídos.
8. Caso os GeoJSON estejam vazios, mostrar aviso visível com o passo de obtenção de geometrias e preservar painel/tabulação de dados.

## Resultado esperado
Uma interface profissional, legível, fluida, com mapa, legenda, lista de assentamentos e painel de detalhes à direita no desktop e na parte inferior no celular. Evite dashboards genéricos: a experiência deve lembrar um atlas cartográfico acadêmico.
