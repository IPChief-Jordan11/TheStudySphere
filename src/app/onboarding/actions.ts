'use server'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const prisma = new PrismaClient()

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const institution = formData.get('institution') as string
  const faculty = formData.get('faculty') as string
  const moduleName = formData.get('moduleName') as string

  const student = await prisma.student.upsert({
    where: { authUserId: user.id },
    update: { institution, faculty },
    create: {
      authUserId: user.id,
      email: user.email!,
      institution,
      faculty,
    },
  })

  if (moduleName) {
    await prisma.module.create({
      data: {
        name: moduleName,
        studentId: student.id,
      },
    })
  }

  redirect('/dashboard')
}