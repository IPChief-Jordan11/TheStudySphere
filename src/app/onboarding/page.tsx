import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { completeOnboarding } from './actions'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form action={completeOnboarding} className="w-full max-w-sm space-y-4 p-6">
        <h1 className="text-2xl font-bold">Tell us about yourself</h1>

        <input
          name="institution"
          placeholder="Institution (e.g. University of Zimbabwe)"
          className="w-full rounded border p-2"
          required
        />

        <input
          name="faculty"
          placeholder="Faculty (e.g. Engineering)"
          className="w-full rounded border p-2"
          required
        />

        <input
          name="moduleName"
          placeholder="First module (e.g. Calculus 101)"
          className="w-full rounded border p-2"
        />

        <button type="submit" className="w-full rounded bg-black p-2 text-white">
          Continue
        </button>
      </form>
    </div>
  )
}