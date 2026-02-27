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
  position: [number, number]
  route: [number, number][]
  friends: FriendLocation[]
  focusLocation: [number, number] | null
}

function MapController({ center, focusLocation }: { center: [number, number], focusLocation: [number, number] | null }) {
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
      map.flyTo(focusLocation, 17, { animate: true, duration: 1.5 })
    }
  }, [focusLocation, map])

  return (
    <button 
      onClick={() => map.flyTo(center, 16, { animate: true, duration: 1.0 })}
      className="absolute bottom-6 right-6 z-[400] bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center border-2 border-white"
      title="Recenter on me"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    </button>
  )
}

export default function MapView({ position, route, friends, focusLocation }: MapViewProps) {
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
        
        <MapController center={position} focusLocation={focusLocation} />
        
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
        
        {/* Route Tracing */}
        {route && route.length > 1 && (
          <Polyline 
            positions={route} 
            color="#3b82f6" 
            weight={4} 
            opacity={0.6}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapContainer>
    </div>
  )
}