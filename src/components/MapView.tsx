'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap, Tooltip, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FriendLocation } from '@/app/dashboard/page'

const myIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:[25, 41],
  iconAnchor:[12, 41],
  popupAnchor:[1, -34],
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
  accuracy: number
  route: [number, number][]
  friends: FriendLocation[]
  focusLocation: [number, number] | null
  onClearFocus?: () => void
}

function MapController({ center, focusLocation, onClearFocus }: { center: [number, number], focusLocation:[number, number] | null, onClearFocus?: () => void }) {
  const map = useMap()
  const[initialSnap, setInitialSnap] = useState(false)

  useEffect(() => {
    if (!initialSnap) {
      map.flyTo(center, 16, { animate: true, duration: 1.5 })
      setInitialSnap(true)
    }
  },[center, initialSnap, map])

  useEffect(() => {
    if (focusLocation) {
      // Offset slightly to account for mobile bottom sheet
      map.flyTo(focusLocation, 15, { animate: true, duration: 1.5 })
    }
  }, [focusLocation, map])

  return (
    <button 
      onClick={() => {
        map.flyTo(center, 16, { animate: true, duration: 1.0 })
        if (onClearFocus) onClearFocus()
      }}
      // Moved button higher on mobile (bottom-24) to sit gracefully above the collapsed bottom sheet
      className="absolute bottom-24 md:bottom-8 right-4 md:right-auto md:left-6 z-[400] bg-white text-blue-600 p-3.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.15)] transition-transform hover:scale-105 flex items-center justify-center border border-gray-100"
      title="Recenter on me & Clear Route"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    </button>
  )
}

export default function MapView({ position, accuracy, route, friends, focusLocation, onClearFocus }: MapViewProps) {
  const [roadRoute, setRoadRoute] = useState<[number, number][] | null>(null)

  useEffect(() => {
    if (!focusLocation || !position) {
      setRoadRoute(null)
      return
    }

    const timer = setTimeout(async () => {
      try {
        const startLng = position[1]
        const startLat = position[0]
        const endLng = focusLocation[1]
        const endLat = focusLocation[0]

        const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`
        
        const res = await fetch(url)
        const data = await res.json()
        
        if (data.routes && data.routes.length > 0) {
          const coords = data.routes[0].geometry.coordinates.map((c: [number, number]) =>[c[1], c[0]])
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
        zoom={16} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false} // Hidden default controls for clean mobile aesthetic
      >
        <TileLayer 
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
        />
        
        <MapController center={position} focusLocation={focusLocation} onClearFocus={onClearFocus} />
        
        <Circle 
          center={position} 
          radius={accuracy} 
          pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, stroke: false }}
        />

        <Marker position={position} icon={myIcon}>
          <Tooltip direction="top" offset={[0, -30]} opacity={1} permanent className="font-bold text-blue-600 border-none shadow-md rounded-lg">
             You
          </Tooltip>
        </Marker>
        
        {friends && friends.map((friend) => (
          <Marker key={friend.uid} position={[friend.lat, friend.lng]} icon={friendIcon}>
             <Tooltip direction="top" offset={[0, -30]} opacity={0.9} permanent className="font-bold text-red-600 border-none shadow-md rounded-lg">
               {friend.name.split(' ')[0]}
             </Tooltip>
             <Popup>
                <div className="text-center p-1">
                  <p className="font-bold text-gray-800 text-sm">{friend.name}</p>
                  <p className="text-[10px] text-gray-500 uppercase mt-1 tracking-wider">Live GPS Location</p>
                </div>
             </Popup>
          </Marker>
        ))}

        {roadRoute && (
          <Polyline 
            positions={roadRoute} 
            color="#6366f1" // Indigo
            weight={6} 
            opacity={0.8}
            dashArray="10, 10" 
            lineCap="round"
            lineJoin="round"
          />
        )}
        
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