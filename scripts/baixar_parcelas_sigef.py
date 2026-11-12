#!/usr/bin/env python3
"""Baixa PARCELAS SIGEF candidatas na região de Abelardo Luz.

Arquivo original preservado do pacote fornecido pelo usuário. O ambiente atual
não possui Python; a execução efetiva usa baixar-parcelas-sigef.mjs, uma porta
Node com os mesmos endpoints, campos públicos e filtro espacial municipal.
"""
import argparse, datetime, json, sys, time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

SERVICOS = {
    'publico': 'https://pamgia.ibama.gov.br/server/rest/services/BasesSincronizadas/lim_sigef_publico_incra_p/FeatureServer/0/query',
    'privado': 'https://pamgia.ibama.gov.br/server/rest/services/01_Publicacoes_Bases/lim_imovel_sigef_privado_a/FeatureServer/9/query',
}
CODIGO_IBGE = 4200101
BBOX = (-52.65, -26.85, -51.95, -26.25)
BASE = {
    'where': '1=1',
    'geometry': ','.join(map(str, BBOX)),
    'geometryType': 'esriGeometryEnvelope',
    'inSR': 4326,
    'spatialRel': 'esriSpatialRelIntersects',
}
CAMPOS = 'objectid,parcela_co,codigo_imo,situacao_i,status,municipio_,uf_id'


def consultar(url, parametros, max_tentativas=3):
    full_url = url + '?' + urlencode(parametros)
    ultima = None
    for tentativa in range(max_tentativas):
        try:
            req = Request(full_url, headers={'User-Agent': 'AtlasEscolarAbelardoLuz/1.0 (consulta-publica)'})
            with urlopen(req, timeout=90) as resposta:
                bruto = resposta.read()
            dados = json.loads(bruto)
            if 'error' in dados:
                raise RuntimeError('Erro ArcGIS: ' + str(dados['error']))
            return dados
        except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as exc:
            ultima = exc
            if tentativa + 1 < max_tentativas:
                time.sleep(2 * (tentativa + 1))
    raise RuntimeError('Consulta falhou em ' + url + ': ' + str(ultima))


def carregar_geom_municipio(caminho):
    if not caminho.exists():
        return None
    geo = json.loads(caminho.read_text(encoding='utf-8'))
    shapes = [f.get('geometry') for f in geo.get('features', []) if f.get('geometry')]
    if not shapes:
        return None
    try:
        from shapely.geometry import shape
        from shapely.ops import unary_union
    except ImportError:
        print('AVISO: shapely nao instalado. O limite municipal sera ignorado; dados permanecerao candidatos.')
        return None
    return unary_union([shape(g) for g in shapes])


def baixar(tipo, url, saida, geom_municipio=None):
    print('\nConsultando', tipo, '...')
    indices = consultar(url, {**BASE, 'returnIdsOnly': 'true', 'f': 'json'})
    ids = list(dict.fromkeys(indices.get('objectIds') or []))
    print('IDs encontrados na janela de descoberta:', len(ids))
    registros = []
    for indice in range(0, len(ids), 100):
        selecionados = ids[indice:indice + 100]
        conteudo = consultar(url, {
            'objectIds': ','.join(map(str, selecionados)),
            'outFields': CAMPOS,
            'returnGeometry': 'true',
            'outSR': 4326,
            'f': 'geojson',
        })
        if conteudo.get('type') != 'FeatureCollection':
            raise RuntimeError('GeoJSON invalido, consulte o retorno de /query')
        registros.extend(conteudo.get('features', []))
        print(f'  {min(indice + 100, len(ids))}/{len(ids)} consultados', end='\r', flush=True)
    print('')
    resultado = []
    tem_codigo_municipio = False
    for feature in registros:
        if not feature.get('geometry'):
            continue
        props = feature.get('properties') or {}
        try:
            if int(props.get('municipio_')) == CODIGO_IBGE:
                tem_codigo_municipio = True
        except (ValueError, TypeError):
            pass
    for feature in registros:
        if not feature.get('geometry'):
            continue
        p = feature.get('properties') or {}
        if geom_municipio is not None:
            from shapely.geometry import shape
            if not shape(feature['geometry']).intersects(geom_municipio):
                continue
            criterio = 'intersecao_com_limite_municipal_IBGE'
        elif tem_codigo_municipio:
            try:
                if int(p.get('municipio_')) != CODIGO_IBGE:
                    continue
            except (ValueError, TypeError):
                continue
            criterio = 'codigo_municipio_SIGEF'
        else:
            criterio = 'apenas_janela_bbox_exige_conferencia'
        feature['properties'] = {
            'id_sigef': p.get('parcela_co'),
            'codigo_imovel': p.get('codigo_imo'),
            'situacao': p.get('situacao_i') or p.get('status'),
            'municipio_codigo_origem': p.get('municipio_'),
            'fonte': 'SIGEF ' + tipo + ' / INCRA via IBAMA',
            'tipo_camada': 'parcela_rural_sigef',
            'status_validacao_lote': 'NAO_VERIFICADO_COMO_LOTE_DE_ASSENTAMENTO',
            'numero_lote_oficial': None,
            'assentamento_id': None,
            'criterio_selecao': criterio,
            'possui_dados_de_proprietario': False,
        }
        resultado.append(feature)
    payload = {'type': 'FeatureCollection', 'features': resultado}
    out = saida / f'parcelas_sigef_{tipo}_candidatas.geojson'
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Salvas {len(resultado)} parcelas CANDIDATAS em {out}')
    return {
        'tipo': tipo,
        'consultadas_bbox': len(ids),
        'retidas': len(resultado),
        'arquivo': str(out),
        'criterio': resultado[0]['properties']['criterio_selecao'] if resultado else 'nenhum',
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--saida', default='public/geojson')
    parser.add_argument('--limite-ibge', default='public/geojson/abelardo-luz.geojson')
    args = parser.parse_args()
    pasta = Path(args.saida)
    pasta.mkdir(parents=True, exist_ok=True)
    gm = carregar_geom_municipio(Path(args.limite_ibge))
    print('Limite municipal real para filtragem:', 'SIM' if gm is not None else 'NAO')
    resumo = []
    erros = []
    for tipo, url in SERVICOS.items():
        try:
            resumo.append(baixar(tipo, url, pasta, gm))
        except Exception as exc:
            erros.append({'tipo': tipo, 'erro': str(exc)})
            print('ERRO', tipo, ':', exc, file=sys.stderr)
    manifest = {
        'data_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'municipio': 'Abelardo Luz/SC',
        'codigo_ibge': CODIGO_IBGE,
        'bbox_de_busca_nao_oficial': BBOX,
        'aviso': 'PARCELAS SIGEF NAO SAO NECESSARIAMENTE LOTES DOS ASSENTAMENTOS; numero_lote_oficial nao disponivel.',
        'camadas': resumo,
        'erros': erros,
    }
    (pasta / 'resultado_consulta_sigef.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print('\nResumo:', json.dumps(manifest, ensure_ascii=False, indent=2))
    if erros:
        sys.exit(1)


if __name__ == '__main__':
    main()
