'use client'

import { useState } from 'react'
import { startCardPayment, startEcocashPayment, checkPaymentStatus } from './upgrade-actions'

type Pending = { reference: string; instructions: string } | null

export default function UpgradePanel({ premiumUntil }: { premiumUntil: string | null }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Pending>(null)
  const [checking, setChecking] = useState(false)

  const isPremium = premiumUntil !== null && new Date(premiumUntil) > new Date()

  async function payWithCard() {
    setError('')
    setBusy(true)
    const result = await startCardPayment()
    setBusy(false)
    if ('error' in result || result.method !== 'card') {
      setError('error' in result ? result.error : 'Something went wrong. Please try again.')
      return
    }
    // Card payments redirect to Paynow's own hosted page to enter card details.
    window.location.href = result.redirectUrl
  }

  async function payWithEcocash(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const result = await startEcocashPayment(phone)
    setBusy(false)
    if ('error' in result || result.method !== 'ecocash') {
      setError('error' in result ? result.error : 'Something went wrong. Please try again.')
      return
    }
    setPending({ reference: result.reference, instructions: result.instructions })
  }

  async function refreshStatus() {
    if (!pending) return
    setChecking(true)
    setError('')
    const result = await checkPaymentStatus(pending.reference)
    setChecking(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.paid) {
      window.location.reload()
    } else {
      setError('Not confirmed yet. If you just approved it on your phone, wait a few seconds and try again.')
    }
  }

  if (isPremium) {
    return (
      <div className="mt-4 rounded-2xl border border-[var(--color-primary)] bg-[var(--color-primary)]/10 p-5">
        <p className="text-sm font-medium text-[var(--color-primary)]">Premium active</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Valid until {new Date(premiumUntil as string).toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
      <p className="text-sm font-medium text-[var(--color-text)]">Upgrade to Premium — $5/month</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Downloadable PDFs, longer summaries, unlimited generated study materials, a full study
        timetable with reminders, and progress tracking toward your exam date.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </p>
      )}

      {pending ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text)]">
            {pending.instructions}
          </p>
          <button
            type="button"
            onClick={refreshStatus}
            disabled={checking}
            className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-[var(--color-bg)] hover:opacity-90 disabled:opacity-60"
          >
            {checking ? 'Checking…' : "I've approved it — check status"}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <form onSubmit={payWithEcocash} className="flex flex-wrap gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="EcoCash number, e.g. 0771234567"
              className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-[var(--color-bg)] hover:opacity-90 disabled:opacity-60"
            >
              Pay with EcoCash
            </button>
          </form>

          <button
            type="button"
            onClick={payWithCard}
            disabled={busy}
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text)] hover:border-[var(--color-primary)] disabled:opacity-60"
          >
            Pay with Visa/Mastercard instead
          </button>
        </div>
      )}
    </div>
  )
}
