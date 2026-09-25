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
// skipped; the other half is layered on top, weighted toward weaker modules,
// so a struggling module still ends up with noticeably more total time.
const EVEN_SHARE = 0.5

function buildSchedule(
  modules: { id: string; name: string; documentCount: number; quizAvg: number | null }[],
  weeklyHours: number
): Session[] {
  const eligible = modules.filter((m) => m.documentCount > 0)
  if (eligible.length === 0 || weeklyHours <= 0) return []

  // Lower quiz average (or no quizzes yet) means higher weight, so weaker
  // modules get more of the "extra" pool. A module never taking a quiz is
  // treated as moderately weak, to nudge the student toward trying it.
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

  // Weakest first, so it lands on Monday and gets first pick of the week.
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
        <p className="mt-1 text-sm text-[#8B93A0]">
          Built from your quiz scores — weaker modules get more time, placed earlier in the week.
        </p>

        <form action={updateWeeklyHours} className="mt-4 flex items-center gap-2">
          <label htmlFor="weeklyStudyHours" className="text-xs text-[#8B93A0]">
            Hours to study this week
          </label>
          <input
            id="weeklyStudyHours"
            name="weeklyStudyHours"
            type="number"
            min={1}
            max={40}
            defaultValue={weeklyHours}
            className="w-16 rounded-lg border border-[#2D3540] bg-[#12161C] px-2 py-1 text-sm text-[#ECE6D6] outline-none transition-colors focus:border-[#5B9DF5]"
          />
          <button
            type="submit"
            className="rounded-full border border-[#5B9DF5] px-3 py-1 text-xs font-medium text-[#5B9DF5] transition-colors hover:bg-[#5B9DF5]/10"
          >
            Update
          </button>
        </form>

        {schedule.length === 0 ? (
          <p className="mt-8 text-sm text-[#8B93A0]">
            Upload at least one document to a module to get a study plan.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {byDay.map(({ day, sessions }) => (
              <div key={day} className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[#5B9DF5]">{day}</p>
                {sessions.length === 0 ? (
                  <p className="mt-2 text-sm text-[#8B93A0]">Free day — no sessions scheduled.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {sessions.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#2D3540] bg-[#12161C] px-3 py-2"
                      >
                        <span className="text-sm text-[#ECE6D6]">
                          {s.moduleName} — {s.label}
                          {s.isWeak && (
                            <span className="ml-2 rounded-full bg-[#E86D5F]/15 px-2 py-0.5 text-[10px] text-[#E86D5F]">
                              weak area
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 rounded-full bg-[#1A2029] px-2 py-0.5 text-xs text-[#8B93A0]">
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
