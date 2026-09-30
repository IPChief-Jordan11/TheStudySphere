import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import AccountClient from './AccountClient'

const prisma = new PrismaClient()

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: { modules: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } } },
  })

  return (
    <AccountClient
      error={error}
      profile={{
        name: student?.name ?? null,
        email: user.email ?? '',
        institution: student?.institution ?? null,
        faculty: student?.faculty ?? null,
        modules: student?.modules ?? [],
        premiumUntil: student?.premiumUntil ? student.premiumUntil.toISOString() : null,
      }}
    />
  )
}
