// src/app/profile/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { auth } from '@/lib/firebase'
import { supabase } from '@/lib/supabase'

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  
  // State for Lists
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [approvedViewers, setApprovedViewers] = useState<any[]>([]) // People who can see ME
  const [trackingUsers, setTrackingUsers] = useState<any[]>([])     // People I can see

  const fetchRelationships = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)

    // 1. Get people who requested ME or who are tracking ME
    const { data: myViewers } = await supabase
      .from('location_shares')
      .select('id, status, viewer_uid, users!location_shares_viewer_uid_fkey(name, email)')
      .eq('owner_uid', user.uid)

    if (myViewers) {
      setPendingRequests(myViewers.filter(v => v.status === 'pending'))
      setApprovedViewers(myViewers.filter(v => v.status === 'approved'))
    }

    // 2. Get people I requested to track or am currently tracking
    const { data: myTracking } = await supabase
      .from('location_shares')
      .select('id, status, owner_uid, users!location_shares_owner_uid_fkey(name, email)')
      .eq('viewer_uid', user.uid)

    if (myTracking) {
      setTrackingUsers(myTracking)
    }

    setLoading(false)
  }

  useEffect(() => {
    // Only fetch when Firebase auth finishes initializing
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) fetchRelationships()
    })
    return () => unsubscribe()
  },[])

  // Actions
  const handleApprove = async (id: string) => {
    await supabase.from('location_shares').update({ status: 'approved' }).eq('id', id)
    fetchRelationships() // Refresh lists
  }

  const handleRemove = async (id: string) => {
    if (!confirm("Are you sure you want to remove this connection?")) return
    await supabase.from('location_shares').delete().eq('id', id)
    fetchRelationships() // Refresh lists
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-6 md:p-12 font-sans">
        <div className="max-w-4xl mx-auto">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Account & Permissions</h1>
            <Link 
              href="/dashboard"
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors"
            >
              &larr; Back to Map
            </Link>
          </div>

          {/* Profile Details Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8 flex items-center gap-6">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-3xl font-bold uppercase shadow-inner">
              {auth.currentUser?.email?.charAt(0) || '?'}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{auth.currentUser?.displayName || 'Anonymous User'}</h2>
              <p className="text-gray-500">{auth.currentUser?.email}</p>
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Location Services Active
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10 text-gray-500 font-medium animate-pulse">Loading connections...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* LEFT COLUMN: People seeing me */}
              <div className="space-y-8">
                
                {/* Pending Requests Received */}
                <section>
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                    Pending Requests ({pendingRequests.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingRequests.length === 0 && <p className="text-sm text-gray-500 italic">No pending requests.</p>}
                    {pendingRequests.map(req => (
                      <div key={req.id} className="bg-white p-4 rounded-xl shadow-sm border border-yellow-200 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-800">{req.users.name}</p>
                          <p className="text-xs text-gray-500">{req.users.email}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(req.id)} className="bg-green-500 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded font-medium">Approve</button>
                          <button onClick={() => handleRemove(req.id)} className="bg-red-50 hover:bg-red-100 text-red-600 text-xs px-3 py-1.5 rounded font-medium">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Approved Viewers */}
                <section>
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    Who Can See My Location ({approvedViewers.length})
                  </h3>
                  <div className="space-y-3">
                    {approvedViewers.length === 0 && <p className="text-sm text-gray-500 italic">Nobody is tracking you.</p>}
                    {approvedViewers.map(viewer => (
                      <div key={viewer.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-800">{viewer.users.name}</p>
                          <p className="text-xs text-gray-500">{viewer.users.email}</p>
                        </div>
                        <button onClick={() => handleRemove(viewer.id)} className="text-xs bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-600 px-3 py-1.5 rounded font-medium transition-colors">
                          Revoke Access
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

              </div>

              {/* RIGHT COLUMN: People I'm seeing */}
              <div className="space-y-8">
                
                {/* People I am Tracking */}
                <section>
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                    Friends I Am Tracking ({trackingUsers.length})
                  </h3>
                  <div className="space-y-3">
                    {trackingUsers.length === 0 && <p className="text-sm text-gray-500 italic">You aren't tracking anyone.</p>}
                    {trackingUsers.map(tracking => (
                      <div key={tracking.id} className={`bg-white p-4 rounded-xl shadow-sm border ${tracking.status === 'pending' ? 'border-gray-200 opacity-75' : 'border-blue-100'} flex justify-between items-center`}>
                        <div>
                          <p className="font-semibold text-gray-800">{tracking.users.name}</p>
                          <p className="text-xs text-gray-500">{tracking.users.email}</p>
                          {tracking.status === 'pending' && (
                            <span className="text-[10px] uppercase font-bold text-yellow-600 mt-1 block">Approval Pending</span>
                          )}
                        </div>
                        <button onClick={() => handleRemove(tracking.id)} className="text-xs bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-600 px-3 py-1.5 rounded font-medium transition-colors">
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}