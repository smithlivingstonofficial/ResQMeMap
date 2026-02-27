'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FriendLocation } from '@/app/dashboard/page'

// --- CUSTOM MARKERS ---
const myDivIcon = L.divIcon({
  className: 'user-marker-pulse',
  html: `<div class="user-radar"></div><div class="user-radar"></div><div class="user-core"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
})

const createFriendIcon = (name: string) => L.divIcon({
  className: 'friend-marker-premium',
  html: `
    <div class="friend-avatar-box">
      ${name.charAt(0).toUpperCase()}
      <div class="friend-live-dot"></div>
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 42], 
  popupAnchor: [0, -45]
})

interface MapViewProps {
  position: [number, number]
  accuracy: number
  route: [number, number][]
  friends: FriendLocation[]
  focusLocation: [number, number] | null
  onClearFocus?: () => void
}

function MapController({ center, focusLocation, onClearFocus }: any) {
  const map = useMap()
  const [initialSnap, setInitialSnap] = useState(false)

  useEffect(() => {
    if (!initialSnap) {
      map.flyTo(center, 18, { animate: true, duration: 2.5 })
      setInitialSnap(true)
    }
  }, [center, initialSnap, map])

  useEffect(() => {
    if (focusLocation) {
      // We can safely zoom to 20 now because maxNativeZoom handles the scaling
      map.flyTo(focusLocation, 20, { animate: true, duration: 1.5 })
    }
  }, [focusLocation, map])

  return (
    <div className="absolute bottom-8 right-4 z-[1000]">
      <button 
        onClick={() => { map.flyTo(center, 20, { animate: true }); if (onClearFocus) onClearFocus(); }}
        className="bg-white text-gray-800 w-12 h-12 rounded-2xl shadow-xl hover:scale-105 transition-transform border border-gray-100 flex items-center justify-center group"
      >
        <svg className="w-6 h-6 text-blue-600 group-hover:text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  )
}

export default function MapView({ position, accuracy, route, friends, focusLocation, onClearFocus }: MapViewProps) {
  const [roadRoute, setRoadRoute] = useState<[number, number][] | null>(null)
  const [activeLayer, setActiveLayer] = useState('standard')
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false)

  useEffect(() => {
    if (!focusLocation || !position) { setRoadRoute(null); return }
    const timer = setTimeout(async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${position[1]},${position[0]};${focusLocation[1]},${focusLocation[0]}?overview=full&geometries=geojson`
        const res = await fetch(url)
        const data = await res.json()
        if (data.routes?.[0]) setRoadRoute(data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]))
      } catch (e) { console.error(e) }
    }, 1000)
    return () => clearTimeout(timer)
  }, [focusLocation, position])

  const getCurrentIcon = () => {
    if (activeLayer === 'satellite') return (
      <div className="w-full h-full rounded-xl overflow-hidden relative border-2 border-white">
        <div className="absolute inset-0 bg-[url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0')] bg-cover"></div>
      </div>
    )
    if (activeLayer === 'dark') return (
      <div className="w-full h-full rounded-xl bg-gray-800 border-2 border-gray-600 flex items-center justify-center">
        <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      </div>
    )
    return (
      <div className="w-full h-full rounded-xl bg-gray-100 border-2 border-white flex items-center justify-center relative overflow-hidden">
         <div className="absolute top-0 bottom-0 left-1/2 w-2 bg-white rotate-12 transform scale-125 border-l border-r border-gray-300"></div>
         <div className="absolute top-1/2 left-0 right-0 h-2 bg-white -rotate-12 transform scale-125 border-t border-b border-gray-300"></div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative z-0 bg-gray-100">
      
      {/* LAYER SWITCHER - TOP RIGHT */}
      <div className="absolute top-20 right-4 z-[1000] flex flex-col items-end gap-2">
        
        {isLayerMenuOpen && (
          <div className="bg-white/90 backdrop-blur-xl p-2 rounded-2xl shadow-2xl border border-white/50 flex flex-col gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
            <button 
              onClick={() => { setActiveLayer('standard'); setIsLayerMenuOpen(false); }}
              className={`flex items-center gap-3 p-2 rounded-xl transition-all w-32 ${activeLayer === 'standard' ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-100'}`}
            >
              <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-300 relative overflow-hidden shadow-sm">
                 <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-white border-l border-gray-300"></div>
              </div>
              <span className="text-xs font-bold text-gray-700">Default</span>
            </button>

            <button 
              onClick={() => { setActiveLayer('satellite'); setIsLayerMenuOpen(false); }}
              className={`flex items-center gap-3 p-2 rounded-xl transition-all w-32 ${activeLayer === 'satellite' ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-100'}`}
            >
              <div className="w-8 h-8 rounded-lg border border-green-900 overflow-hidden relative shadow-sm">
                 <div className="absolute inset-0 bg-[url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0')] bg-cover"></div>
              </div>
              <span className="text-xs font-bold text-gray-700">Satellite</span>
            </button>

            <button 
              onClick={() => { setActiveLayer('dark'); setIsLayerMenuOpen(false); }}
              className={`flex items-center gap-3 p-2 rounded-xl transition-all w-32 ${activeLayer === 'dark' ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-100'}`}
            >
              <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-600 flex items-center justify-center shadow-sm">
                 <svg className="w-4 h-4 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              </div>
              <span className="text-xs font-bold text-gray-700">Night</span>
            </button>
          </div>
        )}

        <button 
          onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
          className="w-12 h-12 p-1 bg-white rounded-2xl shadow-xl hover:scale-105 transition-transform border border-white/50"
        >
          {getCurrentIcon()}
        </button>
      </div>

      <MapContainer 
        center={position} 
        zoom={18} 
        style={{ height: '100%', width: '100%' }} 
        zoomControl={false}
        maxZoom={18} // Allow users to zoom in really close
      >
        {/* 
           FIX APPLIED HERE:
           We set maxNativeZoom to 18 (Satellite) or 19 (Map).
           We set maxZoom to 22 (Digital Zoom).
           This forces Leaflet to stretch the images instead of showing gray empty tiles.
        */}

        {activeLayer === 'standard' && (
          <TileLayer 
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
            attribution="&copy; CARTO" 
            maxNativeZoom={19} 
            maxZoom={22} 
          />
        )}
        
        {activeLayer === 'dark' && (
          <TileLayer 
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
            attribution="&copy; CARTO" 
            maxNativeZoom={19} 
            maxZoom={22}
          />
        )}
        
        {activeLayer === 'satellite' && (
          <>
            <TileLayer 
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" 
              attribution="&copy; Esri" 
              maxNativeZoom={17} // Safe limit for rural areas to prevent gray screens
              maxZoom={22}
            />
            {/* Hybrid Labels Overlay */}
            <TileLayer 
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png" 
              maxNativeZoom={19} 
              maxZoom={22}
              zIndex={10} 
            />
          </>
        )}

        <MapController center={position} focusLocation={focusLocation} onClearFocus={onClearFocus} />
        
        <Circle center={position} radius={accuracy} pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, stroke: false }} />
        
        <Marker position={position} icon={myDivIcon} zIndexOffset={100} />
        
        {friends.map((friend) => (
          <Marker key={friend.uid} position={[friend.lat, friend.lng]} icon={createFriendIcon(friend.name)} zIndexOffset={50}>
             <Tooltip direction="bottom" offset={[0, 10]} opacity={1} className="font-bold border-none shadow-xl rounded-lg text-xs py-1.5 px-3 text-gray-600">
               {friend.name}
             </Tooltip>
          </Marker>
        ))}
        
        {roadRoute && <Polyline positions={roadRoute} color={activeLayer === 'dark' ? '#818cf8' : '#6366f1'} weight={6} opacity={0.9} dashArray="12, 12" />}
      </MapContainer>
    </div>
  )
}