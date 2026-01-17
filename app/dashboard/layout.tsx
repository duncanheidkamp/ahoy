import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NotificationPrompt } from '@/components/notifications/notification-prompt'
import { ServiceWorkerRegister } from '@/components/notifications/service-worker-register'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <ServiceWorkerRegister />
      {children}
      <NotificationPrompt />
    </div>
  )
}
