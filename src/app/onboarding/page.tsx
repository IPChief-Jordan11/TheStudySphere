import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { completeOnboarding } from './actions'
import SubmitButton from '../components/SubmitButton'

const inputClass =
  'w-full rounded-lg border border-[#2D3540] bg-[#12161C] px-3 py-2 text-sm text-[#ECE6D6] outline-none transition-colors focus:border-[#5B9DF5]'
const labelClass = 'mb-1.5 block text-xs text-[#8B93A0]'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#12161C] px-4 text-[#ECE6D6]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl">Welcome to StudySphere</h1>
          <p className="mt-1 text-sm text-[#8B93A0]">Tell us a bit about your studies</p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-[#E86D5F] bg-[#E86D5F]/10 px-3 py-2 text-sm text-[#E86D5F]">
            {error}
          </p>
        )}

        <form
          action={completeOnboarding}
          className="space-y-4 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-6"
        >
          <div>
            <label className={labelClass}>Your name</label>
            <input
              name="name"
              placeholder="e.g. Jordan"
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Institution</label>
            <input
              name="institution"
              placeholder="e.g. University of Zimbabwe"
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Faculty</label>
            <input
              name="faculty"
              placeholder="e.g. Engineering"
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Your modules (optional)</label>
            <textarea
              name="moduleNames"
              placeholder={'e.g.\nCalculus 101\nObject Oriented Programming\nThermodynamics'}
              rows={4}
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-[#8B93A0]">
              One module per line. You can add more later from the dashboard.
            </p>
          </div>

          <SubmitButton
            idleText="Continue"
            pendingText="Saving…"
            className="w-full py-2.5"
          />
        </form>
      </div>
    </div>
  )
}
