import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function RequestsLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="flex items-center px-4 py-3">
          <Link
            href="/dashboard"
            className="p-2 -ml-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </Link>
          <h1
            className="text-white text-xl font-bold uppercase tracking-wide ml-2"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            Requests
          </h1>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
