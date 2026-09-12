// frontend/lib/map.js
const MapView = (() => {
  let map;
  let layers = {
    sats: L.layerGroup(),
    ground: L.layerGroup(),
    isl: L.layerGroup(),
    route: L.layerGroup(),
  };
  let groundMarkers = {};
  let initialized = false;

  function init(containerId) {
    if (initialized) return;
    map = L.map(containerId, {
      worldCopyJump: true,
      minNativeZoom: 5,
      maxNativeZoom: 8,
      maxZoom: 8,
      attributionControl: false,
    }).setView([70, 60], 3);
    
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 8,
    }).addTo(map);
    
    const attribution = L.control({ position: 'bottomright' });
    
    attribution.onAdd = function () {
      const div = L.DomUtil.create('div', 'custom-attribution');
      div.innerHTML = '© OpenStreetMap contributors';
      return div;
    };
    
    attribution.addTo(map);

    Object.values(layers).forEach(l => l.addTo(map));
    initialized = true;
  }

  function xyzToLatLon(x, y, z) {
    const r = Math.sqrt(x*x + y*y + z*z);
    return [
      Math.asin(z / r) * 180 / Math.PI,
      Math.atan2(y, x) * 180 / Math.PI,
    ];
  }

  function renderGround(sites) {
    layers.ground.clearLayers();
    groundMarkers = {};
    sites.forEach(g => {
      const color = g.role === 'gateway' ? '#d29922' : '#3fb950';
      const marker = L.circleMarker([g.lat_deg, g.lon_deg], {
        radius: 7, color, fillColor: color, fillOpacity: 0.9, weight: 2,
      }).bindTooltip(`${g.id} · ${g.name}`, { direction: 'top' });
      marker.addTo(layers.ground);
      groundMarkers[g.id] = marker;
    });
  }

  /**
   * state — массив satellites
   * routeIds — set id спутников, входящих в маршрут
   * isolatedIds — set id спутников без ISL-связей
   */
  function renderSatellites(state, routeIds = new Set(), isolatedIds = new Set()) {
    layers.sats.clearLayers();
    state.forEach(s => {
      if (!s.active) {
        // Отказ — рисуем красным, но полупрозрачным (неактивен)
        const [lat, lon] = xyzToLatLon(s.x_km, s.y_km, s.z_km);
        L.circleMarker([lat, lon], {
          radius: 2, color: '#f85149', fillColor: '#f85149',
          fillOpacity: 0.4, weight: 1,
        }).bindTooltip(`${s.id} · ОТКАЗ`, { direction: 'top' })
          .addTo(layers.sats);
        return;
      }
      const [lat, lon] = xyzToLatLon(s.x_km, s.y_km, s.z_km);
      let color = '#4c8dff';
      let label = s.id;
      if (routeIds.has(s.id)) { color = '#3fb950'; label += ' · маршрут'; }
      else if (isolatedIds.has(s.id)) { color = '#db6d28'; label += ' · изолирован'; }
      L.circleMarker([lat, lon], {
        radius: routeIds.has(s.id) ? 5 : 3,
        color, fillColor: color, fillOpacity: 0.9, weight: 1,
      }).bindTooltip(label, { direction: 'top' })
        .addTo(layers.sats);
    });
  }

  function renderISL(edges, satellites, groundSites) {
    layers.isl.clearLayers();
    const posById = {};
    satellites.forEach(s => {
      if (s.active) posById[s.id] = xyzToLatLon(s.x_km, s.y_km, s.z_km);
    });
    groundSites.forEach(g => {
      posById[g.id] = [g.lat_deg, g.lon_deg];
    });

    edges.forEach(([a, b]) => {
      if (!posById[a] || !posById[b]) return;
      L.polyline([posById[a], posById[b]], {
        color: 'rgba(76,141,255,.2)', weight: 1, interactive: false,
      }).addTo(layers.isl);
    });
  }

  function renderRoute(route, satellites, groundSites) {
    layers.route.clearLayers();
    if (!route || route.length < 2) return;

    const posById = {};
    satellites.forEach(s => {
      if (s.active) posById[s.id] = xyzToLatLon(s.x_km, s.y_km, s.z_km);
    });
    groundSites.forEach(g => {
      posById[g.id] = [g.lat_deg, g.lon_deg];
    });

    const pts = route.map(id => posById[id]).filter(Boolean);
    if (pts.length < 2) return;

    L.polyline(pts, { color: '#3fb950', weight: 3, opacity: 0.9 })
      .addTo(layers.route);

    pts.forEach((p, i) => {
      L.marker(p, {
        icon: L.divIcon({
          className: 'route-label',
          html: `<span style="background:#3fb950;color:#000;padding:1px 4px;border-radius:3px;font-size:10px;font-weight:600;">${route[i]}</span>`,
          iconSize: [40, 14], iconAnchor: [20, 7],
        }),
        interactive: false,
      }).addTo(layers.route);
    });
  }

  /** Подсветить клиента без связи */
  function markClientState(clientId, hasRoute) {
    const marker = groundMarkers[clientId];
    if (!marker) return;
    if (hasRoute) {
      marker.setStyle({ color: '#3fb950', fillColor: '#3fb950' });
      marker.setTooltipContent(`${clientId} · связь есть`);
    } else {
      marker.setStyle({ color: '#f85149', fillColor: '#f85149' });
      marker.setTooltipContent(`${clientId} · нет маршрута`);
    }
  }

  function invalidate() { if (map) map.invalidateSize(); }

  return { init, renderGround, renderSatellites, renderISL, renderRoute, markClientState, invalidate };
})();