'use client'

import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    try {
      setLoading(true)
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      const user = result.user

      // Fix applied: Added { onConflict: 'firebase_uid' } to prevent 409 Conflict Error
      await supabase.from('users').upsert({
        firebase_uid: user.uid,
        name: user.displayName,
        email: user.email,
      }, { onConflict: 'firebase_uid' })

      router.replace('/dashboard')
    } catch (error) {
      console.error('Login failed:', error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex justify-center items-center bg-gray-100 p-4">
      <div className="bg-white p-10 rounded-2xl shadow-xl flex flex-col items-center w-full max-w-md text-center">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Realtime Tracker</h2>
        <p className="text-gray-500 mb-8">Sign in to broadcast and track live locations.</p>
        
        <button 
          onClick={handleLogin} 
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            'Continue with Google'
          )}
        </button>
      </div>
    </div>
  )
}