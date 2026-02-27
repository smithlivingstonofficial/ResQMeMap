'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { auth } from '@/lib/firebase'
import { FriendLocation } from '@/app/dashboard/page'
import Link from 'next/link'
import { signOut } from 'firebase/auth'

interface SharePanelProps {
  onFriendApproved: () => void
  friends: FriendLocation[]
  myPosition: [number, number] | null
  onFocusFriend: (lat: number, lng: number) => void
  isMobileOpen: boolean
  setIsMobileOpen: (v: boolean) => void
  ghostMode: boolean
  toggleGhostMode: () => void
}

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); 
}

const formatDistance = (km: number) => {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

export default function SharePanel({ onFriendApproved, friends, myPosition, onFocusFriend, isMobileOpen, setIsMobileOpen, ghostMode, toggleGhostMode }: SharePanelProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const [tab, setTab] = useState<'console' | 'connect'>('console')

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
    const user = auth.currentUser
    if (!user) return

    const { data: targetUser } = await supabase.from('users').select('firebase_uid').ilike('email', email.trim()).maybeSingle()
    if (!targetUser || targetUser.firebase_uid === user.uid) { 
      alert("User not found or invalid.")
      setLoading(false); return 
    }

    const { data: existing } = await supabase.from('location_shares').select('id')
       .or(`and(owner_uid.eq.${targetUser.firebase_uid},viewer_uid.eq.${user.uid}),and(owner_uid.eq.${user.uid},viewer_uid.eq.${targetUser.firebase_uid})`)
       .maybeSingle()

    if (!existing) {
      await supabase.from('location_shares').insert({
        owner_uid: targetUser.firebase_uid, viewer_uid: user.uid, status: 'pending'
      })
      alert("Invitation sent!")
    } else {
      alert("Connection already pending or active.")
    }
    setEmail('')
    setLoading(false)
  }

  const handleApprove = async (shareId: string) => {
    await supabase.from('location_shares').update({ status: 'approved' }).eq('id', shareId)
    fetchRequests()
    onFriendApproved()
  }

  return (
    <div className={`
      flex flex-col h-full bg-gray-50/50 backdrop-blur-xl w-full
      /* Mobile Drawer Logic handled by parent, this just fills the container */
    `}>
      
      {/* 1. TOP HEADER (Logo + Profile) */}
      <div className="shrink-0 px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 leading-tight">TRACKER</h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Enterprise Console</p>
          </div>
        </div>
        
        {/* Mobile Close Button */}
        <button onClick={() => setIsMobileOpen(false)} className="md:hidden p-2 text-gray-400 hover:bg-gray-100 rounded-full">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* 2. STATS & SEARCH (Bento Grid) */}
      <div className="shrink-0 p-6 space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Active Units</span>
            <div className="flex items-end justify-between mt-1">
              <span className="text-2xl font-black text-gray-800">{friends.length}</span>
              <span className="w-2 h-2 rounded-full bg-green-500 mb-2 animate-pulse"></span>
            </div>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm flex flex-col cursor-pointer hover:border-blue-300 transition-colors" onClick={toggleGhostMode}>
            <span className="text-[10px] font-bold text-gray-400 uppercase">My Status</span>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-sm font-bold ${ghostMode ? 'text-gray-500' : 'text-blue-600'}`}>
                {ghostMode ? 'Hidden' : 'Broadcasting'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-gray-200 rounded-xl">
          <button 
            onClick={() => setTab('console')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${tab === 'console' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Console
          </button>
          <button 
            onClick={() => setTab('connect')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${tab === 'connect' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Connect
          </button>
        </div>
      </div>

      {/* 3. SCROLLABLE LIST AREA */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 scrollbar-hide">
        
        {tab === 'console' && (
          <>
            {requests.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-amber-500 uppercase mb-2">Pending Requests</p>
                {requests.map(req => (
                  <div key={req.id} className="bg-white p-2.5 rounded-xl border border-amber-100 flex items-center justify-between mb-2 last:mb-0">
                    <span className="text-xs font-bold text-gray-700">{req.users.name}</span>
                    <button onClick={() => handleApprove(req.id)} className="bg-gray-900 text-white text-[10px] px-3 py-1.5 rounded-lg font-bold">Approve</button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {friends.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <p className="text-sm font-bold text-gray-400">No active signals</p>
                </div>
              ) : (
                friends.map(friend => (
                  // LOGISTICS CARD STYLE
                  <div 
                    key={friend.uid}
                    onClick={() => onFocusFriend(friend.lat, friend.lng)}
                    className="group bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer relative overflow-hidden"
                  >
                    {/* Left Stripe Indicator */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 group-hover:bg-blue-600 transition-colors"></div>
                    
                    <div className="flex items-start justify-between pl-3">
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">{friend.name}</h3>
                        <p className="text-[10px] font-medium text-gray-400 mt-0.5">ID: {friend.uid.slice(0,8)}...</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-md text-[10px] font-bold border border-green-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                          LIVE
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between pl-3 border-t border-gray-100 pt-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Distance</span>
                        <span className="text-xs font-bold text-gray-700">
                          {myPosition ? formatDistance(getDistance(myPosition[0], myPosition[1], friend.lat, friend.lng)) : '...'}
                        </span>
                      </div>
                      
                      <div className="flex gap-2">
                        <button className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                        <button className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'connect' && (
          <div className="bg-white p-6 rounded-3xl border border-gray-200 text-center shadow-sm">
            <h3 className="text-sm font-bold text-gray-900">Add New Unit</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">Enter email to establish mutual link.</p>
            <form onSubmit={handleRequestLocation} className="space-y-3">
              <input 
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@address.com"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center"
              />
              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all text-xs uppercase tracking-wider">
                {loading ? 'Sending...' : 'Send Request'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 4. FOOTER (Logout / Profile) */}
      <div className="shrink-0 p-4 border-t border-gray-200 bg-white flex justify-between items-center">
        <Link href="/profile" className="text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors">
          Account Settings
        </Link>
        <button onClick={() => signOut(auth)} className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors">
          Log Out
        </button>
      </div>
    </div>
  )
}