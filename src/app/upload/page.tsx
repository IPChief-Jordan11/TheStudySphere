import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import { uploadDocument } from './actions'
import AppShell from '../components/AppShell'

const prisma = new PrismaClient()

export default async function UploadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: { modules: true },
  })

  if (!student || student.modules.length === 0) {
    return (
      <AppShell>
        <p className="text-sm text-[#8B93A0]">
          You need at least one module before uploading. Go back to onboarding first.
        </p>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-sm">
        <h1 className="font-serif text-2xl">Upload a document</h1>

        <form action={uploadDocument} className="mt-6 space-y-4 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-6">
          <div>
            <label className="mb-1.5 block text-xs text-[#8B93A0]">Module</label>
            <select
              name="moduleId"
              className="w-full rounded-lg border border-[#2D3540] bg-[#12161C] px-3 py-2 text-sm text-[#ECE6D6] outline-none transition-colors focus:border-[#E8A33D]"
              required
            >
              {student.modules.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-[#8B93A0]">File</label>
            <input
              type="file"
              name="file"
              accept="image/*,.pdf"
              className="w-full rounded-lg border border-[#2D3540] bg-[#12161C] px-3 py-2 text-sm text-[#ECE6D6] outline-none file:mr-3 file:rounded-full file:border-0 file:bg-[#E8A33D] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[#12161C]"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-[#E8A33D] py-2.5 text-sm font-medium text-[#12161C] transition-opacity hover:opacity-90"
          >
            Upload
          </button>
        </form>
      </div>
    </AppShell>
  )
}
