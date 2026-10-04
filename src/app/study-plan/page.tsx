import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import AppShell from '../components/AppShell'
import { updateWeeklyHours } from './actions'
import { setExamDate, toggleSessionComplete } from './exam-actions'

const prisma = new PrismaClient()

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
const DEFAULT_HOURS = 6
const MIN_SESSION_MINUTES = 20
const MAX_SESSION_MINUTES = 60

type Session = { day: string; moduleName: string; label: string; minutes: number; isWeak: boolean }

// Half the week's time is split evenly across every module, so nothing gets
// skipped; the other half is layered on top, weighted toward weaker modules.
const EVEN_SHARE = 0.5

function buildSchedule(
  modules: { id: string; name: string; documentCount: number; quizAvg: number | null }[],
  weeklyHours: number
): Session[] {
  const eligible = modules.filter((m) => m.documentCount > 0)
  if (eligible.length === 0 || weeklyHours <= 0) return []

  const weighted = eligible.map((m) => ({
    ...m,
    weight: m.quizAvg !== null ? Math.max(10, 100 - m.quizAvg) : 55,
  }))
  const totalWeight = weighted.reduce((sum, m) => sum + m.weight, 0)
  const totalMinutes = weeklyHours * 60
  const evenPool = totalMinutes * EVEN_SHARE
  const weightedPool = totalMinutes * (1 - EVEN_SHARE)
  const evenSharePerModule = evenPool / eligible.length

  const sessions: Session[] = []
  let dayIndex = 0

  const sorted = [...weighted].sort((a, b) => b.weight - a.weight)

  for (const mod of sorted) {
    const rawMinutes = evenSharePerModule + (weightedPool * mod.weight) / totalWeight
    let minutesLeft = Math.round(rawMinutes / 5) * 5
    if (minutesLeft < MIN_SESSION_MINUTES) minutesLeft = MIN_SESSION_MINUTES

    let sessionNumber = 0
    while (minutesLeft > 0) {
      const sessionMinutes = Math.min(minutesLeft, MAX_SESSION_MINUTES)
      const label = sessionNumber === 0 ? 'Review notes & flashcards' : 'Practice quiz'
      sessions.push({
        day: DAYS[dayIndex % DAYS.length],
        moduleName: mod.name,
        label,
        minutes: sessionMinutes,
        isWeak: mod.quizAvg !== null && mod.quizAvg < 60,
      })
      minutesLeft -= sessionMinutes
      sessionNumber += 1
      dayIndex += 1
    }
  }

  return sessions
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function daysUntil(d: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export default async function StudyPlanPage({
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
    include: {
      modules: {
        include: {
          documents: { include: { quizAttempts: true } },
          studySessions: { orderBy: { date: 'asc' } },
        },
      },
    },
  })

  if (!student) redirect('/onboarding')

  const isPremium = Boolean(student.premiumUntil && student.premiumUntil > new Date())
  const weeklyHours = student.weeklyStudyHours ?? DEFAULT_HOURS

  const moduleSummaries = student.modules.map((mod) => {
    const attempts = mod.documents.flatMap((d) => d.quizAttempts)
    const score = attempts.reduce((sum, a) => sum + a.score, 0)
    const possible = attempts.reduce((sum, a) => sum + a.total, 0)
    return {
      id: mod.id,
      name: mod.name,
      documentCount: mod.documents.length,
      quizAvg: possible > 0 ? Math.round((score / possible) * 100) : null,
    }
  })

  const schedule = buildSchedule(moduleSummaries, weeklyHours)
  const byDay = DAYS.map((day) => ({ day, sessions: schedule.filter((s) => s.day === day) }))

  // Today's reminders: any not-yet-done timetable session due today or earlier.
  const todaySessions = student.modules.flatMap((mod) =>
    mod.studySessions
      .filter((s) => !s.completed && daysUntil(s.date) <= 0)
      .map((s) => ({ ...s, moduleName: mod.name }))
  )

  const modulesWithExams = student.modules.filter((m) => m.examDate)

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl">Study plan</h1>

        {error && (
          <p className="mt-4 rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}

        {todaySessions.length > 0 && (
          <div className="mt-4 rounded-2xl border border-[var(--color-warn)] bg-[var(--color-warn)]/10 p-4">
            <p className="text-sm font-medium text-[var(--color-warn)]">
              Today&apos;s reminders ({todaySessions.length})
            </p>
            <ul className="mt-2 space-y-1.5">
              {todaySessions.map((s) => (
                <li key={s.id} className="text-sm text-[var(--color-text)]">
                  {s.moduleName} — {s.label} ({s.minutes} min)
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Exam countdown timetable — Premium */}
        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="font-serif text-lg">Exam countdown timetable</h2>

          {!isPremium ? (
            <>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Set an exam date per module and get a full countdown timetable with trackable
                sessions, reminders, and progress.
              </p>
              <Link
                href="/account"
                className="mt-3 inline-block rounded-full border border-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
              >
                🔒 Upgrade to Premium
              </Link>
            </>
          ) : (
            <div className="mt-3 space-y-4">
              {student.modules.map((mod) => {
                const upcoming = mod.studySessions.filter((s) => !s.completed)
                const done = mod.studySessions.filter((s) => s.completed).length
                const total = mod.studySessions.length
                return (
                  <div key={mod.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-[var(--color-text)]">{mod.name}</h3>
                      {mod.examDate && (
                        <span className="text-xs text-[var(--color-muted)]">
                          Exam: {formatDate(mod.examDate)} ({daysUntil(mod.examDate)} days)
                        </span>
                      )}
                    </div>

                    <form action={setExamDate} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="moduleId" value={mod.id} />
                      <input
                        type="date"
                        name="examDate"
                        defaultValue={mod.examDate ? mod.examDate.toISOString().slice(0, 10) : ''}
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                      />
                      <button
                        type="submit"
                        className="rounded-full border border-[var(--color-primary)] px-3 py-1 text-xs text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                      >
                        {mod.examDate ? 'Update' : 'Set exam date'}
                      </button>
                    </form>

                    {total > 0 && (
                      <>
                        <p className="mt-3 text-xs text-[var(--color-muted)]">
                          {done} of {total} sessions done
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {upcoming.slice(0, 8).map((s) => (
                            <li key={s.id} className="flex items-center gap-2">
                              <form action={toggleSessionComplete}>
                                <input type="hidden" name="sessionId" value={s.id} />
                                <button
                                  type="submit"
                                  aria-label="Mark done"
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-transparent hover:border-[var(--color-primary)]"
                                >
                                  ✓
                                </button>
                              </form>
                              <span className="text-xs text-[var(--color-text)]">
                                {formatDate(s.date)} — {s.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <h2 className="mt-8 font-serif text-lg">This week&apos;s study plan</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Built from your quiz scores — weaker modules get more time, placed earlier in the week.
        </p>

        <form action={updateWeeklyHours} className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="weeklyStudyHours" className="text-xs text-[var(--color-muted)]">
            Hours to study this week
          </label>
          <input
            id="weeklyStudyHours"
            name="weeklyStudyHours"
            type="number"
            min={1}
            max={40}
            defaultValue={weeklyHours}
            className="w-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-primary)]"
          />
          <button
            type="submit"
            className="rounded-full border border-[var(--color-primary)] px-3 py-1 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/10"
          >
            Update
          </button>
        </form>

        {schedule.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--color-muted)]">
            Upload at least one document to a module to get a study plan.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {byDay.map(({ day, sessions }) => (
              <div
                key={day}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">
                  {day}
                </p>
                {sessions.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--color-muted)]">Free day — no sessions scheduled.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {sessions.map((s, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                      >
                        <span className="min-w-0 text-sm text-[var(--color-text)] [overflow-wrap:anywhere]">
                          {s.moduleName} — {s.label}
                          {s.isWeak && (
                            <span className="ml-2 rounded-full bg-[var(--color-error)]/15 px-2 py-0.5 text-[10px] text-[var(--color-error)]">
                              weak area
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--color-panel)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                          {s.minutes} min
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
