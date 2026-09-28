'use client'

import { useFormStatus } from 'react-dom'

export default function SubmitButton({
  idleText,
  pendingText,
  className = '',
}: {
  idleText: string
  pendingText: string
  className?: string
}) {
  // pending is true while the parent form's Server Action is running.
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-full bg-[var(--color-primary)] text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? pendingText : idleText}
    </button>
  )
}
