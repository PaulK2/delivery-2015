import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  AttributionControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { CONFIG } from '../config/index.js'

// Leaflet's default attribution prefix embeds a small Ukrainian flag icon ahead of the
// "Leaflet" link. This is an internal operations tool (spec: stay politically neutral,
// avoid symbols that could spark unrelated discussion among staff) — so the map supplies
// its own prefix with just the required Leaflet credit, no flag, no replacement symbol.
const ATTRIBUTION_PREFIX =
  '<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>'

// True on phone-sized screens (matches the 900px desktop breakpoint in global.css).
function useIsMobile() {
  const query = '(max-width: 899px)'
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

// On mobile, single-finger dragging is disabled by default so a vertical swipe scrolls
// the page (and reaches today's employee list below the map) instead of panning the map.
// Panning is enabled only after a deliberate tap. On desktop, dragging is always on.
function DragGate({ mobile, active }) {
  const map = useMap()
  useEffect(() => {
    if (!mobile || active) map.dragging.enable()
    else map.dragging.disable()
  }, [mobile, active, map])
  return null
}

// Zooms the map OUT to the default view when the user taps empty map (not a marker).
// Leaflet fires the map's `click` only for background taps — marker taps are handled by
// the marker's own handler and don't bubble here — so a click here means "deselect".
function BackgroundClick({ onSelect }) {
  useMapEvents({
    click: () => onSelect(null),
  })
  return null
}

// Pans/zooms the map to a focus point (the selected restaurant — the user's shift for the
// viewed day, or any marker they tap). When focus is cleared — no shift that day, or the
// user tapped empty map — it flies back to the default zoomed-out view.
function FocusController({ focus, zoom, defaultCenter, defaultZoom }) {
  const map = useMap()
  const lat = focus?.[0]
  const lng = focus?.[1]
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], zoom, { duration: 0.8 })
    } else {
      map.flyTo(defaultCenter, defaultZoom, { duration: 0.8 })
    }
    // defaultCenter/defaultZoom are stable config constants — intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, zoom, map])
  return null
}

// Orange location pin as a divIcon — avoids the broken default Leaflet marker
// asset paths under bundlers, and matches the brand accent (spec §7).
function pinIcon(count, selected) {
  const badge = count > 0 ? `<span class="map-pin__count">${count}</span>` : ''
  // Radar-style pulse emanating from the pin tip on the focused/selected restaurant.
  const pulse = selected ? '<span class="map-pin__pulse" aria-hidden="true"></span>' : ''
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin${selected ? ' map-pin--selected' : ''}">${pulse}📍${badge}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  })
}

export default function SofiaMap({ locations, countsByLocation, selectedId, onSelect }) {
  const center = [CONFIG.map.defaultLat, CONFIG.map.defaultLng]
  const isMobile = useIsMobile()
  const [dragActive, setDragActive] = useState(false)

  // Only active, geocoded locations get a marker. Memoized so markers aren't recomputed
  // on every parent re-render (e.g. auto-refresh) unless the location set actually changes.
  const markerLocations = useMemo(
    () =>
      (locations || []).filter(
        (loc) => loc.active !== false && loc.latitude != null && loc.longitude != null
      ),
    [locations]
  )

  // The map zooms in on whichever location is selected (a tapped marker, or the user's
  // shift for the viewed day — the parent keeps selectedId in sync). Nothing selected →
  // the map stays/returns zoomed out.
  const focus = useMemo(() => {
    const sel = markerLocations.find((loc) => loc.location_id === selectedId)
    return sel ? [Number(sel.latitude), Number(sel.longitude)] : null
  }, [markerLocations, selectedId])

  return (
    <div className="sofia-map-wrap">
      <MapContainer
        center={center}
        zoom={CONFIG.map.defaultZoom}
        minZoom={CONFIG.map.minZoom}
        maxZoom={CONFIG.map.maxZoom}
        scrollWheelZoom
        attributionControl={false}
        className="sofia-map"
      >
        <AttributionControl position="bottomright" prefix={ATTRIBUTION_PREFIX} />
        <TileLayer url={CONFIG.map.tileUrl} attribution={CONFIG.map.tileAttribution} />
        <DragGate mobile={isMobile} active={dragActive} />
        <BackgroundClick onSelect={onSelect} />
        <FocusController
          focus={focus}
          zoom={CONFIG.map.focusZoom || 15}
          defaultCenter={center}
          defaultZoom={CONFIG.map.defaultZoom}
        />
        {markerLocations.map((loc) => {
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

      {isMobile && !dragActive ? (
        <button
          type="button"
          className="map-drag-hint"
          onClick={() => setDragActive(true)}
        >
          Докоснете картата, за да я преместите
        </button>
      ) : null}
    </div>
  )
}
