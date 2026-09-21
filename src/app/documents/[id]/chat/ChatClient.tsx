'use client'

import { useEffect, useRef, useState } from 'react'
import { askTutor } from './actions'
import ReactMarkdown from 'react-markdown'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const suggestions = [
  'Explain the main idea in simple terms',
  'What are the key terms I should know?',
  'Quiz me with one question',
]

export default function ChatClient({ documentId }: { documentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

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
      <div className="space-y-3 rounded-2xl border border-[#2D3540] bg-[#1A2029] p-4">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-[#8B93A0]">Ask anything about this document. For example:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="rounded-full border border-[#2D3540] px-3 py-1.5 text-left text-xs text-[#8B93A0] transition-colors hover:border-[#5B9DF5] hover:text-[#ECE6D6]"
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
                  ? 'bg-[#5B9DF5]/20 text-[#ECE6D6]'
                  : 'border border-[#2D3540] bg-[#12161C] text-[#ECE6D6]'
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
            <div className="rounded-2xl border border-[#2D3540] bg-[#12161C] px-4 py-2 text-sm text-[#8B93A0]">
              Thinking…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[#E86D5F] bg-[#E86D5F]/10 px-3 py-2 text-sm text-[#E86D5F]">
          {error}
        </p>
      )}

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question…"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-lg border border-[#2D3540] bg-[#12161C] px-3 py-2 text-sm text-[#ECE6D6] outline-none transition-colors focus:border-[#5B9DF5]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-[#5B9DF5] px-5 py-2 text-sm font-medium text-[#12161C] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
