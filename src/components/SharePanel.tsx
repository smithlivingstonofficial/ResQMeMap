'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { auth } from '@/lib/firebase'

export default function SharePanel({ onFriendApproved }: { onFriendApproved: () => void }) {
  const[email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const[requests, setRequests] = useState<any[]>([])
  const [message, setMessage] = useState('')

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

    // 1. Find User by Email
    const { data: targetUser } = await supabase
      .from('users')
      .select('firebase_uid')
      .eq('email', email)
      .maybeSingle()

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

    // FIX: Check if request already exists to avoid 409 Unique Constraint error
    const { data: existingRequest } = await supabase
      .from('location_shares')
      .select('id')
      .eq('owner_uid', targetUser.firebase_uid)
      .eq('viewer_uid', user.uid)
      .maybeSingle()

    if (existingRequest) {
      setMessage('A request has already been sent to this user.')
      setLoading(false)
      return
    }

    // 3. Insert Request
    const { error } = await supabase.from('location_shares').insert({
      owner_uid: targetUser.firebase_uid,
      viewer_uid: user.uid,
      status: 'pending'
    })

    if (error) setMessage('An error occurred. Please try again.')
    else setMessage('Request sent successfully!')
    
    setEmail('')
    setLoading(false)
  }

  const handleApprove = async (shareId: string) => {
    await supabase.from('location_shares').update({ status: 'approved' }).eq('id', shareId)
    fetchRequests()
  }

  return (
    <div className="bg-white border-l border-gray-200 w-full md:w-80 h-full flex flex-col shadow-lg z-10 relative">
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          Friends Network
        </h2>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="mb-8">
          <p className="text-sm text-gray-600 mb-2 font-medium">Request a Friend's Location</p>
          <form onSubmit={handleRequestLocation} className="flex flex-col gap-2">
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              {loading ? 'Sending...' : 'Send Request'}
            </button>
          </form>
          {message && <p className={`text-xs mt-2 font-medium ${message.includes('success') ? 'text-green-600' : 'text-red-500'}`}>{message}</p>}
        </div>

        <div>
          <p className="text-sm text-gray-600 mb-2 font-medium">Pending Requests ({requests.length})</p>
          {requests.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No pending requests.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm">
                  <p className="font-semibold text-gray-800">{req.users.name}</p>
                  <p className="text-gray-500 text-xs mb-2">{req.users.email}</p>
                  <button 
                    onClick={() => handleApprove(req.id)}
                    className="bg-green-500 text-white text-xs px-3 py-1.5 rounded-md font-medium hover:bg-green-600 w-full transition-colors"
                  >
                    Approve View
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