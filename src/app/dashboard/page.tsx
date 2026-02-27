// src/app/dashboard/page.tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { supabase } from '@/lib/supabase'
import { auth } from '@/lib/firebase'
import SharePanel from '@/components/SharePanel'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

export interface FriendLocation {
  uid: string
  name: string
  lat: number
  lng: number
  updated_at: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [route, setRoute] = useState<[number, number][]>([])
  const [friendsLocations, setFriendsLocations] = useState<Record<string, FriendLocation>>({})
  
  const [ghostMode, setGhostMode] = useState(false)
  const ghostModeRef = useRef(false)
  const [focusLocation, setFocusLocation] = useState<[number, number] | null>(null)

  const fetchFriendsLocations = async (uid: string) => {
    // FIX: Get ALL approved mutual connections involving you
    const { data: shares } = await supabase
      .from('location_shares')
      .select('owner_uid, viewer_uid')
      .or(`owner_uid.eq.${uid},viewer_uid.eq.${uid}`) // If you are owner OR viewer
      .eq('status', 'approved')

    if (!shares || shares.length === 0) {
      setFriendsLocations({})
      return
    }

    // Extract the UID of the OTHER person in each connection
    const friendUids = Array.from(new Set(shares.map(s => s.owner_uid === uid ? s.viewer_uid : s.owner_uid)))

    const { data: friendsData } = await supabase
      .from('users')
      .select('firebase_uid, name, live_locations(latitude, longitude, updated_at)')
      .in('firebase_uid', friendUids)

    if (friendsData) {
      const formatted: Record<string, FriendLocation> = {}
      friendsData.forEach((friend: any) => {
        const loc = Array.isArray(friend.live_locations) 
          ? friend.live_locations[0] 
          : friend.live_locations

        if (loc && loc.latitude !== undefined && loc.longitude !== undefined) {
          formatted[friend.firebase_uid] = {
            uid: friend.firebase_uid,
            name: friend.name,
            lat: loc.latitude,
            lng: loc.longitude,
            updated_at: loc.updated_at
          }
        }
      })
      setFriendsLocations(formatted)
    }
  }

  const toggleGhostMode = async () => {
    const newVal = !ghostMode
    setGhostMode(newVal)
    ghostModeRef.current = newVal

    const user = auth.currentUser
    if (!user) return

    if (newVal) {
      await supabase.from('live_locations').delete().eq('firebase_uid', user.uid)
    } else if (position) {
      await supabase.from('live_locations').upsert({
        firebase_uid: user.uid,
        latitude: position[0],
        longitude: position[1],
        updated_at: new Date().toISOString()
      }, { onConflict: 'firebase_uid' })
    }
  }

  useEffect(() => {
    let watchId: number;
    let sub: any;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      await supabase.from('users').upsert({
        firebase_uid: user.uid,
        name: user.displayName || 'Anonymous',
        email: user.email || '',
      }, { onConflict: 'firebase_uid' });

      fetchFriendsLocations(user.uid);

      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords
          setPosition([latitude, longitude])
          setRoute((prevRoute) => [...prevRoute,[latitude, longitude]])

          if (!ghostModeRef.current) {
            await supabase.from('live_locations').upsert({
              firebase_uid: user.uid,
              latitude,
              longitude,
              updated_at: new Date().toISOString()
            }, { onConflict: 'firebase_uid' })
          }
        },
        (err) => console.warn("GPS Warning: ", err.message),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      )

      sub = supabase.channel('public:live_locations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_locations' }, (payload: any) => {
          if (payload.eventType === 'DELETE') {
             setFriendsLocations(prev => {
                const updated = { ...prev }
                delete updated[payload.old.firebase_uid]
                return updated
             })
             return;
          }
          const newData = payload.new
          setFriendsLocations(prev => {
            if (prev[newData.firebase_uid]) {
              return {
                ...prev,
                [newData.firebase_uid]: {
                  ...prev[newData.firebase_uid],
                  lat: newData.latitude,
                  lng: newData.longitude,
                  updated_at: newData.updated_at
                }
              }
            }
            return prev
          })
        }).subscribe()
    });

    return () => {
      unsubscribe();
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (sub) supabase.removeChannel(sub);
    }
  },[])

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
        <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center z-10 relative">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full animate-pulse shadow-md ${ghostMode ? 'bg-gray-400 shadow-gray-300' : 'bg-green-500 shadow-green-400'}`}></div>
            <h1 className="text-xl font-bold text-gray-800 hidden md:block">Realtime Tracker</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleGhostMode}
              className={`text-sm font-semibold py-2 px-4 rounded-lg transition-colors border flex items-center gap-2 ${
                ghostMode ? 'bg-gray-800 text-white border-gray-900 hover:bg-gray-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
            >
              {ghostMode ? '👻 Ghost Mode ON' : '🌍 Public Mode'}
            </button>

            <Link href="/profile" className="text-sm bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold py-2 px-4 rounded-lg transition-colors border border-blue-200">
              Profile
            </Link>
            <button onClick={() => { signOut(auth); router.replace('/login') }} className="text-sm bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 px-4 rounded-lg transition-colors border border-red-200 hidden sm:block">
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 relative flex flex-col md:flex-row z-0 h-full overflow-hidden">
          <div className="flex-1 relative">
            {position ? (
              <MapView 
                position={position} 
                route={route} 
                friends={Object.values(friendsLocations)} 
                focusLocation={focusLocation}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium">Acquiring High-Precision GPS Signal...</p>
              </div>
            )}
          </div>
          
          <SharePanel 
            myPosition={position}
            friends={Object.values(friendsLocations)}
            onFocusFriend={(lat, lng) => setFocusLocation([lat, lng])}
            onFriendApproved={() => {
              if (auth.currentUser) fetchFriendsLocations(auth.currentUser.uid)
            }} 
          />
        </main>
      </div>
    </ProtectedRoute>
  )
}