'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { finalizeUpload } from './actions'

// Supabase's bucket allows up to 50MB, but OCR still has to run within a time
// limit, so uploads are capped lower for now.
const MAX_FILE_BYTES = 10 * 1024 * 1024

type Module = { id: string; name: string }

export default function UploadForm({ modules, userId }: { modules: Module[]; userId: string }) {
  const router = useRouter()
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
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
      const result = await finalizeUpload(moduleId, filePath, file.name)
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
      className="mt-6 space-y-4 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-6"
    >
      <div>
        <label className="mb-1.5 block text-xs text-[#8B93A0]">Module</label>
        <select
          value={moduleId}
          onChange={(e) => setModuleId(e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-[#2D3540] bg-[#12161C] px-3 py-2 text-sm text-[#ECE6D6] outline-none transition-colors focus:border-[#5B9DF5]"
          required
        >
          {modules.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs text-[#8B93A0]">File</label>
        <input
          type="file"
          accept="image/*,.pdf"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded-lg border border-[#2D3540] bg-[#12161C] px-3 py-2 text-sm text-[#ECE6D6] outline-none file:mr-3 file:rounded-full file:border-0 file:bg-[#5B9DF5] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[#12161C]"
          required
        />
        <p className="mt-1.5 text-xs text-[#8B93A0]">PDF or image, up to 10 MB.</p>
      </div>

      {error && (
        <p className="rounded-lg border border-[#E86D5F] bg-[#E86D5F]/10 px-3 py-2 text-sm text-[#E86D5F]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-[#5B9DF5] py-2.5 text-sm font-medium text-[#12161C] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'uploading' && 'Uploading your file…'}
        {status === 'processing' && 'Reading your document… this can take a minute'}
        {status === 'idle' && 'Upload'}
      </button>
    </form>
  )
}
