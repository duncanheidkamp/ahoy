'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { validateUsername } from '@/lib/utils'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsername(value)

    if (value) {
      const validation = validateUsername(value)
      setUsernameError(validation.error || '')
    } else {
      setUsernameError('')
    }
  }

  const checkUsernameAvailability = async (username: string): Promise<boolean> => {
    const { data } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single()

    return !data
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Validate username
      const validation = validateUsername(username)
      if (!validation.valid) {
        setUsernameError(validation.error!)
        setIsLoading(false)
        return
      }

      // Check username availability
      const isAvailable = await checkUsernameAvailability(username)
      if (!isAvailable) {
        setUsernameError('That username is already taken, matey!')
        setIsLoading(false)
        return
      }

      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (authError) {
        setError(authError.message)
        return
      }

      if (authData.user) {
        // Create user profile via API (uses service role to bypass RLS)
        const profileResponse = await fetch('/api/users/create-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: authData.user.id,
            username: username,
          }),
        })

        if (!profileResponse.ok) {
          const { error } = await profileResponse.json()
          setError(error || 'Failed to create profile. Please try again.')
          return
        }

        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      setError('Arrr, something went wrong!')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card variant="parchment" className="w-full max-w-md">
      <CardHeader className="text-center border-b-0 pb-0">
        {/* Ship wheel icon */}
        <div className="mx-auto mb-4 w-16 h-16 text-amber-600">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-amber-900" style={{ fontFamily: 'Georgia, serif' }}>
          Join the Crew
        </h1>
        <p className="text-amber-700 mt-1">Create your sailor identity</p>
      </CardHeader>

      <form onSubmit={handleSignup}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
              {error}
            </div>
          )}

          <Input
            label="Username"
            type="text"
            placeholder="captainjack"
            value={username}
            onChange={handleUsernameChange}
            error={usernameError}
            hint="Lowercase letters, numbers, and underscores only"
            required
          />

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
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isLoading}
            disabled={!!usernameError}
          >
            Come Aboard
          </Button>
        </CardContent>
      </form>

      <CardFooter className="justify-center border-t-0">
        <p className="text-sm text-amber-700">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-sky-700 hover:text-sky-600 underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
