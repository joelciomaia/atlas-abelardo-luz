#!/usr/bin/env python3
"""Extrai o limite de Abelardo Luz da malha IBGE 2025; exige requests, geopandas."""
from pathlib import Path
import requests, zipfile, io, tempfile, geopandas as gpd

URL='https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/UFs/SC/SC_Municipios_2025.zip'
DEST=Path('public/geojson/abelardo-luz.geojson')
print('Baixando malha municipal IBGE 2025...')
r=requests.get(URL,timeout=180)
r.raise_for_status()
with tempfile.TemporaryDirectory() as temp:
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        z.extractall(temp)
    shp=list(Path(temp).rglob('*.shp'))
    if not shp: raise RuntimeError('Nenhum shapefile encontrado no ZIP')
    gdf=gpd.read_file(shp[0])
    col='CD_MUN' if 'CD_MUN' in gdf.columns else None
    if not col: raise RuntimeError('Campo CD_MUN não encontrado; confira esquema do IBGE')
    city=gdf[gdf[col].astype(str)=='4200101']
    if len(city)!=1: raise RuntimeError(f'Esperado um município; encontrados {len(city)}')
    city=city.to_crs('EPSG:4326')
    DEST.parent.mkdir(parents=True,exist_ok=True)
    city.to_file(DEST,driver='GeoJSON')
    print('Limite municipal real criado:',DEST)
