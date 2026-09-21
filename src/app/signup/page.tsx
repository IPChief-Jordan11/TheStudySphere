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
    <div className="flex min-h-screen items-center justify-center bg-[#12161C] px-4 text-[#ECE6D6]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl">StudySphere</h1>
          <p className="mt-1 text-sm text-[#8B93A0]">Create your account</p>
        </div>

        <form
          onSubmit={handleSignUp}
          className="space-y-4 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-6"
        >
          <div>
            <label className="mb-1.5 block text-xs text-[#8B93A0]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#2D3540] bg-[#12161C] px-3 py-2 text-sm text-[#ECE6D6] outline-none transition-colors focus:border-[#E8A33D]"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-[#8B93A0]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#2D3540] bg-[#12161C] px-3 py-2 text-sm text-[#ECE6D6] outline-none transition-colors focus:border-[#E8A33D]"
              required
            />
          </div>

          {error && <p className="text-sm text-[#E86D5F]">{error}</p>}
          {message && <p className="text-sm text-[#5FB3A3]">{message}</p>}

          <button
            type="submit"
            className="w-full rounded-full bg-[#E8A33D] py-2.5 text-sm font-medium text-[#12161C] transition-opacity hover:opacity-90"
          >
            Sign up
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8B93A0]">
          Already have an account?{' '}
          <Link href="/login" className="text-[#5FB3A3] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
