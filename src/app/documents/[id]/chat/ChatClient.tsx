'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { askTutor, loadChatHistory } from './actions'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const suggestions = [
  'Explain the main idea in simple terms',
  'What are the key terms I should know?',
  'Quiz me with one question',
]

export default function ChatClient({ documentId }: { documentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    loadChatHistory(documentId).then((result) => {
      if (cancelled) return
      if (Array.isArray(result)) {
        setMessages(result)
      }
      // A load error is quietly ignored — the student can still start a new
      // conversation, and asking a question will surface a real error if one persists.
      setHistoryLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [documentId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    const history = messages
    setError('')
    setInput('')
    setMessages([...history, { role: 'user', content: question }])
    setLoading(true)

    try {
      const result = await askTutor(documentId, history, question)
      if ('error' in result) {
        // Put the question back in the box so nothing is lost.
        setError(result.error)
        setInput(question)
        setMessages(history)
      } else {
        setMessages((current) => [...current, { role: 'assistant', content: result.reply }])
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setInput(question)
      setMessages(history)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6">
      <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        {historyLoaded && messages.length === 0 && (
          <div>
            <p className="text-sm text-[var(--color-muted)]">Ask anything about this document. For example:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-left text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm [overflow-wrap:anywhere] ${
                m.role === 'user'
                  ? 'bg-[var(--color-primary)]/20 text-[var(--color-text)]'
                  : 'border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="prose-tutor">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-sm text-[var(--color-muted)]">
              Thinking…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question…"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-primary)]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
