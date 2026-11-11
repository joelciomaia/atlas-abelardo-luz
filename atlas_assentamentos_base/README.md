# Atlas Interativo dos Assentamentos de Abelardo Luz (SC)

## O que foi preparado

Esta é uma **base de dados inicial para integração com uma aplicação React/Leaflet**. Não é um mapa cartográfico final.

- **25 assentamentos** catalogados em fonte que reproduz dados do INCRA; não foram inventadas fronteiras nem coordenadas.
- **23 questionários com respostas** de estudantes e **11 cadastros sem respostas**, extraídos da planilha disponibilizada pelo responsável.
- Agregação **anônima** dos relatos por localidade e tema: água, vegetação, produção agrícola, criação de animais, resíduos e uso da internet.
- Script para tentar obter os polígonos oficiais do INCRA/IBAMA e limite do município pelo IBGE.

## Arquivos

| Arquivo | Finalidade |
| --- | --- |
| `dados/assentamentos_catalogo.json` | Lista de 25 PAs e campos oficiais a completar. |
| `dados/localidades_questionario_anonimizadas.json` | Números consolidados por localidade, sem nomes individuais. |
| `dados/metadados_fontes.json` | Origens, amostra, limites e qualidade dos dados. |
| `dados/perguntas_formulario.json` | Os 41 campos originais (37 perguntas temáticas). |
| `public/geojson/assentamentos.geojson` | Arquivo vazio — preenchido pelo script oficial. |
| `public/geojson/abelardo-luz.geojson` | Arquivo vazio — preenchido pelo script oficial. |
| `scripts/baixar_geometrias_incra.py` | Extrai polígonos do serviço INCRA/IBAMA. |
| `scripts/baixar_limite_ibge.py` | Extrai a malha municipal IBGE 2025. |
| `PROMPT_PARA_CODEX.md` | Orientações para gerar interface no VSCode com Codex. |

## Como preparar geometria real

Na raiz do pacote, em terminal:

```bash
python -m pip install -r requirements.txt
python scripts/baixar_geometrias_incra.py
python scripts/baixar_limite_ibge.py
```

Os scripts exigem internet na máquina local. **Não foram executados com sucesso neste ambiente**, por isso os dois GeoJSON de saída estão vazios. Não trate os arquivos vazios como resultado completo.

Se a API do IBAMA estiver indisponível, use [o serviço cartográfico oficial](https://pamgia.ibama.gov.br/server/rest/services/01_Publicacoes_Bases/assentamentos_incra/MapServer/1) ou [o geodownload do INCRA](https://acervofundiario.incra.gov.br/geodownload/geodados.php) no QGIS. Exporte a camada com SRC EPSG:4326 para `public/geojson/assentamentos.geojson`.

## Plano técnico recomendado

- `React` + `TypeScript` + `Vite` na interface.
- `Leaflet` + `react-leaflet` para as camadas, destaque ao passar o mouse, clique e cartões.
- `GeoJSON` para limites, rios e pontos (quando georreferenciados); `MapBiomas` para cobertura da terra com ano de referência explícito.
- Etapa 2: persistência com `PostgreSQL/PostGIS` apenas quando houver edição colaborativa e grande volume de dados.

## Privacidade e interpretação

O arquivo de origem contém dados pessoais de estudantes e foi **deliberadamente excluído** deste pacote. A base agregada não inclui nomes, renda individual, deficiência, orientação sexual ou respostas identificáveis. A contagem por assentamento mede apenas estudantes respondentes; não é população total, nem número de famílias. Uma menção a rio/nascente, por exemplo, **não informa a posição geográfica exata**. A interface deve esclarecer essa diferença.

Algumas localidades informadas no questionário (Fazenda da Luz, Serra Alta, Flor da Serra e Santa Luzia) não foram vinculadas automaticamente a um assentamento oficial; há um registro com localidade inválida anonimizado. Essas ocorrências precisam de conferência antes de mapeamento.
