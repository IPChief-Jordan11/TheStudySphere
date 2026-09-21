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
      className={`rounded-full bg-[#E8A33D] text-sm font-medium text-[#12161C] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? pendingText : idleText}
    </button>
  )
}
