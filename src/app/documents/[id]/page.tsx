import { notFound, redirect } from 'next/navigation'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { generateStudyMaterials } from './actions'
import AppShell from '../../components/AppShell'
import SubmitButton from '../../components/SubmitButton'

const prisma = new PrismaClient()

// Generating study materials can take a while; give the Server Action more time on Vercel
// (the allowed maximum depends on your plan).
export const maxDuration = 300

type Flashcard = { question: string; answer: string }
type QuizQuestion = { question: string; options: string[]; correctIndex: number }

// A corrupted row should never crash the whole page.
function safeParse<T>(raw: string | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: { modules: { select: { id: true } } },
  })

  const document = await prisma.uploadedDocument.findUnique({
    where: { id },
    include: { generatedContent: true },
  })

  // Missing documents AND documents that belong to someone else both show a 404.
  if (!document || !student?.modules.some((m) => m.id === document.moduleId)) {
    notFound()
  }

  const summary = document.generatedContent.find((c) => c.type === 'summary')
  const flashcards = safeParse<Flashcard[]>(
    document.generatedContent.find((c) => c.type === 'flashcards')?.content
  )
  const quiz = safeParse<QuizQuestion[]>(
    document.generatedContent.find((c) => c.type === 'quiz')?.content
  )

  async function handleGenerate() {
    'use server'
    await generateStudyMaterials(id)
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl">{document.fileName}</h1>

        {error && (
          <p className="mt-4 rounded-lg border border-[#E86D5F] bg-[#E86D5F]/10 px-3 py-2 text-sm text-[#E86D5F]">
            {error}
          </p>
        )}

        {!summary && (
          <form action={handleGenerate} className="mt-4">
            <SubmitButton
              idleText="Generate study materials"
              pendingText="Generating… this can take a minute"
              className="px-5 py-2"
            />
          </form>
        )}

        {summary && (
          <div className="mt-8 rounded-xl border border-[#2D3540] bg-[#1A2029] p-5">
            <h2 className="font-serif text-lg">Summary</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#ECE6D6]">{summary.content}</p>
          </div>
        )}

        {flashcards && (
          <div className="mt-6">
            <h2 className="font-serif text-lg">Flashcards</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {flashcards.map((f, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-4"
                >
                  <p className="text-sm font-medium text-[#ECE6D6]">{f.question}</p>
                  <p className="mt-2 text-sm text-[#8B93A0]">{f.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {quiz && (
          <div className="mt-6">
            <h2 className="font-serif text-lg">Quiz</h2>
            <div className="mt-3 space-y-3">
              {quiz.map((q, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-4"
                >
                  <p className="text-sm font-medium text-[#ECE6D6]">{q.question}</p>
                  <ul className="mt-3 space-y-1.5">
                    {q.options.map((opt, j) => (
                      <li
                        key={j}
                        className={`rounded-lg px-3 py-1.5 text-sm ${
                          j === q.correctIndex
                            ? 'bg-[#5FB3A3]/15 text-[#5FB3A3]'
                            : 'text-[#8B93A0]'
                        }`}
                      >
                        {opt}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
