'use client'

import { useState } from 'react'
import { saveQuizAttempt } from './quiz-actions'

type QuizQuestion = { question: string; options: string[]; correctIndex: number }

export default function QuizClient({
  documentId,
  quiz,
}: {
  documentId: string
  quiz: QuizQuestion[]
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(quiz.map(() => null))
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const score = quiz.reduce((sum, q, i) => sum + (answers[i] === q.correctIndex ? 1 : 0), 0)
  const allAnswered = answers.every((a) => a !== null)

  function pick(questionIndex: number, optionIndex: number) {
    if (submitted) return
    setAnswers((current) => {
      const next = [...current]
      next[questionIndex] = optionIndex
      return next
    })
  }

  async function submit() {
    setSubmitted(true)
    setSaving(true)
    setSaveError('')
    const result = await saveQuizAttempt(documentId, score, quiz.length)
    if ('error' in result) setSaveError(result.error)
    setSaving(false)
  }

  function retake() {
    setAnswers(quiz.map(() => null))
    setSubmitted(false)
    setSaveError('')
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg">Quiz</h2>
        {submitted && (
          <p className="text-sm font-medium text-[var(--color-secondary)]">
            Score: {score} / {quiz.length}
          </p>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {quiz.map((q, i) => (
          <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
            <p className="text-sm font-medium text-[var(--color-text)]">{q.question}</p>
            <ul className="mt-3 space-y-1.5">
              {q.options.map((opt, j) => {
                const isPicked = answers[i] === j
                const isCorrect = j === q.correctIndex

                let style = 'text-[var(--color-muted)] hover:bg-[var(--color-bg)]'
                if (submitted) {
                  if (isCorrect) style = 'bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]'
                  else if (isPicked) style = 'bg-[var(--color-error)]/15 text-[var(--color-error)]'
                } else if (isPicked) {
                  style = 'bg-[var(--color-primary)]/15 text-[var(--color-text)]'
                }

                return (
                  <li key={j}>
                    <button
                      type="button"
                      disabled={submitted}
                      onClick={() => pick(i, j)}
                      className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-default ${style}`}
                    >
                      {opt}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {!submitted ? (
        <button
          type="button"
          onClick={submit}
          disabled={!allAnswered}
          className="mt-4 rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit
        </button>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={retake}
            className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-panel)]"
          >
            Retake quiz
          </button>
          {saving && <span className="text-xs text-[var(--color-muted)]">Saving…</span>}
          {saveError && <span className="text-xs text-[var(--color-error)]">{saveError}</span>}
        </div>
      )}
    </div>
  )
}
