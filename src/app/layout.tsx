import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Realtime Map Tracker',
  description: 'Realtime location tracking and sharing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-800 bg-gray-50">
        {children}
      </body>
    </html>
  )
}