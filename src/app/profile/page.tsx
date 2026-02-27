'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { auth } from '@/lib/firebase'
import { supabase } from '@/lib/supabase'

export default function ProfilePage() {
  const router = useRouter()
  const[loading, setLoading] = useState(true)
  
  const [pendingReceived, setPendingReceived] = useState<any[]>([])
  const [pendingSent, setPendingSent] = useState<any[]>([])
  const[mutualConnections, setMutualConnections] = useState<any[]>([])     

  const fetchRelationships = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)

    // Fetch ALL connections involving this user (both sent and received)
    const { data: allShares } = await supabase
      .from('location_shares')
      .select(`
        id, status, owner_uid, viewer_uid, 
        owner:users!location_shares_owner_uid_fkey(name, email), 
        viewer:users!location_shares_viewer_uid_fkey(name, email)
      `)
      .or(`owner_uid.eq.${user.uid},viewer_uid.eq.${user.uid}`)

    if (allShares) {
      // 1. Pending requests sent TO me (I am the owner)
      setPendingReceived(allShares.filter(s => s.status === 'pending' && s.owner_uid === user.uid))
      
      // 2. Pending requests I SENT (I am the viewer)
      setPendingSent(allShares.filter(s => s.status === 'pending' && s.viewer_uid === user.uid))
      
      // 3. Approved Mutual Connections
      const approved = allShares.filter(s => s.status === 'approved').map(s => {
        const isOwner = s.owner_uid === user.uid
        return {
          id: s.id,
          friend: isOwner ? s.viewer : s.owner // Extract the OTHER person's details
        }
      })
      setMutualConnections(approved)
    }

    setLoading(false)
  }

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) fetchRelationships()
    })
    return () => unsubscribe()
  },[])

  const handleApprove = async (id: string) => {
    await supabase.from('location_shares').update({ status: 'approved' }).eq('id', id)
    fetchRelationships()
  }

  const handleDelete = async (id: string, isMutual: boolean) => {
    const msg = isMutual 
      ? "Remove this connection? Neither of you will be able to see each other's location." 
      : "Delete this request?"
    
    if (!confirm(msg)) return
    await supabase.from('location_shares').delete().eq('id', id)
    fetchRelationships()
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-6 md:p-12 font-sans">
        <div className="max-w-4xl mx-auto">
          
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Account & Privacy</h1>
            <Link 
              href="/dashboard"
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors"
            >
              &larr; Back to Map
            </Link>
          </div>

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
              
              <div className="space-y-8">
                {/* Pending Inbound */}
                <section>
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                    Requests to Connect ({pendingReceived.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingReceived.length === 0 && <p className="text-sm text-gray-500 italic">No incoming requests.</p>}
                    {pendingReceived.map(req => (
                      <div key={req.id} className="bg-white p-4 rounded-xl shadow-sm border border-yellow-200 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-800">{req.viewer.name}</p>
                          <p className="text-xs text-gray-500">{req.viewer.email}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(req.id)} className="bg-green-500 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded font-medium">Approve</button>
                          <button onClick={() => handleDelete(req.id, false)} className="bg-red-50 hover:bg-red-100 text-red-600 text-xs px-3 py-1.5 rounded font-medium">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Pending Outbound */}
                <section>
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gray-300"></span>
                    Requests You Sent ({pendingSent.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingSent.length === 0 && <p className="text-sm text-gray-500 italic">No pending sent requests.</p>}
                    {pendingSent.map(req => (
                      <div key={req.id} className="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-800">{req.owner.name}</p>
                          <p className="text-xs text-gray-500">{req.owner.email}</p>
                          <span className="text-[10px] uppercase font-bold text-yellow-600 mt-1 block">Awaiting Their Approval</span>
                        </div>
                        <button onClick={() => handleDelete(req.id, false)} className="text-xs bg-gray-200 hover:bg-red-100 hover:text-red-600 text-gray-600 px-3 py-1.5 rounded font-medium transition-colors">
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* MUTUAL CONNECTIONS */}
              <div className="space-y-8">
                <section>
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                    Active Mutual Connections ({mutualConnections.length})
                  </h3>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                    <p className="text-xs text-blue-800">
                      Tracking is mutual. If you remove a user from this list, they will no longer see your location, and you will no longer see theirs.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {mutualConnections.length === 0 && <p className="text-sm text-gray-500 italic">You aren't connected with anyone.</p>}
                    {mutualConnections.map(conn => (
                      <div key={conn.id} className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-800">{conn.friend.name}</p>
                          <p className="text-xs text-gray-500">{conn.friend.email}</p>
                        </div>
                        <button onClick={() => handleDelete(conn.id, true)} className="text-xs bg-red-50 hover:bg-red-600 hover:text-white text-red-600 px-3 py-1.5 rounded font-medium transition-colors border border-red-100">
                          Disconnect
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