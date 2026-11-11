# Atlas dos Assentamentos de Abelardo Luz

Site cartográfico interativo para explorar os assentamentos que cruzam o território de Abelardo Luz (SC). A interface oferece destaque ao passar o mouse, seleção fixa por clique, busca, mapa de satélite e painel com dados oficiais e relatos escolares anonimizados.

## Estrutura

- `dist/`: site estático pronto para publicação.
- `scripts/preparar-geodados.mjs`: consulta o limite municipal do IBGE e os polígonos do INCRA/IBAMA, cruza os dados com o catálogo escolar e gera os arquivos finais.
- `atlas_assentamentos_base/`: material de origem fornecido para o projeto.

## Atualização dos dados

```powershell
node scripts/preparar-geodados.mjs
```

## Prévia local

```powershell
node scripts/preview.mjs
```

O atlas diferencia dados oficiais de relatos amostrais. As respostas dos estudantes não devem ser interpretadas como população total ou censo dos assentamentos.
