# Atlas Territorial de Abelardo Luz

Site cartográfico interativo para explorar o território de Abelardo Luz (SC), seus assentamentos e as parcelas rurais candidatas importadas do SIGEF. A interface usa Google Maps, seleção por clique, busca, camadas territoriais e painéis com dados oficiais e relatos escolares anonimizados.

## Endereços

- GitHub Pages: `https://joelciomaia.github.io/atlas-abelardo-luz/`
- Site principal: `https://atlas-abelardo-luz.joelciomaia.chatgpt.site`

## Estrutura

- `web/`: HTML, CSS, JavaScript e dados publicados.
- `scripts/build-pages.mjs`: gera a versão estática para GitHub Pages.
- `scripts/build-worker.mjs`: empacota o Worker usado no Site principal.
- `scripts/baixar-parcelas-sigef.mjs`: importa as parcelas a partir dos serviços oficiais fornecidos no pacote do projeto.
- `atlas_assentamentos_base/`: material de origem fornecido para o projeto.

## Publicação no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica automaticamente a branch `main`. A chave do Google Maps não é armazenada no repositório: ela deve existir no Secret `GOOGLE_MAPS_API_KEY`.

No Google Cloud, restrinja a chave da Maps JavaScript API aos endereços utilizados pelo projeto, incluindo:

```text
https://joelciomaia.github.io/atlas-abelardo-luz/*
```

## Validação local

```powershell
$env:GOOGLE_MAPS_API_KEY='chave-de-teste'
node scripts/build-pages.mjs
node scripts/build-worker.mjs
node scripts/validate-worker.mjs
```

O atlas diferencia dados oficiais de relatos amostrais. As parcelas SIGEF são candidatas por interseção espacial e não são apresentadas como lotes internos oficiais dos assentamentos.
