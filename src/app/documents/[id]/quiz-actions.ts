'use server'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'

const prisma = new PrismaClient()

type SaveResult = { ok: true } | { error: string }

export async function saveQuizAttempt(
  documentId: string,
  score: number,
  total: number
): Promise<SaveResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please log in again.' }

  // Confirm this document actually belongs to the logged-in user before saving.
  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: { modules: { select: { id: true } } },
  })
  const document = await prisma.uploadedDocument.findUnique({
    where: { id: documentId },
  })
  if (!document || !student?.modules.some((m) => m.id === document.moduleId)) {
    return { error: 'That document could not be found.' }
  }

  // Ignore an impossible score instead of trusting whatever the browser sends.
  const safeTotal = Math.max(0, Math.trunc(total))
  const safeScore = Math.min(Math.max(0, Math.trunc(score)), safeTotal)
  if (safeTotal === 0) return { error: 'Nothing to save.' }

  try {
    await prisma.quizAttempt.create({
      data: { documentId, score: safeScore, total: safeTotal },
    })
    return { ok: true }
  } catch (err) {
    console.error('Saving quiz attempt failed:', err)
    return { error: 'Could not save your result. Please try again.' }
  }
}
