import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import AppShell from '../components/AppShell'

const prisma = new PrismaClient()

const RING_SIZE = 128
const RING_STROKE = 12
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function scoreColor(percent: number): string {
  if (percent >= 80) return '#5FB3A3'
  if (percent >= 50) return '#5B9DF5'
  return '#E86D5F'
}

function scoreLabel(percent: number): string {
  if (percent >= 90) return "You're on fire! \ud83d\udd25"
  if (percent >= 80) return 'Great work! \u2728'
  if (percent >= 50) return 'Solid progress \ud83d\udcaa'
  return 'Keep practicing \ud83c\udf31'
}

function ProgressRing({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = RING_CIRCUMFERENCE * (1 - clamped / 100)
  const color = scoreColor(clamped)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="#2D3540"
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-serif text-3xl text-[#ECE6D6]">{clamped}%</span>
        <span className="text-[10px] uppercase tracking-wide text-[#8B93A0]">overall</span>
      </div>
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#12161C]">
      <div
        className="h-full rounded-full"
        style={{
          width: `${clamped}%`,
          backgroundColor: scoreColor(clamped),
          transition: 'width 600ms ease-out',
        }}
      />
    </div>
  )
}

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
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-6 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left">
              {overallPercent !== null && <ProgressRing percent={overallPercent} />}
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

            <div className="mt-6 space-y-4">
              {documentsWithAttempts.map((doc) => {
                const best = doc.quizAttempts.reduce(
                  (max, a) => Math.max(max, a.total > 0 ? (a.score / a.total) * 100 : 0),
                  0
                )
                const bestRounded = Math.round(best)
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

                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1">
                        <ProgressBar percent={bestRounded} />
                      </div>
                      <span
                        className="w-12 shrink-0 text-right text-sm font-semibold"
                        style={{ color: scoreColor(bestRounded) }}
                      >
                        {bestRounded}%
                      </span>
                    </div>

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
