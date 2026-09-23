import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import AppShell from '../components/AppShell'
import UploadForm from './UploadForm'

const prisma = new PrismaClient()

// Gives the finalizeUpload Server Action (OCR) more time on Vercel.
export const maxDuration = 300

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
        <UploadForm modules={student.modules} userId={user.id} />
      </div>
    </AppShell>
  )
}
