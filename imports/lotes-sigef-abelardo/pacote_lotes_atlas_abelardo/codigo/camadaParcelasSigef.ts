/** Camada experimental de PARCELAS SIGEF (nao equivale a lotes oficiais).
 * Uso: const remover = await instalarParcelasSigef(map);
 * Disponibilize os GeoJSON em public/geojson/ via script baixar_parcelas_sigef.py.
 */
export async function instalarParcelasSigef(map: google.maps.Map) {
  const arquivos = [
    '/geojson/parcelas_sigef_publico_candidatas.geojson',
    '/geojson/parcelas_sigef_privado_candidatas.geojson',
  ];
  const camadas: google.maps.Data[] = [];
  const listeners: google.maps.MapsEventListener[] = [];
  const janela = new google.maps.InfoWindow();
  for (const url of arquivos) {
    const resposta = await fetch(url);
    if (!resposta.ok) {
      console.warn('GeoJSON ainda nao existe:', url);
      continue;
    }
    const geojson = await resposta.json();
    if (geojson.type !== 'FeatureCollection') continue;
    const camada = new google.maps.Data({ map: map.getZoom()! >= 13 ? map : null });
    camada.addGeoJson(geojson);
    camada.setStyle({fillColor:'#eab308',fillOpacity:0.12,strokeColor:'#eab308',strokeWeight:1.25});
    listeners.push(camada.addListener('mouseover', (ev: google.maps.Data.MouseEvent) => {
      camada.overrideStyle(ev.feature, {fillOpacity:0.3,strokeWeight:2.5});
    }));
    listeners.push(camada.addListener('mouseout', (ev: google.maps.Data.MouseEvent) => {
      camada.revertStyle(ev.feature);
    }));
    listeners.push(camada.addListener('click', (ev: google.maps.Data.MouseEvent) => {
      const c = document.createElement('div');
      c.style.maxWidth = '300px';
      const titulo=document.createElement('strong');
      titulo.textContent='Parcela rural SIGEF';
      const codigo=document.createElement('p');
      codigo.textContent='Codigo SIGEF: '+String(ev.feature.getProperty('id_sigef') || 'indisponivel');
      const situacao=document.createElement('p');
      situacao.textContent='Situacao: '+String(ev.feature.getProperty('situacao') || 'nao informada');
      const aviso=document.createElement('small');
      aviso.textContent='Parcela candidata: NAO confirmada como lote interno de assentamento.';
      c.append(titulo,codigo,situacao,aviso);
      janela.setContent(c);
      janela.setPosition(ev.latLng!);
      janela.open(map);
    }));
    camadas.push(camada);
  }
  listeners.push(map.addListener('zoom_changed', () => {
    const habilitado = (map.getZoom() ?? 0) >= 13;
    camadas.forEach(c => c.setMap(habilitado ? map : null));
  }));
  return () => {
    listeners.forEach(l => l.remove());
    camadas.forEach(c => c.setMap(null));
    janela.close();
  };
}
