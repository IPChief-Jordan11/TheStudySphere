import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { generateStudyMaterials } from './actions'
import { generateExamPaper } from './exam-actions'
import AppShell from '../../components/AppShell'
import QuizClient from './QuizClient'

const prisma = new PrismaClient()

// Generating study materials can take a while, more so for a long document
// split into several sections; give the Server Action more time on Vercel.
export const maxDuration = 300

type Flashcard = { question: string; answer: string; topic?: string }
type QuizQuestion = { question: string; options: string[]; correctIndex: number; topic?: string }
type TopicSummary = { topicTitle: string; summary: string }
type ExamQuestion = { number: number; text: string; marks: number }
type ExamPaper = { title: string; questions: ExamQuestion[] }

// A corrupted row should never crash the whole page.
function safeParse<T>(raw: string | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// The summary is a plain string for a single-section document, or a JSON
// array of {topicTitle, summary} for one that was split by topic. Handle
// both, since older documents were saved before topic-splitting existed.
function parseSummary(raw: string | undefined): TopicSummary[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as TopicSummary[]
  } catch {
    // Not JSON, so it's the older plain-string format.
  }
  return [{ topicTitle: '', summary: raw }]
}

// Groups a flat list into topic buckets, in first-seen order. Items with no
// topic (older documents, or a single-section document) land in one bucket
// with no heading.
function groupByTopic<T extends { topic?: string }>(items: T[]): { topic: string; items: T[] }[] {
  const order: string[] = []
  const buckets = new Map<string, T[]>()

  for (const item of items) {
    const topic = item.topic ?? ''
    if (!buckets.has(topic)) {
      order.push(topic)
      buckets.set(topic, [])
    }
    buckets.get(topic)!.push(item)
  }

  return order.map((topic) => ({ topic, items: buckets.get(topic)! }))
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

  const summaryTopics = parseSummary(
    document.generatedContent.find((c) => c.type === 'summary')?.content
  )
  const flashcards = safeParse<Flashcard[]>(
    document.generatedContent.find((c) => c.type === 'flashcards')?.content
  )
  const quiz = safeParse<QuizQuestion[]>(
    document.generatedContent.find((c) => c.type === 'quiz')?.content
  )

  const flashcardGroups = flashcards ? groupByTopic(flashcards) : null
  const quizByTopic = quiz ? groupByTopic(quiz) : null
  const exam = safeParse<ExamPaper>(
    document.generatedContent.find((c) => c.type === 'exam')?.content
  )

  async function handleGenerate() {
    'use server'
    await generateStudyMaterials(id)
  }

  async function handleGenerateExam() {
    'use server'
    await generateExamPaper(id)
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl [overflow-wrap:anywhere]">{document.fileName}</h1>

        <Link
          href={`/documents/${id}/chat`}
          className="mt-4 inline-block rounded-full border border-[#5B9DF5] px-5 py-2 text-sm font-medium text-[#5B9DF5] transition-colors hover:bg-[#5B9DF5]/10"
        >
          Ask the AI tutor
        </Link>

        {error && (
          <p className="mt-4 rounded-lg border border-[#E86D5F] bg-[#E86D5F]/10 px-3 py-2 text-sm text-[#E86D5F]">
            {error}
          </p>
        )}

        {!summaryTopics && (
          <form action={handleGenerate} className="mt-4">
            <button
              type="submit"
              className="rounded-full bg-[#5B9DF5] px-5 py-2 text-sm font-medium text-[#12161C] transition-opacity hover:opacity-90"
            >
              Generate study materials
            </button>
          </form>
        )}

        {summaryTopics && (
          <div className="mt-8 space-y-4">
            <h2 className="font-serif text-lg">Summary</h2>
            {summaryTopics.map((t, i) => (
              <div key={i} className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-5">
                {t.topicTitle && (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#5B9DF5]">
                    {t.topicTitle}
                  </p>
                )}
                <p className="text-sm leading-relaxed text-[#ECE6D6]">{t.summary}</p>
              </div>
            ))}
          </div>
        )}

        {flashcardGroups && (
          <div className="mt-6">
            <h2 className="font-serif text-lg">Flashcards</h2>
            <div className="mt-3 space-y-5">
              {flashcardGroups.map((group, gi) => (
                <div key={gi}>
                  {group.topic && (
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#5B9DF5]">
                      {group.topic}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {group.items.map((f, i) => (
                      <div key={i} className="rounded-xl border border-[#2D3540] bg-[#1A2029] p-4">
                        <p className="text-sm font-medium text-[#ECE6D6]">{f.question}</p>
                        <p className="mt-2 text-sm text-[#8B93A0]">{f.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {quiz && quizByTopic && (
          <>
            {quizByTopic.some((g) => g.topic) && (
              <p className="mt-6 text-xs text-[#8B93A0]">
                This quiz covers {quizByTopic.length} topics from the document.
              </p>
            )}
            <QuizClient documentId={id} quiz={quiz} />
          </>
        )}

        {document.kind !== 'past_paper' && (
          <div className="mt-10 border-t border-[#2D3540] pt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-lg">Exam-style practice paper</h2>
              <form action={handleGenerateExam}>
                <button
                  type="submit"
                  className="rounded-full border border-[#5B9DF5] px-4 py-1.5 text-xs font-medium text-[#5B9DF5] transition-colors hover:bg-[#5B9DF5]/10"
                >
                  {exam ? 'Regenerate' : 'Generate exam-style questions'}
                </button>
              </form>
            </div>
            <p className="mt-1 text-xs text-[#8B93A0]">
              Uses a past paper you've uploaded for this module as a style guide, if one exists.
            </p>

            {exam && (
              <div className="mt-4 rounded-xl border border-[#2D3540] bg-[#1A2029] p-5">
                <h3 className="font-serif text-base">{exam.title}</h3>
                <ol className="mt-4 space-y-4">
                  {exam.questions.map((q) => (
                    <li key={q.number} className="text-sm text-[#ECE6D6]">
                      <div className="flex items-start justify-between gap-3">
                        <span>
                          <span className="text-[#8B93A0]">{q.number}. </span>
                          {q.text}
                        </span>
                        <span className="shrink-0 text-xs text-[#8B93A0]">[{q.marks}]</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
