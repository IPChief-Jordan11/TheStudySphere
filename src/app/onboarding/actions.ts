'use server'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const prisma = new PrismaClient()

type ProfileInput = {
  authUserId: string
  email: string
  emailConfirmed: boolean
  institution: string
  faculty: string
  moduleName: string
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}

async function upsertStudent(input: ProfileInput) {
  const { authUserId, email, institution, faculty } = input

  try {
    return await prisma.student.upsert({
      where: { authUserId },
      update: { institution, faculty },
      create: { authUserId, email, institution, faculty },
    })
  } catch (err) {
    // A profile with this email already exists under an older login.
    // Only re-attach it if this login's email is confirmed, so nobody can
    // claim another person's profile just by typing their email address.
    if (isUniqueConstraintError(err) && input.emailConfirmed) {
      return await prisma.student.update({
        where: { email },
        data: { authUserId, institution, faculty },
      })
    }
    throw err
  }
}

// Returns an error message for the student, or null on success.
async function saveOnboarding(input: ProfileInput): Promise<string | null> {
  try {
    const student = await upsertStudent(input)

    if (input.moduleName) {
      await prisma.module.create({
        data: {
          name: input.moduleName,
          studentId: student.id,
        },
      })
    }

    return null
  } catch (err) {
    console.error('Onboarding failed:', err)
    if (isUniqueConstraintError(err)) {
      return 'A profile with this email already exists. Please confirm your email address, then log in again.'
    }
    return 'Something went wrong while saving your details. Please try again.'
  }
}

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !user.email) {
    redirect('/login')
  }

  const errorMessage = await saveOnboarding({
    authUserId: user.id,
    email: user.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    institution: String(formData.get('institution') ?? '').trim(),
    faculty: String(formData.get('faculty') ?? '').trim(),
    moduleName: String(formData.get('moduleName') ?? '').trim(),
  })

  // redirect() works by throwing, so it must stay outside any try/catch.
  if (errorMessage) {
    redirect(`/onboarding?error=${encodeURIComponent(errorMessage)}`)
  }

  redirect('/dashboard')
}
