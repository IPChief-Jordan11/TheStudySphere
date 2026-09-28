import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import AppShell from '../components/AppShell'
import { updateWeeklyHours } from './actions'

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

export default async function StudyPlanPage() {
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
        },
      },
    },
  })

  const weeklyHours = student?.weeklyStudyHours ?? DEFAULT_HOURS

  const moduleSummaries = (student?.modules ?? []).map((mod) => {
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

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl">This week&apos;s study plan</h1>
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
