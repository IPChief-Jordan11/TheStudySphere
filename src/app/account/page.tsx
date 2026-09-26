import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import AccountClient from './AccountClient'

const prisma = new PrismaClient()

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: { modules: { select: { id: true, name: true } } },
  })

  return (
    <AccountClient
      profile={{
        name: student?.name ?? null,
        email: user.email ?? '',
        institution: student?.institution ?? null,
        faculty: student?.faculty ?? null,
        modules: student?.modules ?? [],
      }}
    />
  )
}
