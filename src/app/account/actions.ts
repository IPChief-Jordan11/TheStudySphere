'use server'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()

export async function addModule(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const name = String(formData.get('name') ?? '').trim()

  const student = await prisma.student.findUnique({ where: { authUserId: user.id } })
  if (!student) redirect('/onboarding')

  if (!name) {
    redirect('/account?error=' + encodeURIComponent('Please type a module name.'))
  }

  await prisma.module.create({ data: { name, studentId: student.id } })

  revalidatePath('/account')
  revalidatePath('/dashboard')
  redirect('/account')
}

export async function removeModule(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const moduleId = String(formData.get('moduleId') ?? '')

  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    include: { student: true, documents: { select: { id: true } } },
  })

  // Must exist and actually belong to the logged-in user.
  if (!mod || mod.student.authUserId !== user.id) {
    redirect('/account?error=' + encodeURIComponent('That module could not be found.'))
  }

  if (mod!.documents.length > 0) {
    redirect(
      '/account?error=' +
        encodeURIComponent(
          `"${mod!.name}" has ${mod!.documents.length} document(s) in it. Delete or move those first, then remove the module.`
        )
    )
  }

  await prisma.module.delete({ where: { id: moduleId } })

  revalidatePath('/account')
  revalidatePath('/dashboard')
  redirect('/account')
}
