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
  const[position, setPosition] = useState<[number, number] | null>(null)
  const [accuracy, setAccuracy] = useState<number>(0)
  const [gpsWarning, setGpsWarning] = useState<string | null>(null)
  const [route, setRoute] = useState<[number, number][]>([])
  const [friendsLocations, setFriendsLocations] = useState<Record<string, FriendLocation>>({})
  
  const [ghostMode, setGhostMode] = useState(false)
  const ghostModeRef = useRef(false)
  
  const [focusLocation, setFocusLocation] = useState<[number, number] | null>(null)

  const fetchFriendsLocations = async (uid: string) => {
    const { data: shares } = await supabase
      .from('location_shares')
      .select('owner_uid, viewer_uid')
      .or(`owner_uid.eq.${uid},viewer_uid.eq.${uid}`) 
      .eq('status', 'approved')

    if (!shares || shares.length === 0) {
      setFriendsLocations({})
      return
    }

    const friendUids = Array.from(new Set(shares.map(s => s.owner_uid === uid ? s.viewer_uid : s.owner_uid)))

    const { data: friendsData } = await supabase
      .from('users')
      .select('firebase_uid, name, live_locations(latitude, longitude, updated_at)')
      .in('firebase_uid', friendUids)

    if (friendsData) {
      const formatted: Record<string, FriendLocation> = {}
      friendsData.forEach((friend: any) => {
        const loc = Array.isArray(friend.live_locations) ? friend.live_locations[0] : friend.live_locations
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
          const { latitude, longitude, accuracy: newAccuracy } = pos.coords
          setAccuracy(newAccuracy)

          if (newAccuracy > 100) {
            setGpsWarning(`Weak GPS (${Math.round(newAccuracy)}m). Move outside.`)
            if (position !== null) return; 
          } else {
            setGpsWarning(null) 
          }

          setPosition([latitude, longitude])
          setRoute((prevRoute) => [...prevRoute,[latitude, longitude]])

          if (!ghostModeRef.current && newAccuracy <= 100) {
            await supabase.from('live_locations').upsert({
              firebase_uid: user.uid,
              latitude,
              longitude,
              updated_at: new Date().toISOString()
            }, { onConflict: 'firebase_uid' })
          }
        },
        (err) => {
           console.warn("GPS Warning: ", err.message)
           setGpsWarning("GPS Access Denied or Unavailable.")
        },
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
                ...prev,[newData.firebase_uid]: {
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
      {/* FULLSCREEN WRAPPER */}
      <div className="relative h-[100dvh] w-full overflow-hidden bg-gray-100 font-sans">
        
        {/* FLOATING HEADER */}
        <header className="absolute top-0 left-0 right-0 z-[500] pointer-events-none p-4 flex flex-col gap-2 md:flex-row md:justify-between md:items-start">
          
          {/* Logo & Status Plate */}
          <div className="pointer-events-auto bg-white/90 backdrop-blur-md shadow-lg border border-white/40 rounded-2xl px-5 py-3 flex items-center gap-4 w-max">
            <div className={`w-3 h-3 rounded-full animate-pulse shadow-md ${ghostMode ? 'bg-gray-400 shadow-gray-300' : 'bg-green-500 shadow-green-400'}`}></div>
            <div>
              <h1 className="text-lg font-bold text-gray-800 leading-tight">Live Tracker</h1>
              {gpsWarning ? (
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">{gpsWarning}</p>
              ) : (
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">GPS Active</p>
              )}
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <button 
              onClick={toggleGhostMode}
              className={`whitespace-nowrap text-xs md:text-sm font-bold py-2.5 px-4 rounded-xl shadow-md transition-all border flex items-center gap-2 ${
                ghostMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-white/90 backdrop-blur-md text-gray-700 border-white/40'
              }`}
            >
              {ghostMode ? '👻 Ghost Mode ON' : '🌍 Public Mode'}
            </button>
            <Link href="/profile" className="whitespace-nowrap text-xs md:text-sm bg-white/90 backdrop-blur-md text-blue-600 font-bold py-2.5 px-4 rounded-xl shadow-md border border-white/40">
              Profile
            </Link>
            <button onClick={() => { signOut(auth); router.replace('/login') }} className="whitespace-nowrap text-xs md:text-sm bg-red-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hidden sm:block">
              Logout
            </button>
          </div>
        </header>

        {/* FULLSCREEN MAP */}
        <main className="absolute inset-0 z-0">
          {position ? (
            <MapView 
              position={position} 
              accuracy={accuracy} 
              route={route} 
              friends={Object.values(friendsLocations)} 
              focusLocation={focusLocation}
              onClearFocus={() => setFocusLocation(null)} 
            />
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-gray-50">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin shadow-lg"></div>
              <p className="text-gray-700 font-bold text-lg">Locating Satellites...</p>
              <p className="text-sm text-gray-500 max-w-[250px] text-center">Please ensure your device Location Services are turned on.</p>
            </div>
          )}
        </main>
        
        {/* RESPONSIVE FLOATING PANEL (Bottom Sheet on Mobile, Right Panel on PC) */}
        <SharePanel 
          myPosition={position}
          friends={Object.values(friendsLocations)}
          onFocusFriend={(lat, lng) => setFocusLocation([lat, lng])}
          onFriendApproved={() => {
            if (auth.currentUser) fetchFriendsLocations(auth.currentUser.uid)
          }} 
        />
        
      </div>
    </ProtectedRoute>
  )
}