'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { auth } from '@/lib/firebase'
import { FriendLocation } from '@/app/dashboard/page'

interface SharePanelProps {
  onFriendApproved: () => void
  friends: FriendLocation[]
  myPosition: [number, number] | null
  onFocusFriend: (lat: number, lng: number) => void
}

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); 
}

const formatDistance = (km: number) => {
  if (km < 1) return `${Math.round(km * 1000)} m away`
  return `${km.toFixed(1)} km away`
}

const timeAgo = (dateString: string) => {
  if (!dateString) return 'Unknown'
  const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export default function SharePanel({ onFriendApproved, friends, myPosition, onFocusFriend }: SharePanelProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  },[])

  const fetchRequests = async () => {
    const user = auth.currentUser
    if (!user) return
    const { data } = await supabase
      .from('location_shares')
      .select('id, viewer_uid, status, users!location_shares_viewer_uid_fkey(name, email)')
      .eq('owner_uid', user.uid)
      .eq('status', 'pending')
    if (data) setRequests(data)
  }

  useEffect(() => {
    fetchRequests()
    const sub = supabase.channel('shares')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_shares' }, () => {
        fetchRequests()
        onFriendApproved()
      }).subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [onFriendApproved])

  const handleRequestLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const user = auth.currentUser
    if (!user) return

    const cleanEmail = email.trim()
    const { data: targetUser } = await supabase.from('users').select('firebase_uid').ilike('email', cleanEmail).maybeSingle()

    if (!targetUser) {
      setMessage('User not found. Ensure they have logged in before.')
      setLoading(false)
      return
    }

    if (targetUser.firebase_uid === user.uid) {
      setMessage('You cannot request yourself.')
      setLoading(false)
      return
    }

    // Check if any connection exists in ANY direction
    const { data: existingRequest } = await supabase.from('location_shares')
      .select('id')
      .or(`and(owner_uid.eq.${targetUser.firebase_uid},viewer_uid.eq.${user.uid}),and(owner_uid.eq.${user.uid},viewer_uid.eq.${targetUser.firebase_uid})`)
      .maybeSingle()

    if (existingRequest) {
      setMessage('A connection or request already exists.')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('location_shares').insert({
      owner_uid: targetUser.firebase_uid, viewer_uid: user.uid, status: 'pending'
    })

    if (error) setMessage('An error occurred.')
    else setMessage('Request sent successfully!')
    
    setEmail('')
    setLoading(false)
  }

  const handleApprove = async (shareId: string) => {
    // A single approved row now grants Mutual Tracking instantly!
    await supabase.from('location_shares').update({ status: 'approved' }).eq('id', shareId)
    fetchRequests()
    onFriendApproved()
  }

  return (
    <div className="bg-white border-l border-gray-200 w-full md:w-80 lg:w-96 h-full flex flex-col shadow-lg z-10 relative">
      <div className="p-4 border-b border-gray-100 bg-gray-50 shrink-0">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          Mutual Connections
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        <div>
          <p className="text-sm text-gray-800 font-bold mb-3 flex items-center justify-between">
            Active on Map
            <span className="bg-blue-100 text-blue-700 py-0.5 px-2 rounded-full text-xs">{friends.length}</span>
          </p>
          {friends.length === 0 ? (
            <p className="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-gray-100">No friends are currently broadcasting.</p>
          ) : (
            <div className="space-y-2">
              {friends.map(friend => {
                const distanceKm = myPosition ? getDistance(myPosition[0], myPosition[1], friend.lat, friend.lng) : null;
                return (
                  <div key={friend.uid} onClick={() => onFocusFriend(friend.lat, friend.lng)} className="group bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition-all flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 text-red-500 flex items-center justify-center font-bold text-lg shrink-0">
                      {friend.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{friend.name}</p>
                      <div className="flex justify-between items-center mt-0.5">
                        <span className="text-xs text-gray-500">{distanceKm !== null ? formatDistance(distanceKm) : 'Calculating...'}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${timeAgo(friend.updated_at) === 'Just now' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {timeAgo(friend.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <hr className="border-gray-100" />

        <div>
          <p className="text-sm text-gray-800 font-bold mb-3">Request New Connection</p>
          <form onSubmit={handleRequestLocation} className="flex flex-col gap-2 mb-4">
            <input 
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors">
              {loading ? 'Sending...' : 'Send Request'}
            </button>
          </form>
          {message && <p className={`text-xs font-medium mb-4 ${message.includes('success') ? 'text-green-600' : 'text-red-500'}`}>{message}</p>}

          <p className="text-sm text-gray-600 mb-2 font-medium flex justify-between">
            Pending Inbound <span>({requests.length})</span>
          </p>
          {requests.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No pending requests.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm">
                  <p className="font-semibold text-gray-800">{req.users.name}</p>
                  <p className="text-gray-500 text-xs mb-3">{req.users.email}</p>
                  <button onClick={() => handleApprove(req.id)} className="bg-gray-800 text-white text-xs px-3 py-2 rounded-md font-medium hover:bg-black w-full transition-colors">
                    Approve Mutual Tracking
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}