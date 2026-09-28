import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import Link from 'next/link'
import AppShell from '../components/AppShell'
import ScoreRing from '../components/ScoreRing'

const prisma = new PrismaClient()

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 font-serif text-2xl text-[var(--color-text)]">
        {value}
        {unit && <span className="ml-1 font-sans text-sm text-[var(--color-muted)]">{unit}</span>}
      </p>
    </div>
  )
}

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
        include: {
          documents: {
            include: { quizAttempts: true },
          },
        },
      },
    },
  })

  const displayName = student?.name || user.email
  const modules = student?.modules ?? []
  const allDocuments = modules.flatMap((m) => m.documents)
  const allAttempts = allDocuments.flatMap((d) => d.quizAttempts)

  const totalScore = allAttempts.reduce((sum, a) => sum + a.score, 0)
  const totalPossible = allAttempts.reduce((sum, a) => sum + a.total, 0)
  const avgScorePercent = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : null

  const moduleStats = modules.map((mod) => {
    const attempts = mod.documents.flatMap((d) => d.quizAttempts)
    const score = attempts.reduce((sum, a) => sum + a.score, 0)
    const possible = attempts.reduce((sum, a) => sum + a.total, 0)
    const percent = possible > 0 ? Math.round((score / possible) * 100) : null
    return { ...mod, quizAvg: percent }
  })

  const weakestModule = moduleStats
    .filter((m) => m.quizAvg !== null)
    .sort((a, b) => (a.quizAvg as number) - (b.quizAvg as number))[0]

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">Welcome back</p>
        <h1 className="mt-1 font-serif text-2xl text-[var(--color-text)]">{displayName}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {modules.length} {modules.length === 1 ? 'module' : 'modules'} · {allDocuments.length}{' '}
          {allDocuments.length === 1 ? 'document' : 'documents'} uploaded
          {weakestModule && (
            <> — <span className="text-[var(--color-text)]">{weakestModule.name}</span> could use some practice</>
          )}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Modules" value={String(modules.length)} />
          <StatCard label="Documents" value={String(allDocuments.length)} />
          <StatCard label="Quizzes completed" value={String(allAttempts.length)} />
          <StatCard
            label="Avg quiz score"
            value={avgScorePercent !== null ? String(avgScorePercent) : '—'}
            unit={avgScorePercent !== null ? '%' : undefined}
          />
        </div>

        <h2 className="mt-8 font-serif text-lg text-[var(--color-text)]">Your modules</h2>

        {moduleStats.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            No modules yet.{' '}
            <Link href="/onboarding" className="text-[var(--color-secondary)] underline">
              Add one to get started
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {moduleStats.map((mod) => (
              <div
                key={mod.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
              >
                <div className="flex items-start gap-4">
                  {mod.quizAvg !== null ? (
                    <ScoreRing percent={mod.quizAvg} size={56} />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[var(--color-border)] text-[10px] text-[var(--color-muted)]">
                      No data
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-base text-[var(--color-text)] [overflow-wrap:anywhere]">
                      {mod.name}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      {mod.documents.length} {mod.documents.length === 1 ? 'document' : 'documents'}
                      {mod.quizAvg === null && ' · No quizzes yet'}
                    </p>
                    <Link
                      href={`/upload?moduleId=${mod.id}`}
                      className="mt-2 inline-block rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-[var(--color-bg)] transition-opacity hover:opacity-90"
                    >
                      + Add document
                    </Link>

                    {mod.documents.length > 0 && (
                      <details className="group mt-3">
                        <summary className="cursor-pointer list-none text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]">
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                            View documents
                          </span>
                        </summary>
                        <ul className="mt-2 space-y-1.5">
                          {mod.documents.map((doc) => (
                            <li key={doc.id}>
                              <Link
                                href={`/documents/${doc.id}`}
                                className="text-sm text-[var(--color-secondary)] [overflow-wrap:anywhere] hover:underline"
                              >
                                {doc.fileName}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
