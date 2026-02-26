'use client'

import { onAuthStateChanged, User } from 'firebase/auth'
import { auth } from './firebase'

export function listenAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}