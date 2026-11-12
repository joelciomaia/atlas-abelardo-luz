# Atlas de Abelardo Luz — pacote de parcelas SIGEF

Este pacote evita trabalho de pesquisa pelo Codex. Conteudo:
- `fontes/fontes_verificadas.json`: URLs exatas dos servidores ArcGIS REST para SIGEF publico e privado.
- `scripts/baixar_parcelas_sigef.py`: consulta, pagina por IDs e grava duas camadas GeoJSON.
- `codigo/camadaParcelasSigef.ts`: camada Google Maps JS com destaque e popup de dados publicos.
- `PROMPT_PRONTO_PARA_CODEX.txt`: prompt curto para colar no Codex.

## Uso
Copiar os arquivos para a raiz do projeto e executar:

    python scripts/baixar_parcelas_sigef.py

O download e feito pelo proprio script; o Codex nao precisa pesquisar nada. Python 3.9+.

Se o limite oficial `public/geojson/abelardo-luz.geojson` ja existir, instalar `shapely` permite filtragem geometrica precisa:

    pip install shapely

Sem este limite, a consulta usa o campo municipal quando identificado. Caso nao exista este campo corretamente preenchido, a busca usa uma caixa aproximada da regiao e rotula os dados como NAO VERIFICADOS.

## LIMITACAO
Os dados cartograficos deste pacote sao FONTES e CODIGO DE EXTRACAO, nao um download concluido de lotes georreferenciados. A rede do ambiente de elaboracao nao permitiu consultar o endpoint `/query`, portanto a extracao das feicoes nao foi testada ponta a ponta. Foi confirmada a existencia dos servicos e os seus metadados de camada e suporte a GeoJSON. O script lida com falhas sem inventar feicoes.

Nao confundir parcela SIGEF com lote de assentamento. Numeracao oficial dos lotes e parcelamento interno sao obtidos da **Planta Geral/parcelamento INCRA**. Para lotes faltantes, solicitar ao INCRA os shapefiles/geopackage (com geometria, codigo de PA e numero de lote, SEM dados pessoais). O material do Modulo Lote CAR reconhece o shapefile de parcelamento.

## Fontes
- SIGEF publica: https://pamgia.ibama.gov.br/server/rest/services/BasesSincronizadas/lim_sigef_publico_incra_p/FeatureServer/0
- SIGEF privada: https://pamgia.ibama.gov.br/server/rest/services/01_Publicacoes_Bases/lim_imovel_sigef_privado_a/FeatureServer/9
- INCRA acervo: https://acervofundiario.incra.gov.br/acervo/login.php
- INCRA contato: coordenacao.cartografia@incra.gov.br
- Documentacao lotes CAR: https://www.gov.br/incra/pt-br/centrais-de-conteudos/publicacoes/manuais/perguntas_e_respostas_modulo_lote_car_mlc.pdf
