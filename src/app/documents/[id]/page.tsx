import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { generateStudyMaterials } from './actions'
import { generateExamPaper } from './exam-actions'
import { updateExtractedText } from './edit-text-actions'
import AppShell from '../../components/AppShell'
import DeleteDocumentButton from '../../components/DeleteDocumentButton'
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

function DownloadPdfLink({ href, isPremium, label }: { href: string; isPremium: boolean; label: string }) {
  if (isPremium) {
    return (
      <a
        href={href}
        className="rounded-full border border-[var(--color-secondary)] px-3 py-1 text-xs font-medium text-[var(--color-secondary)] transition-colors hover:bg-[var(--color-secondary)]/10"
      >
        {label}
      </a>
    )
  }
  return (
    <Link
      href="/account"
      title="Downloadable PDFs are a Premium feature"
      className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
    >
      {label} 🔒 Premium
    </Link>
  )
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

  const isPremium = Boolean(student?.premiumUntil && student.premiumUntil > new Date())

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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={`/documents/${id}/chat`}
            className="inline-block rounded-full border border-[var(--color-primary)] px-5 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/10"
          >
            Ask the AI tutor
          </Link>
          <DeleteDocumentButton
            documentId={id}
            fileName={document.fileName}
            className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm text-[var(--color-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)]"
          />
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}

        {!summaryTopics && (
          <form action={handleGenerate} className="mt-4">
            <button
              type="submit"
              className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-90"
            >
              Generate study materials
            </button>
          </form>
        )}

        {summaryTopics && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-lg">Summary</h2>
              <DownloadPdfLink
                href={`/api/documents/${id}/pdf`}
                isPremium={isPremium}
                label="Download PDF"
              />
            </div>
            {summaryTopics.map((t, i) => (
              <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
                {t.topicTitle && (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">
                    {t.topicTitle}
                  </p>
                )}
                <p className="text-sm leading-relaxed text-[var(--color-text)]">{t.summary}</p>
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
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">
                      {group.topic}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {group.items.map((f, i) => (
                      <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                        <p className="text-sm font-medium text-[var(--color-text)]">{f.question}</p>
                        <p className="mt-2 text-sm text-[var(--color-muted)]">{f.answer}</p>
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
              <p className="mt-6 text-xs text-[var(--color-muted)]">
                This quiz covers {quizByTopic.length} topics from the document.
              </p>
            )}
            <QuizClient documentId={id} quiz={quiz} />
          </>
        )}

        <details className="mt-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-text)]">
            Edit extracted text
          </summary>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Fix anything OCR got wrong. Already-generated summaries, flashcards, or quizzes won't
            update automatically — regenerate them above after saving a fix.
          </p>
          <form action={updateExtractedText} className="mt-3 space-y-2">
            <input type="hidden" name="documentId" value={id} />
            <textarea
              name="extractedText"
              defaultValue={document.extractedText ?? ''}
              rows={14}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            />
            <button
              type="submit"
              className="rounded-full bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90"
            >
              Save text
            </button>
          </form>
        </details>

        {document.kind !== 'past_paper' && (
          <div className="mt-10 border-t border-[var(--color-border)] pt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-lg">Exam-style practice paper</h2>
              <form action={handleGenerateExam}>
                <button
                  type="submit"
                  className="rounded-full border border-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/10"
                >
                  {exam ? 'Regenerate' : 'Generate exam-style questions'}
                </button>
              </form>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Uses a past paper you've uploaded for this module as a style guide, if one exists.
            </p>

            {exam && (
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-serif text-base">{exam.title}</h3>
                  <DownloadPdfLink
                    href={`/api/documents/${id}/exam-pdf`}
                    isPremium={isPremium}
                    label="Download PDF"
                  />
                </div>
                <ol className="mt-4 space-y-4">
                  {exam.questions.map((q) => (
                    <li key={q.number} className="text-sm text-[var(--color-text)]">
                      <div className="flex items-start justify-between gap-3">
                        <span>
                          <span className="text-[var(--color-muted)]">{q.number}. </span>
                          {q.text}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--color-muted)]">[{q.marks}]</span>
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
