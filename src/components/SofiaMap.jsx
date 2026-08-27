import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { CONFIG } from '../config/index.js'

// Pans/zooms the map to a focus point (e.g. the user's restaurant today). When focus
// is cleared the map keeps its current (default, zoomed-out) view.
function FocusController({ focus, zoom }) {
  const map = useMap()
  const lat = focus?.[0]
  const lng = focus?.[1]
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], zoom, { duration: 0.8 })
    }
  }, [lat, lng, zoom, map])
  return null
}

// Orange location pin as a divIcon — avoids the broken default Leaflet marker
// asset paths under bundlers, and matches the brand accent (spec §7).
function pinIcon(count, selected) {
  const badge = count > 0 ? `<span class="map-pin__count">${count}</span>` : ''
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin${selected ? ' map-pin--selected' : ''}">📍${badge}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  })
}

export default function SofiaMap({ locations, countsByLocation, selectedId, onSelect, focus }) {
  const center = [CONFIG.map.defaultLat, CONFIG.map.defaultLng]

  return (
    <MapContainer
      center={center}
      zoom={CONFIG.map.defaultZoom}
      minZoom={CONFIG.map.minZoom}
      maxZoom={CONFIG.map.maxZoom}
      scrollWheelZoom
      className="sofia-map"
    >
      <TileLayer url={CONFIG.map.tileUrl} attribution={CONFIG.map.tileAttribution} />
      <FocusController focus={focus} zoom={CONFIG.map.focusZoom || 15} />
      {locations.map((loc) => {
        if (loc.latitude == null || loc.longitude == null) return null
        const count = countsByLocation[loc.location_id] || 0
        return (
          <Marker
            key={loc.location_id}
            position={[Number(loc.latitude), Number(loc.longitude)]}
            icon={pinIcon(count, loc.location_id === selectedId)}
            eventHandlers={{ click: () => onSelect(loc.location_id) }}
          >
            <Popup>
              <strong>{loc.name}</strong>
              <br />
              {count > 0 ? `${count} служители` : 'Няма служители за деня'}
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
