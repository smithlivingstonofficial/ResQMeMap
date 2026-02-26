'use client'

import { useEffect, useState, ReactNode } from 'react'
import { listenAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = listenAuth((user) => {
      if (!user) {
        router.push('/login')
      } else {
        setLoading(false)
      }
    })
    return () => unsub()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return <>{children}</>
}