'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
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
  const [accuracy, setAccuracy] = useState<number>(0)
  const [route, setRoute] = useState<[number, number][]>([])
  const [friendsLocations, setFriendsLocations] = useState<Record<string, FriendLocation>>({})
  const [ghostMode, setGhostMode] = useState(false)
  const ghostModeRef = useRef(false)
  const [focusLocation, setFocusLocation] = useState<[number, number] | null>(null)
  
  // Mobile drawer state
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)

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

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition([pos.coords.latitude, pos.coords.longitude])
          setAccuracy(pos.coords.accuracy)
        },
        () => console.log("Waiting for precision..."),
        { enableHighAccuracy: false, maximumAge: Infinity, timeout: 5000 }
      );

      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude, accuracy: newAccuracy } = pos.coords
          setAccuracy(newAccuracy)
          setPosition([latitude, longitude])
          
          if (newAccuracy <= 150) {
            setRoute((prevRoute) => [...prevRoute, [latitude, longitude]])
          }

          if (!ghostModeRef.current && newAccuracy <= 150) {
            await supabase.from('live_locations').upsert({
              firebase_uid: user.uid,
              latitude,
              longitude,
              updated_at: new Date().toISOString()
            }, { onConflict: 'firebase_uid' })
          }
        },
        (err) => console.warn(err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
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
      {/* 
          MASTER LAYOUT: SPLIT SCREEN 
          - Desktop: Sidebar Fixed Left, Map Fills Right
          - Mobile: Map Fullscreen, Sidebar is Bottom Drawer
      */}
      <div className="flex h-[100dvh] w-full overflow-hidden bg-gray-50 font-sans">
        
        {/* LEFT CONSOLE (Visible on Desktop, Hidden on Mobile until toggled) */}
        <div className={`
            fixed inset-0 z-[1000] md:static md:z-0
            md:flex md:w-[420px] md:h-full md:border-r md:border-gray-200/80 md:bg-gray-50/50 md:backdrop-blur-xl
            transition-transform duration-300
            ${isMobileDrawerOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
        `}>
          <SharePanel 
            myPosition={position}
            friends={Object.values(friendsLocations)}
            onFocusFriend={(lat, lng) => {
              setFocusLocation([lat, lng])
              setIsMobileDrawerOpen(false) // Close drawer on mobile after clicking
            }}
            onFriendApproved={() => {
               if (auth.currentUser) fetchFriendsLocations(auth.currentUser.uid)
            }} 
            isMobileOpen={isMobileDrawerOpen}
            setIsMobileOpen={setIsMobileDrawerOpen}
            ghostMode={ghostMode}
            toggleGhostMode={toggleGhostMode}
          />
        </div>

        {/* RIGHT MAP AREA */}
        <div className="flex-1 relative h-full w-full bg-slate-100">
          
          {/* MOBILE HEADER (Only visible on small screens) */}
          <div className="md:hidden absolute top-4 left-4 right-4 z-[500] flex justify-between items-center pointer-events-none">
             <div className="pointer-events-auto bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-white/50 flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${ghostMode ? 'bg-gray-400' : 'bg-green-500 animate-pulse'}`}></div>
                <span className="text-xs font-bold text-gray-800 tracking-wider">LIVE</span>
             </div>
             {/* Mobile Drawer Toggle */}
             <button 
                onClick={() => setIsMobileDrawerOpen(true)}
                className="pointer-events-auto bg-white p-2.5 rounded-full shadow-lg text-gray-700"
             >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
             </button>
          </div>

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
            <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50/50 backdrop-blur-sm">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 font-bold text-gray-500 animate-pulse">Initializing Map System...</p>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}