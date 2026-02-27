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
  
  // Mobile Panel State
  const [isOpen, setIsOpen] = useState(false)

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
  },[onFriendApproved])

  const handleRequestLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const user = auth.currentUser
    if (!user) return

    const cleanEmail = email.trim()
    const { data: targetUser } = await supabase.from('users').select('firebase_uid').ilike('email', cleanEmail).maybeSingle()

    if (!targetUser) {
      setMessage('User not found. Check email.')
      setLoading(false)
      return
    }

    if (targetUser.firebase_uid === user.uid) {
      setMessage('You cannot request yourself.')
      setLoading(false)
      return
    }

    const { data: existingRequest } = await supabase.from('location_shares')
      .select('id')
      .or(`and(owner_uid.eq.${targetUser.firebase_uid},viewer_uid.eq.${user.uid}),and(owner_uid.eq.${user.uid},viewer_uid.eq.${targetUser.firebase_uid})`)
      .maybeSingle()

    if (existingRequest) {
      setMessage('A connection already exists.')
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
    await supabase.from('location_shares').update({ status: 'approved' }).eq('id', shareId)
    fetchRequests()
    onFriendApproved()
  }

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-[450] transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Responsive Panel Container */}
      <div 
        className={`
          fixed bottom-0 left-0 right-0 z-[500] 
          md:absolute md:top-24 md:bottom-6 md:left-auto md:right-4 md:w-96 
          flex flex-col bg-white/95 md:bg-white/80 backdrop-blur-2xl 
          rounded-t-3xl md:rounded-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-2xl border border-white/40
          transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${isOpen ? 'translate-y-0 h-[80dvh]' : 'translate-y-[calc(100%-4.5rem)] md:translate-y-0 md:h-auto'}
        `}
      >
        {/* Header / Mobile Drag Handle */}
        <div 
          onClick={() => setIsOpen(!isOpen)} 
          className="shrink-0 p-5 border-b border-gray-100 cursor-pointer md:cursor-default"
        >
          {/* Mobile Pill */}
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
          
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path></svg>
              Friends Network
            </h2>
            
            {/* Mobile Icon State */}
            <div className="md:hidden w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold shadow-inner">
              {friends.length}
            </div>
            
            <div className="hidden md:flex bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-xs font-bold shadow-sm">
              {friends.length} Active
            </div>
          </div>
        </div>

        {/* Scrollable Content (Hidden on mobile if panel is closed) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-8 scrollbar-hide pb-20 md:pb-5">
          
          {/* Active Friends List */}
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-3">Live Map Radar</p>
            {friends.length === 0 ? (
              <p className="text-sm text-gray-400 italic bg-gray-50/50 p-4 rounded-xl border border-gray-100">No friends are currently broadcasting.</p>
            ) : (
              <div className="space-y-3">
                {friends.map(friend => {
                  const distanceKm = myPosition ? getDistance(myPosition[0], myPosition[1], friend.lat, friend.lng) : null;
                  return (
                    <div 
                      key={friend.uid} 
                      onClick={() => {
                        onFocusFriend(friend.lat, friend.lng);
                        if(window.innerWidth < 768) setIsOpen(false); // Auto-close drawer on mobile when routing!
                      }} 
                      className="group bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition-all flex items-center gap-4"
                    >
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 text-white flex items-center justify-center font-bold text-xl shrink-0 shadow-inner">
                        {friend.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-base truncate">{friend.name}</p>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{distanceKm !== null ? formatDistance(distanceKm) : 'Calc...'}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${timeAgo(friend.updated_at) === 'Just now' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
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

          <hr className="border-gray-200" />

          {/* Connect & Requests */}
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-3">Add Connection</p>
            <form onSubmit={handleRequestLocation} className="flex flex-col gap-3 mb-6">
              <input 
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="friend@example.com"
                className="w-full px-4 py-3 bg-gray-50 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
              />
              <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold py-3 rounded-xl hover:shadow-lg disabled:opacity-50 transition-all">
                {loading ? 'Sending Request...' : 'Send Request'}
              </button>
            </form>
            {message && <p className={`text-xs font-bold mb-6 text-center ${message.includes('success') ? 'text-green-500' : 'text-red-500'}`}>{message}</p>}

            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-3 flex justify-between">
              Pending Inbound 
              <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-md">{requests.length}</span>
            </p>
            {requests.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No pending requests.</p>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div key={req.id} className="bg-yellow-50/50 border border-yellow-200 p-4 rounded-2xl">
                    <p className="font-bold text-gray-800">{req.users.name}</p>
                    <p className="text-gray-500 text-xs mb-3">{req.users.email}</p>
                    <button onClick={() => handleApprove(req.id)} className="bg-gray-900 text-white text-xs px-4 py-2.5 rounded-lg font-bold hover:bg-black w-full shadow-md transition-colors">
                      Approve & Connect
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}