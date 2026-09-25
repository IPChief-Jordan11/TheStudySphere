'use server'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()

export async function updateWeeklyHours(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const raw = Number(formData.get('weeklyStudyHours'))
  const hours = Number.isFinite(raw) ? Math.min(40, Math.max(1, Math.round(raw))) : 6

  await prisma.student.update({
    where: { authUserId: user.id },
    data: { weeklyStudyHours: hours },
  })

  revalidatePath('/study-plan')
  redirect('/study-plan')
}
