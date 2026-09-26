import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import Link from 'next/link'
import AppShell from '../components/AppShell'
import ScoreRing from '../components/ScoreRing'

const prisma = new PrismaClient()

// A small rotating accent palette, used purely for visual variety on cards
// that don't already carry a score-based color (blue/teal/violet all read
// well against the dark background).
const ACCENT_PALETTE = ['#5B9DF5', '#5FB3A3', '#9B8CFF']
function accentFor(index: number): string {
  return ACCENT_PALETTE[index % ACCENT_PALETTE.length]
}

function StatCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit?: string
  accent: string
}) {
  return (
    <div
      className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-4 border-t-2"
      style={{ borderTopColor: accent }}
    >
      <p className="text-xs text-[#8B93A0]">{label}</p>
      <p className="mt-1 font-serif text-2xl text-[#ECE6D6]">
        {value}
        {unit && <span className="ml-1 text-sm font-sans text-[#8B93A0]">{unit}</span>}
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

  // Per-module quiz average, so we can call out the module that needs the most practice.
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
        <p className="text-xs font-medium uppercase tracking-wide text-[#5B9DF5]">Welcome back</p>
        <h1 className="mt-1 font-serif text-2xl text-[#ECE6D6]">{displayName}</h1>
        <p className="mt-2 text-sm text-[#8B93A0]">
          {modules.length} {modules.length === 1 ? 'module' : 'modules'} · {allDocuments.length}{' '}
          {allDocuments.length === 1 ? 'document' : 'documents'} uploaded
          {weakestModule && (
            <> — <span className="text-[#ECE6D6]">{weakestModule.name}</span> could use some practice</>
          )}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Modules" value={String(modules.length)} accent={accentFor(0)} />
          <StatCard label="Documents" value={String(allDocuments.length)} accent={accentFor(1)} />
          <StatCard label="Quizzes completed" value={String(allAttempts.length)} accent={accentFor(2)} />
          <StatCard
            label="Avg quiz score"
            value={avgScorePercent !== null ? String(avgScorePercent) : '—'}
            unit={avgScorePercent !== null ? '%' : undefined}
            accent={accentFor(0)}
          />
        </div>

        <h2 className="mt-8 font-serif text-lg text-[#ECE6D6]">Your modules</h2>

        {moduleStats.length === 0 ? (
          <p className="mt-3 text-sm text-[#8B93A0]">
            No modules yet.{' '}
            <Link href="/onboarding" className="text-[#5FB3A3] underline">
              Add one to get started
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {moduleStats.map((mod, i) => (
              <div
                key={mod.id}
                className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-5 border-l-2 transition-transform hover:scale-[1.01]"
                style={{ borderLeftColor: accentFor(i) }}
              >
                <div className="flex items-start gap-4">
                  {mod.quizAvg !== null ? (
                    <ScoreRing percent={mod.quizAvg} size={56} />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#2D3540] text-[10px] text-[#8B93A0]">
                      No data
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-serif text-base text-[#ECE6D6]">{mod.name}</h3>
                      <Link
                        href={`/upload?moduleId=${mod.id}`}
                        className="shrink-0 rounded-full bg-[#5B9DF5] px-3 py-1 text-xs font-medium text-[#12161C] transition-opacity hover:opacity-90"
                      >
                        + Add document
                      </Link>
                    </div>
                    <p className="mt-1 text-xs text-[#8B93A0]">
                      {mod.documents.length} {mod.documents.length === 1 ? 'document' : 'documents'}
                      {mod.quizAvg === null && ' · No quizzes yet'}
                    </p>

                    {mod.documents.length > 0 && (
                      <details className="group mt-2">
                        <summary className="cursor-pointer list-none text-xs text-[#8B93A0] transition-colors hover:text-[#ECE6D6]">
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
                                className="text-sm text-[#5FB3A3] [overflow-wrap:anywhere] hover:underline"
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
