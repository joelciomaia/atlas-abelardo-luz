#!/usr/bin/env python3
"""Baixa polígonos reais dos assentamentos via serviço oficial INCRA/IBAMA.
Requer pip install requests. Executar da pasta raiz do pacote.
"""
import json, re, unicodedata, requests
from pathlib import Path

ENDPOINT='https://pamgia.ibama.gov.br/server/rest/services/01_Publicacoes_Bases/assentamentos_incra/MapServer/1/query'
OUT=Path('public/geojson/assentamentos.geojson')

def nrm(s):
    s=''.join(c for c in unicodedata.normalize('NFD',str(s or '').casefold()) if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+',' ',s).strip()


def request(where):
    params={'where':where,'outFields':'*','returnGeometry':'true','outSR':4326,'f':'geojson', 'resultRecordCount':2000}
    r=requests.get(ENDPOINT,params=params,timeout=120,headers={'User-Agent':'AtlasEscolar/1.0 (educational geodata)'})
    r.raise_for_status()
    payload=r.json()
    if 'error' in payload: raise RuntimeError(f"Erro no serviço GIS: {payload['error']}")
    if payload.get('type')!='FeatureCollection': raise RuntimeError('Resposta não veio em GeoJSON')
    return payload['features']

# Fazer consulta por UF evita problemas com maiúsculas/minúsculas dos nomes municipais.
features=request("uf='SC'")
# O nome de município na camada deve ser conferido. Alguns projetos podem abranger mais de um município.
found=[]
for f in features:
    p=f.get('properties') or {}
    mun=nrm(p.get('municipio',''))
    if 'abelardo luz' not in mun: continue
    p['identificador_atlas']=nrm(p.get('nome_proje') or p.get('assentamento') or p.get('cd_sipra')).replace(' ','-')
    p['origem_dados']='INCRA / serviço IBAMA'
    found.append(f)
if not found:
    raise SystemExit('Nenhum assentamento localizado pelo filtro municipal. Verifique o campo municipio e a resposta da API; o arquivo anterior foi preservado.')
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps({'type':'FeatureCollection','features':found},ensure_ascii=False),encoding='utf-8')
print(f'Polígonos exportados: {len(found)} -> {OUT}')
print('Observação: conferir se assentamentos que atravessam limites municipais foram incluídos na consulta.')
