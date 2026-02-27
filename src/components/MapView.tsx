'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap, Tooltip, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FriendLocation } from '@/app/dashboard/page'

const myIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor:[12, 41],
  popupAnchor: [1, -34],
})

const friendIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:[25, 41],
  iconAnchor:[12, 41],
  popupAnchor:[1, -34],
})

interface MapViewProps {
  position:[number, number]
  route: [number, number][]
  friends: FriendLocation[]
  focusLocation: [number, number] | null
  onClearFocus?: () => void
}

function MapController({ center, focusLocation, onClearFocus }: { center: [number, number], focusLocation:[number, number] | null, onClearFocus?: () => void }) {
  const map = useMap()
  const[initialSnap, setInitialSnap] = useState(false)

  // 1. Center on user when map first loads
  useEffect(() => {
    if (!initialSnap) {
      map.flyTo(center, 15, { animate: true, duration: 1.5 })
      setInitialSnap(true)
    }
  }, [center, initialSnap, map])

  // 2. Fly to specific friend when clicked in the sidebar
  useEffect(() => {
    if (focusLocation) {
      // Zoom out slightly to see the route, then center on friend
      map.flyTo(focusLocation, 14, { animate: true, duration: 1.5 })
    }
  }, [focusLocation, map])

  return (
    <button 
      onClick={() => {
        map.flyTo(center, 16, { animate: true, duration: 1.0 })
        if (onClearFocus) onClearFocus() // Clears the road route
      }}
      className="absolute bottom-6 right-6 z-[400] bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center border-2 border-white"
      title="Recenter on me & Clear Route"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    </button>
  )
}

export default function MapView({ position, route, friends, focusLocation, onClearFocus }: MapViewProps) {
  const[roadRoute, setRoadRoute] = useState<[number, number][] | null>(null)

  // Fetch actual road driving directions from OSRM API
  useEffect(() => {
    if (!focusLocation || !position) {
      setRoadRoute(null)
      return
    }

    // Debounce to prevent API spam while driving/moving
    const timer = setTimeout(async () => {
      try {
        // OSRM expects: longitude,latitude
        const url = `https://router.project-osrm.org/route/v1/driving/${position[1]},${position[0]};${focusLocation[1]},${focusLocation[0]}?overview=full&geometries=geojson`
        const res = await fetch(url)
        const data = await res.json()
        
        if (data.routes && data.routes.length > 0) {
          // GeoJSON returns [lng, lat], but Leaflet requires [lat, lng]
          const coords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]])
          setRoadRoute(coords)
        }
      } catch (error) {
        console.error("OSRM Route Error:", error)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [focusLocation, position])

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer 
        center={position} 
        zoom={15} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer 
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
        />
        
        <MapController center={position} focusLocation={focusLocation} onClearFocus={onClearFocus} />
        
        {/* Your Location */}
        <Marker position={position} icon={myIcon}>
          <Tooltip direction="top" offset={[0, -30]} opacity={1} permanent>
            <span className="font-bold text-blue-600">You</span>
          </Tooltip>
        </Marker>
        
        {/* Friends Locations */}
        {friends && friends.map((friend) => (
          <Marker key={friend.uid} position={[friend.lat, friend.lng]} icon={friendIcon}>
             <Tooltip direction="top" offset={[0, -30]} opacity={0.9} permanent>
               <span className="font-bold text-red-600">{friend.name.split(' ')[0]}</span>
             </Tooltip>
             <Popup>
                <div className="text-center p-1">
                  <p className="font-bold text-gray-800 text-sm">{friend.name}</p>
                  <p className="text-[10px] text-gray-500 uppercase mt-1">Live GPS Location</p>
                </div>
             </Popup>
          </Marker>
        ))}

        {/* ROAD NAVIGATION ROUTE (Purple dashed line) */}
        {roadRoute && (
          <Polyline 
            positions={roadRoute} 
            color="#8b5cf6" // Purple
            weight={6} 
            opacity={0.8}
            dashArray="10, 10" // Makes it look like a planned route
            lineCap="round"
            lineJoin="round"
          />
        )}
        
        {/* Your Breadcrumb History Trace (Faded Blue line) */}
        {route && route.length > 1 && (
          <Polyline 
            positions={route} 
            color="#3b82f6" 
            weight={4} 
            opacity={0.4}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapContainer>
    </div>
  )
}