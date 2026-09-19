import { notFound } from 'next/navigation'
import { PrismaClient } from '@prisma/client'
import { generateStudyMaterials } from './actions'
import AppShell from '../../components/AppShell'

const prisma = new PrismaClient()

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const document = await prisma.uploadedDocument.findUnique({
    where: { id },
    include: { generatedContent: true },
  })

  if (!document) {
    notFound()
  }

  const summary = document.generatedContent.find((c) => c.type === 'summary')
  const flashcardsRaw = document.generatedContent.find((c) => c.type === 'flashcards')
  const quizRaw = document.generatedContent.find((c) => c.type === 'quiz')

  const flashcards = flashcardsRaw ? JSON.parse(flashcardsRaw.content) : null
  const quiz = quizRaw ? JSON.parse(quizRaw.content) : null

  async function handleGenerate() {
    'use server'
    await generateStudyMaterials(id)
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl">{document.fileName}</h1>

        {!summary && (
          <form action={handleGenerate} className="mt-4">
            <button
              type="submit"
              className="rounded-full bg-[#E8A33D] px-5 py-2 text-sm font-medium text-[#12161C] transition-opacity hover:opacity-90"
            >
              Generate study materials
            </button>
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
              {flashcards.map((f: { question: string; answer: string }, i: number) => (
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
              {quiz.map(
                (
                  q: { question: string; options: string[]; correctIndex: number },
                  i: number
                ) => (
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
                )
              )}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="font-serif text-lg">Raw extracted text</h2>
          <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[#2D3540] bg-[#1A2029] p-4 text-sm text-[#8B93A0]">
            {document.extractedText}
          </div>
        </div>
      </div>
    </AppShell>
  )
}