'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
    } else if (data.session) {
      router.push('/onboarding')
    } else {
      setMessage('Check your email to confirm your account, then log in.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 text-[var(--color-text)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl">StudySphere</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Create your account</p>
        </div>

        <form
          onSubmit={handleSignUp}
          className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6"
        >
          <div>
            <label className="mb-1.5 block text-xs text-[var(--color-muted)]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-primary)]"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-[var(--color-muted)]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-primary)]"
              required
            />
          </div>

          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
          {message && <p className="text-sm text-[var(--color-secondary)]">{message}</p>}

          <button
            type="submit"
            className="w-full rounded-full bg-[var(--color-primary)] py-2.5 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-90"
          >
            Sign up
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--color-secondary)] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
