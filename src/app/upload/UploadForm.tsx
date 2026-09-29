'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { finalizeUpload } from './actions'

// Supabase's bucket allows up to 50MB, but OCR still has to run within a time
// limit, so uploads are capped lower for now.
const MAX_FILE_BYTES = 10 * 1024 * 1024

type Module = { id: string; name: string }

export default function UploadForm({
  modules,
  userId,
  initialModuleId,
}: {
  modules: Module[]
  userId: string
  initialModuleId?: string
}) {
  const router = useRouter()
  const [moduleId, setModuleId] = useState(initialModuleId ?? modules[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [isPastPaper, setIsPastPaper] = useState(false)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing'>('idle')
  const [error, setError] = useState('')

  const busy = status !== 'idle'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!moduleId) {
      setError('Please choose a module.')
      return
    }
    if (!file) {
      setError('Please choose a file to upload.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is over 10 MB. Please upload a smaller file for now.')
      return
    }

    const fileExt = (file.name.split('.').pop() ?? '').toLowerCase()
    const filePath = `${userId}/${Date.now()}.${fileExt}`

    setStatus('uploading')
    const supabase = createClient()
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file)

    if (uploadError) {
      console.error('Direct-to-Storage upload failed:', uploadError)
      setError('Could not upload your file. Please try again.')
      setStatus('idle')
      return
    }

    setStatus('processing')
    try {
      const result = await finalizeUpload(
        moduleId,
        filePath,
        file.name,
        isPastPaper ? 'past_paper' : 'notes'
      )
      if (result?.error) {
        setError(result.error)
        setStatus('idle')
        return
      }
      router.push('/dashboard')
    } catch {
      setError('Something went wrong while reading your document. Please try again.')
      setStatus('idle')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6"
    >
      <div>
        <label className="mb-1.5 block text-xs text-[var(--color-muted)]">Module</label>
        <select
          value={moduleId}
          onChange={(e) => setModuleId(e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-primary)]"
          required
        >
          {modules.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs text-[var(--color-muted)]">File</label>
        <input
          type="file"
          accept=".pdf,.pptx,image/png,image/jpeg,image/gif,image/bmp"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--color-bg)]"
          required
        />
        <p className="mt-1.5 text-xs text-[var(--color-muted)]">PDF, PowerPoint (.pptx), or image (PNG/JPG/GIF/BMP), up to 10 MB.</p>
      </div>

      <label className="flex items-start gap-2 text-sm text-[var(--color-text)]">
        <input
          type="checkbox"
          checked={isPastPaper}
          onChange={(e) => setIsPastPaper(e.target.checked)}
          disabled={busy}
          className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-primary)]"
        />
        <span>
          This is a past exam paper for this module
          <span className="block text-xs text-[var(--color-muted)]">
            Used as a style guide when generating exam-style questions from your notes — not
            included as study material itself.
          </span>
        </span>
      </label>

      {error && (
        <p className="rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-[var(--color-primary)] py-2.5 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'uploading' && 'Uploading your file…'}
        {status === 'processing' && 'Reading your document… this can take a minute'}
        {status === 'idle' && 'Upload'}
      </button>
    </form>
  )
}
