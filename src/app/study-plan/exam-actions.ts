'use server'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()

const SESSION_MINUTES = 45
const MAX_SESSIONS = 30
// Roughly one session every this many days, so the plan doesn't feel too thin
// over a long run-up, or absurdly dense over a very short one.
const DAYS_PER_SESSION = 2

async function getStudentOrRedirect() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const student = await prisma.student.findUnique({ where: { authUserId: user.id } })
  if (!student) redirect('/onboarding')
  return student
}

function isPremiumStudent(student: { premiumUntil: Date | null }): boolean {
  return Boolean(student.premiumUntil && student.premiumUntil > new Date())
}

// Sets (or clears) a module's exam date and rebuilds its countdown timetable.
// Any sessions already marked complete are kept as history; only the
// not-yet-done ones are replaced, so rebuilding the plan never erases progress.
export async function setExamDate(formData: FormData) {
  const student = await getStudentOrRedirect()
  if (!isPremiumStudent(student)) {
    redirect('/study-plan?error=' + encodeURIComponent('Exam timetables are a Premium feature.'))
  }

  const moduleId = String(formData.get('moduleId') ?? '')
  const examDateRaw = String(formData.get('examDate') ?? '')

  const mod = await prisma.module.findUnique({ where: { id: moduleId } })
  if (!mod || mod.studentId !== student.id) {
    redirect('/study-plan?error=' + encodeURIComponent('That module could not be found.'))
  }

  if (!examDateRaw) {
    // Clearing the date: remove the module's upcoming (not yet done) sessions
    // and the date itself.
    await prisma.$transaction([
      prisma.studySession.deleteMany({ where: { moduleId, completed: false } }),
      prisma.module.update({ where: { id: moduleId }, data: { examDate: null } }),
    ])
    revalidatePath('/study-plan')
    redirect('/study-plan')
  }

  const examDate = new Date(examDateRaw)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (isNaN(examDate.getTime()) || examDate <= today) {
    redirect('/study-plan?error=' + encodeURIComponent('Please choose a future date for the exam.'))
  }

  const daysRemaining = Math.max(1, Math.round((examDate.getTime() - today.getTime()) / 86_400_000))
  const sessionCount = Math.min(MAX_SESSIONS, Math.max(2, Math.round(daysRemaining / DAYS_PER_SESSION)))
  const interval = daysRemaining / sessionCount

  const sessions = Array.from({ length: sessionCount }, (_, i) => {
    const dayOffset = Math.round((i + 1) * interval)
    const date = new Date(today)
    date.setDate(date.getDate() + Math.min(dayOffset, daysRemaining))
    return {
      moduleId,
      studentId: student.id,
      date,
      label: i % 2 === 0 ? 'Review notes & flashcards' : 'Practice quiz',
      minutes: SESSION_MINUTES,
    }
  })

  await prisma.$transaction([
    prisma.studySession.deleteMany({ where: { moduleId, completed: false } }),
    prisma.module.update({ where: { id: moduleId }, data: { examDate } }),
    prisma.studySession.createMany({ data: sessions }),
  ])

  revalidatePath('/study-plan')
  redirect('/study-plan')
}

export async function toggleSessionComplete(formData: FormData) {
  const student = await getStudentOrRedirect()
  const sessionId = String(formData.get('sessionId') ?? '')

  const session = await prisma.studySession.findUnique({ where: { id: sessionId } })
  if (!session || session.studentId !== student.id) {
    redirect('/study-plan?error=' + encodeURIComponent('That session could not be found.'))
  }

  await prisma.studySession.update({
    where: { id: sessionId },
    data: { completed: !session!.completed },
  })

  revalidatePath('/study-plan')
}
