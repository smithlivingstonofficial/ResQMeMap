'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { signOut, onAuthStateChanged } from 'firebase/auth' // Imported onAuthStateChanged
import ProtectedRoute from '@/components/ProtectedRoute'
import { supabase } from '@/lib/supabase'
import { auth } from '@/lib/firebase'
import SharePanel from '@/components/SharePanel'
import Link from 'next/link'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

export interface FriendLocation {
  uid: string
  name: string
  lat: number
  lng: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [route, setRoute] = useState<[number, number][]>([])
  const [friendsLocations, setFriendsLocations] = useState<Record<string, FriendLocation>>({})

  const fetchFriendsLocations = async (uid: string) => {
    const { data: shares } = await supabase
      .from('location_shares')
      .select('owner_uid')
      .eq('viewer_uid', uid)
      .eq('status', 'approved')

    if (!shares || shares.length === 0) return

    const ownerUids = shares.map(s => s.owner_uid)
    const { data: friendsData } = await supabase
      .from('users')
      .select('firebase_uid, name, live_locations(latitude, longitude)')
      .in('firebase_uid', ownerUids)

    if (friendsData) {
      const formatted: Record<string, FriendLocation> = {}
      friendsData.forEach((friend: any) => {
        if (friend.live_locations && friend.live_locations.length > 0) {
          formatted[friend.firebase_uid] = {
            uid: friend.firebase_uid,
            name: friend.name,
            lat: friend.live_locations[0].latitude,
            lng: friend.live_locations[0].longitude
          }
        }
      })
      setFriendsLocations(formatted)
    }
  }

  useEffect(() => {
    let watchId: number;
    let sub: any;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      // FIX: Ensure the user exists in the DB *before* we try to write their location
      // This stops the 'live_locations' Foreign Key 409 Error
      await supabase.from('users').upsert({
        firebase_uid: user.uid,
        name: user.displayName || 'Anonymous',
        email: user.email || '',
      }, { onConflict: 'firebase_uid' });

      // Now safe to fetch friends
      fetchFriendsLocations(user.uid);

      // Now safe to start watching location
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords
          setPosition([latitude, longitude])
          setRoute((prevRoute) => [...prevRoute, [latitude, longitude]])

          await supabase.from('live_locations').upsert({
            firebase_uid: user.uid,
            latitude,
            longitude,
          }, { onConflict: 'firebase_uid' })
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      )

      // Start Realtime Subscription
      sub = supabase.channel('public:live_locations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_locations' }, (payload: any) => {
          const newData = payload.new
          setFriendsLocations(prev => {
            if (prev[newData.firebase_uid]) {
              return {
                ...prev,[newData.firebase_uid]: {
                  ...prev[newData.firebase_uid],
                  lat: newData.latitude,
                  lng: newData.longitude
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
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-green-400 shadow-md"></div>
            <h1 className="text-xl font-bold text-gray-800">Live Dashboard</h1>
          </div>
          
          {/* UPDATED HEADER ACTIONS */}
          <div className="flex items-center gap-4">
            <Link 
              href="/profile"
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg transition-colors border border-gray-300"
            >
              My Profile
            </Link>
            <button 
              onClick={() => { signOut(auth); router.replace('/login') }}
              className="text-sm bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 px-4 rounded-lg transition-colors border border-red-200"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 relative flex flex-col md:flex-row z-0 h-full overflow-hidden">
          <div className="flex-1 relative">
            {position ? (
              <MapView position={position} route={route} friends={Object.values(friendsLocations)} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium">Acquiring GPS Signal...</p>
              </div>
            )}
          </div>
          
          <SharePanel onFriendApproved={() => {
            if (auth.currentUser) fetchFriendsLocations(auth.currentUser.uid)
          }} />
        </main>
      </div>
    </ProtectedRoute>
  )
}