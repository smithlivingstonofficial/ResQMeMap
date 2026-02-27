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
  
  const [pendingReceived, setPendingReceived] = useState<any[]>([])
  const[pendingSent, setPendingSent] = useState<any[]>([])
  const [mutualConnections, setMutualConnections] = useState<any[]>([])     

  const fetchRelationships = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)

    const { data: allShares } = await supabase
      .from('location_shares')
      .select(`
        id, status, owner_uid, viewer_uid, 
        owner:users!location_shares_owner_uid_fkey(name, email), 
        viewer:users!location_shares_viewer_uid_fkey(name, email)
      `)
      .or(`owner_uid.eq.${user.uid},viewer_uid.eq.${user.uid}`)

    if (allShares) {
      setPendingReceived(allShares.filter(s => s.status === 'pending' && s.owner_uid === user.uid))
      setPendingSent(allShares.filter(s => s.status === 'pending' && s.viewer_uid === user.uid))
      
      const approved = allShares.filter(s => s.status === 'approved').map(s => {
        const isOwner = s.owner_uid === user.uid
        return {
          id: s.id,
          friend: isOwner ? s.viewer : s.owner 
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
      <div className="min-h-[100dvh] bg-gray-50 font-sans pb-12">
        
        {/* STICKY MOBILE-APP HEADER */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between shadow-sm">
          <Link 
            href="/dashboard"
            className="flex items-center gap-2 text-blue-600 font-bold hover:text-blue-800 transition-colors bg-blue-50 px-3 py-1.5 rounded-xl"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"></path></svg>
            Map
          </Link>
          <h1 className="text-lg font-bold text-gray-800">Account & Privacy</h1>
          <div className="w-20"></div> {/* Invisible spacer to perfectly center the title */}
        </header>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-6 sm:mt-10">
          
          {/* PREMIUM PROFILE CARD */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-gray-100 mb-10 flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 text-white flex items-center justify-center text-3xl font-bold uppercase shadow-inner shrink-0">
              {auth.currentUser?.email?.charAt(0) || '?'}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-800 tracking-tight">{auth.currentUser?.displayName || 'Anonymous User'}</h2>
              <p className="text-gray-500 text-sm mt-1">{auth.currentUser?.email}</p>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-200 shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                Location Services Active
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
               <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin shadow-md"></div>
               <p className="text-gray-500 font-bold animate-pulse">Syncing connections...</p>
            </div>
          ) : (
            <div className="space-y-10">
              
              {/* MUTUAL CONNECTIONS SECTION */}
              <section>
                <div className="flex items-center justify-between mb-3 pl-2">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Active Mutual Connections
                  </h3>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">{mutualConnections.length}</span>
                </div>
                
                {mutualConnections.length === 0 ? (
                  <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center shadow-sm">
                    <p className="text-sm text-gray-500 italic">You aren't connected with anyone yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mutualConnections.map(conn => (
                      <div key={conn.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:shadow-md">
                        <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                           <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg shrink-0">
                             {conn.friend.name.charAt(0).toUpperCase()}
                           </div>
                           <div className="min-w-0">
                             <p className="font-bold text-gray-800 truncate">{conn.friend.name}</p>
                             <p className="text-xs text-gray-500 truncate">{conn.friend.email}</p>
                           </div>
                        </div>
                        <button onClick={() => handleDelete(conn.id, true)} className="w-full sm:w-auto text-xs bg-red-50 hover:bg-red-500 hover:text-white text-red-600 px-4 py-2.5 rounded-xl font-bold transition-colors">
                          Disconnect
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* PENDING INBOUND SECTION */}
              <section>
                <div className="flex items-center justify-between mb-3 pl-2">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                    Action Required (Received)
                  </h3>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">{pendingReceived.length}</span>
                </div>
                
                {pendingReceived.length === 0 ? (
                  <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center shadow-sm">
                    <p className="text-sm text-gray-500 italic">No incoming requests.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingReceived.map(req => (
                      <div key={req.id} className="bg-yellow-50/50 p-4 rounded-2xl shadow-sm border border-yellow-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-800 truncate">{req.viewer.name}</p>
                          <p className="text-xs text-gray-500 truncate">{req.viewer.email}</p>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button onClick={() => handleApprove(req.id)} className="flex-1 sm:flex-none bg-gray-900 hover:bg-black text-white text-xs px-5 py-2.5 rounded-xl font-bold shadow-md transition-colors">Approve</button>
                          <button onClick={() => handleDelete(req.id, false)} className="flex-1 sm:flex-none bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs px-5 py-2.5 rounded-xl font-bold transition-colors">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* PENDING OUTBOUND SECTION */}
              <section>
                <div className="flex items-center justify-between mb-3 pl-2">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                    Awaiting Approval (Sent)
                  </h3>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">{pendingSent.length}</span>
                </div>
                
                {pendingSent.length === 0 ? (
                  <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center shadow-sm">
                    <p className="text-sm text-gray-500 italic">No pending sent requests.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingSent.map(req => (
                      <div key={req.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 opacity-75">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-800 truncate">{req.owner.name}</p>
                          <p className="text-xs text-gray-500 truncate">{req.owner.email}</p>
                        </div>
                        <button onClick={() => handleDelete(req.id, false)} className="w-full sm:w-auto text-xs bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-600 px-4 py-2.5 rounded-xl font-bold transition-colors">
                          Cancel Request
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}