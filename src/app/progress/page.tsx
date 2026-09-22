import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import AppShell from '../components/AppShell'

const prisma = new PrismaClient()

export default async function ProgressPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: {
      modules: {
        include: {
          documents: {
            include: {
              quizAttempts: { orderBy: { createdAt: 'desc' } },
            },
          },
        },
      },
    },
  })

  const documentsWithAttempts =
    student?.modules
      .flatMap((mod) => mod.documents.map((doc) => ({ ...doc, moduleName: mod.name })))
      .filter((doc) => doc.quizAttempts.length > 0) ?? []

  const allAttempts = documentsWithAttempts.flatMap((doc) =>
    doc.quizAttempts.map((a) => ({ ...a, fileName: doc.fileName, documentId: doc.id }))
  )

  const totalScore = allAttempts.reduce((sum, a) => sum + a.score, 0)
  const totalPossible = allAttempts.reduce((sum, a) => sum + a.total, 0)
  const overallPercent = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : null

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl">Your progress</h1>

        {allAttempts.length === 0 ? (
          <p className="mt-4 text-sm text-[#8B93A0]">
            No quiz attempts yet. Generate study materials for a document and take its quiz to
            see your progress here.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-[#8B93A0]">
              {allAttempts.length} quiz {allAttempts.length === 1 ? 'attempt' : 'attempts'} across{' '}
              {documentsWithAttempts.length}{' '}
              {documentsWithAttempts.length === 1 ? 'document' : 'documents'}
              {overallPercent !== null && ` — ${overallPercent}% overall`}
            </p>

            <div className="mt-6 space-y-4">
              {documentsWithAttempts.map((doc) => {
                const best = doc.quizAttempts.reduce(
                  (max, a) => Math.max(max, a.total > 0 ? (a.score / a.total) * 100 : 0),
                  0
                )
                return (
                  <div key={doc.id} className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-sm font-medium text-[#ECE6D6] [overflow-wrap:anywhere] hover:text-[#5B9DF5]"
                      >
                        {doc.fileName}
                      </Link>
                      <span className="shrink-0 text-xs text-[#8B93A0]">{doc.moduleName}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#8B93A0]">Best score: {Math.round(best)}%</p>
                    <ul className="mt-3 space-y-1">
                      {doc.quizAttempts.map((a) => (
                        <li key={a.id} className="text-xs text-[#8B93A0]">
                          {a.score}/{a.total} —{' '}
                          {new Date(a.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
