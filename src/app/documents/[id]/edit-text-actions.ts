'use server'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()

export async function updateExtractedText(formData: FormData) {
  const documentId = String(formData.get('documentId') ?? '')
  const newText = String(formData.get('extractedText') ?? '')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: { modules: { select: { id: true } } },
  })
  const document = await prisma.uploadedDocument.findUnique({ where: { id: documentId } })

  if (!document || !student?.modules.some((m) => m.id === document.moduleId)) {
    redirect('/dashboard?error=' + encodeURIComponent('That document could not be found.'))
  }

  if (newText.trim().length < 20) {
    redirect(`/documents/${documentId}?error=` + encodeURIComponent('Please leave at least a little text — an empty document can\'t be studied from.'))
  }

  await prisma.uploadedDocument.update({
    where: { id: documentId },
    data: { extractedText: newText },
  })

  revalidatePath(`/documents/${documentId}`)
  redirect(`/documents/${documentId}`)
}
