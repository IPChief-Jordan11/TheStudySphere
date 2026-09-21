import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import Link from 'next/link'
import AppShell from '../components/AppShell'

const prisma = new PrismaClient()

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: {
      modules: {
        include: { documents: true },
      },
    },
  })

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl">Welcome back</h1>
        <p className="mt-1 text-sm text-[#8B93A0]">{user.email}</p>

        <div className="mt-6">
          <Link
            href="/upload"
            className="inline-block rounded-full bg-[#5B9DF5] px-5 py-2 text-sm font-medium text-[#12161C] transition-opacity hover:opacity-90"
          >
            Upload a document
          </Link>
        </div>

        <div className="mt-10 space-y-6">
          {student?.modules.map((mod) => (
            <div
              key={mod.id}
              className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-5"
            >
              <h2 className="font-serif text-lg">{mod.name}</h2>
              {mod.documents.length === 0 ? (
                <p className="mt-2 text-sm text-[#8B93A0]">No documents uploaded yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {mod.documents.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-sm text-[#5FB3A3] hover:underline"
                      >
                        {doc.fileName}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}