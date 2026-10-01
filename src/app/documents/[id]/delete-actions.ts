'use server'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()

// Supabase public URLs look like .../storage/v1/object/public/documents/<path>.
// Pulling the path back out lets us remove the actual file from Storage.
function storagePathFromPublicUrl(fileUrl: string): string | null {
  const marker = '/documents/'
  const index = fileUrl.indexOf(marker)
  if (index === -1) return null
  return fileUrl.slice(index + marker.length)
}

export async function deleteDocument(formData: FormData) {
  const documentId = String(formData.get('documentId') ?? '')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: { modules: { select: { id: true } } },
  })

  const document = await prisma.uploadedDocument.findUnique({ where: { id: documentId } })

  // Must exist and actually belong to one of this user's modules.
  if (!document || !student?.modules.some((m) => m.id === document.moduleId)) {
    redirect('/dashboard?error=' + encodeURIComponent('That document could not be found.'))
  }

  // Remove everything that references this document first, then the document
  // itself, all in one transaction so a failure partway through can't leave
  // orphaned rows behind.
  await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { documentId } }),
    prisma.generatedContent.deleteMany({ where: { documentId } }),
    prisma.quizAttempt.deleteMany({ where: { documentId } }),
    prisma.uploadedDocument.delete({ where: { id: documentId } }),
  ])

  // Best-effort cleanup of the actual file in Storage. If this fails, the
  // document record is already gone, which matters more than a stray file.
  const path = storagePathFromPublicUrl(document!.fileUrl)
  if (path) {
    const { error } = await supabase.storage.from('documents').remove([path])
    if (error) console.error('Could not remove file from Storage:', error)
  }

  revalidatePath('/dashboard')
  revalidatePath('/progress')
  revalidatePath('/study-plan')
  redirect('/dashboard')
}
