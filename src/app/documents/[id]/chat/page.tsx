import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import AppShell from '../../../components/AppShell'
import ChatClient from './ChatClient'

const prisma = new PrismaClient()

// The tutor's answers can take a few seconds; give the Server Action more time on Vercel.
export const maxDuration = 60

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: { modules: { select: { id: true } } },
  })

  const document = await prisma.uploadedDocument.findUnique({
    where: { id },
    select: { fileName: true, moduleId: true },
  })

  // Missing documents AND documents that belong to someone else both show a 404.
  if (!document || !student?.modules.some((m) => m.id === document.moduleId)) {
    notFound()
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <Link href={`/documents/${id}`} className="text-sm text-[#5FB3A3] hover:underline">
          ← Back to document
        </Link>
        <h1 className="mt-3 font-serif text-2xl">AI tutor</h1>
        <p className="mt-1 text-sm text-[#8B93A0] [overflow-wrap:anywhere]">
          Asking about: {document.fileName}
        </p>
        <ChatClient documentId={id} />
      </div>
    </AppShell>
  )
}
