import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { completeOnboarding } from './actions'
import SubmitButton from '../components/SubmitButton'

const inputClass =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-primary)]'
const labelClass = 'mb-1.5 block text-xs text-[var(--color-muted)]'

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
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 text-[var(--color-text)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl">Welcome to StudySphere</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Tell us a bit about your studies</p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}

        <form
          action={completeOnboarding}
          className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6"
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
            <p className="mt-1.5 text-xs text-[var(--color-muted)]">
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
