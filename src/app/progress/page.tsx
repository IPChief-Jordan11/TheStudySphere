import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import AppShell from '../components/AppShell'
import ScoreRing, { scoreLabel } from '../components/ScoreRing'

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

  const modules = student?.modules ?? []

  const documentsWithAttempts = modules
    .flatMap((mod) => mod.documents.map((doc) => ({ ...doc, moduleName: mod.name })))
    .filter((doc) => doc.quizAttempts.length > 0)

  const allAttempts = documentsWithAttempts.flatMap((doc) =>
    doc.quizAttempts.map((a) => ({ ...a, fileName: doc.fileName, documentId: doc.id }))
  )

  const totalScore = allAttempts.reduce((sum, a) => sum + a.score, 0)
  const totalPossible = allAttempts.reduce((sum, a) => sum + a.total, 0)
  const overallPercent = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : null

  // One quiz average per module, combining every quiz taken across all of that
  // module's documents — this is a real, computed number, not an estimate of
  // how much of the syllabus has been "covered".
  const moduleAverages = modules
    .map((mod) => {
      const attempts = mod.documents.flatMap((d) => d.quizAttempts)
      const score = attempts.reduce((sum, a) => sum + a.score, 0)
      const possible = attempts.reduce((sum, a) => sum + a.total, 0)
      const percent = possible > 0 ? Math.round((score / possible) * 100) : null
      return { id: mod.id, name: mod.name, percent, attemptCount: attempts.length }
    })
    .filter((m) => m.percent !== null) as { id: string; name: string; percent: number; attemptCount: number }[]

  const weakest =
    moduleAverages.length >= 2
      ? [...moduleAverages].sort((a, b) => a.percent - b.percent)[0]
      : null
  const gapFromAverage = weakest && overallPercent !== null ? overallPercent - weakest.percent : 0

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-2xl">Your progress</h1>

        {allAttempts.length === 0 ? (
          <p className="mt-4 text-sm text-[#8B93A0]">
            No quiz attempts yet. Generate study materials for a document and take its quiz to
            see your progress here.
          </p>
        ) : (
          <>
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-6 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left">
              {overallPercent !== null && (
                <ScoreRing percent={overallPercent} size={128} strokeWidth={12} />
              )}
              <div>
                <p className="text-sm font-medium text-[#ECE6D6]">
                  {overallPercent !== null && scoreLabel(overallPercent)}
                </p>
                <p className="mt-1 text-sm text-[#8B93A0]">
                  {allAttempts.length} quiz {allAttempts.length === 1 ? 'attempt' : 'attempts'} across{' '}
                  {documentsWithAttempts.length}{' '}
                  {documentsWithAttempts.length === 1 ? 'document' : 'documents'}
                </p>
              </div>
            </div>

            {moduleAverages.length > 0 && (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-5">
                  <h2 className="font-serif text-base text-[#ECE6D6]">Quiz average by module</h2>
                  <div className="mt-4 space-y-3">
                    {moduleAverages.map((mod) => (
                      <div key={mod.id} className="flex items-center gap-3">
                        <ScoreRing percent={mod.percent} size={44} />
                        <span className="text-sm text-[#ECE6D6]">{mod.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-5">
                  <h2 className="font-serif text-base text-[#ECE6D6]">Gap identified</h2>
                  {weakest ? (
                    <p className="mt-3 text-sm text-[#8B93A0]">
                      <span className="text-[#ECE6D6]">{weakest.name}</span> is your lowest-scoring
                      module at {weakest.percent}%, {Math.abs(gapFromAverage)} points{' '}
                      {gapFromAverage >= 0 ? 'below' : 'above'} your overall average of{' '}
                      {overallPercent}%. Based on {weakest.attemptCount}{' '}
                      {weakest.attemptCount === 1 ? 'quiz' : 'quizzes'} in that module.
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-[#8B93A0]">
                      Take a quiz in at least two modules to see how they compare.
                    </p>
                  )}
                </div>
              </div>
            )}

            <h2 className="mt-8 font-serif text-lg text-[#ECE6D6]">By document</h2>
            <div className="mt-4 space-y-4">
              {documentsWithAttempts.map((doc) => {
                const best = doc.quizAttempts.reduce(
                  (max, a) => Math.max(max, a.total > 0 ? (a.score / a.total) * 100 : 0),
                  0
                )
                return (
                  <div key={doc.id} className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-5">
                    <div className="flex items-center gap-4">
                      <ScoreRing percent={best} size={48} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-4">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="text-sm font-medium text-[#ECE6D6] [overflow-wrap:anywhere] hover:text-[#5B9DF5]"
                          >
                            {doc.fileName}
                          </Link>
                          <span className="shrink-0 text-xs text-[#8B93A0]">{doc.moduleName}</span>
                        </div>
                        <ul className="mt-2 space-y-1">
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
                    </div>
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
