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
  const[accuracy, setAccuracy] = useState<number>(0)
  
  const[gpsWarning, setGpsWarning] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null) 
  
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

      if (!navigator.geolocation) {
        setLocationError("Your browser does not support Geolocation.")
        return;
      }

      // STEP 1: Quick fetch just to get the map on screen immediately (allows Wi-Fi/Cellular data)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition([pos.coords.latitude, pos.coords.longitude])
          setAccuracy(pos.coords.accuracy)
        },
        (err) => console.log("Quick fetch skipped, waiting for high accuracy..."),
        { enableHighAccuracy: false, maximumAge: Infinity, timeout: 5000 }
      );

      // STEP 2: Start the continuous high-accuracy tracker
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          setLocationError(null)
          
          const { latitude, longitude, accuracy: newAccuracy } = pos.coords
          setAccuracy(newAccuracy)

          // Always set position so the map loads and moves
          setPosition([latitude, longitude])
          
          // Only add to breadcrumb route if it's somewhat accurate
          if (newAccuracy <= 150) {
            setRoute((prevRoute) =>[...prevRoute,[latitude, longitude]])
            setGpsWarning(null)
          } else {
            setGpsWarning(`Weak GPS (${Math.round(newAccuracy)}m). Try moving near a window.`)
          }

          // Only broadcast to friends if the accuracy is good and we aren't a ghost
          if (!ghostModeRef.current && newAccuracy <= 150) {
            await supabase.from('live_locations').upsert({
              firebase_uid: user.uid,
              latitude,
              longitude,
              updated_at: new Date().toISOString()
            }, { onConflict: 'firebase_uid' })
          }
        },
        (err) => {
           console.warn("GPS Error: ", err.code, err.message)
           if (err.code === 1) { 
             setLocationError("Location access denied. Please check your phone settings.")
           } else if (err.code === 2) { 
             setLocationError("GPS signal unavailable. Ensure your phone's Location Service is ON.")
           } else if (err.code === 3) { 
             setGpsWarning("Searching for satellites... Please wait.")
           }
        },
        { 
          enableHighAccuracy: true, 
          maximumAge: 10000, // Allow 10-second old cached locations to prevent infinite loading indoors
          timeout: 27000     // Give the phone 27 seconds to find a satellite before throwing a timeout
        }
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
      <div className="relative h-dvh w-full overflow-hidden bg-gray-100 font-sans">
        
        <header className="absolute top-0 left-0 right-0 z-500 pointer-events-none p-4 flex flex-col gap-2 md:flex-row md:justify-between md:items-start">
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
          </div>
        </header>

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
            <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-gray-50">
              {locationError ? (
                <div className="text-center max-w-sm">
                  <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                  </div>
                  <p className="text-gray-800 font-bold text-xl mb-2">Location Blocked</p>
                  <p className="text-sm text-gray-600 mb-6">{locationError}</p>
                  
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-left">
                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">How to Fix on Mobile:</p>
                    <ul className="text-xs text-blue-600 list-disc pl-4 space-y-1">
                      <li><b>iPhone:</b> Settings &gt; Safari &gt; Location &gt; Set to "Allow"</li>
                      <li><b>Android:</b> Tap the lock icon next to the URL &gt; Permissions &gt; Allow Location</li>
                    </ul>
                  </div>
                  
                  <button onClick={() => window.location.reload()} className="mt-6 bg-gray-900 text-white font-bold py-3 px-6 rounded-xl w-full">
                    Refresh Page
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin shadow-lg mb-4"></div>
                  <p className="text-gray-700 font-bold text-lg">Locating Satellites...</p>
                  <p className="text-sm text-gray-500 max-w-[250px] text-center mt-2">
                    {gpsWarning || 'Please allow location permissions when your browser prompts you.'}
                  </p>
                </>
              )}
            </div>
          )}
        </main>
        
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