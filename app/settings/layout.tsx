import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav, TopHeader } from '@/components/navigation'

export const dynamic = 'force-dynamic'

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 pb-20">
      <TopHeader title="Settings" username={profile?.username} />
      <main className="max-w-lg mx-auto">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
