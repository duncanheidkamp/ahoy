'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Arrr, something went wrong!')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card variant="parchment" className="w-full max-w-md">
      <CardHeader className="text-center border-b-0 pb-0">
        {/* Anchor icon */}
        <div className="mx-auto mb-4 w-16 h-16 text-amber-600">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C10.9 2 10 2.9 10 4C10 4.74 10.4 5.39 11 5.73V7H6C5.45 7 5 7.45 5 8V9H7V8H11V11H8C7.45 11 7 11.45 7 12V13H9V12H11V20.27C9.68 19.85 8.54 19 7.68 17.88C7.23 17.32 6.45 17.23 5.89 17.68C5.33 18.13 5.24 18.91 5.69 19.47C7.03 21.17 8.89 22.35 11 22.8V23H13V22.8C15.11 22.35 16.97 21.17 18.31 19.47C18.76 18.91 18.67 18.13 18.11 17.68C17.55 17.23 16.77 17.32 16.32 17.88C15.46 19 14.32 19.85 13 20.27V12H15V13H17V12C17 11.45 16.55 11 16 11H13V8H17V9H19V8C19 7.45 18.55 7 18 7H13V5.73C13.6 5.39 14 4.74 14 4C14 2.9 13.1 2 12 2Z"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-amber-900" style={{ fontFamily: 'Georgia, serif' }}>
          Welcome Aboard
        </h1>
        <p className="text-amber-700 mt-1">Sign in to your ship</p>
      </CardHeader>

      <form onSubmit={handleLogin}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
              {error}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            placeholder="captain@ship.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="Your secret code"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isLoading}
          >
            Set Sail
          </Button>
        </CardContent>
      </form>

      <CardFooter className="justify-center border-t-0">
        <p className="text-sm text-amber-700">
          New to these waters?{' '}
          <Link href="/signup" className="font-semibold text-sky-700 hover:text-sky-600 underline">
            Join the crew
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
