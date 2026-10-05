import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Groq's free tier allows 8,000 tokens per minute, TOTAL across every user of
// this app, not per person. We stay under that with a safety margin, and we
// check this against a shared database table rather than an in-memory
// counter, since Vercel runs each request on its own isolated instance — an
// in-memory counter would silently see nothing from other users' requests.
const TOKEN_LIMIT_PER_MINUTE = 7_000
const WINDOW_MS = 60_000
const MAX_WAIT_MS = 90_000
const POLL_INTERVAL_MS = 4_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Groq bills by tokens, not characters, but token counts aren't known until
// after the call. ~4 characters per token is a standard, reasonably accurate
// estimate for English text, good enough for staying under a shared limit.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + 500 // +500 covers the model's reply
}

// Call this right before every Groq request. It waits if the shared app-wide
// budget is currently full, then reserves space for this call and returns.
// Throws if it's still full after waiting, so the caller can show a clear
// "busy right now" message instead of Groq's own confusing 429.
export async function reserveGroqCapacity(estimatedTokens: number): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS

  while (true) {
    const windowStart = new Date(Date.now() - WINDOW_MS)

    const recent = await prisma.groqCallLog.aggregate({
      where: { createdAt: { gte: windowStart } },
      _sum: { estimatedTokens: true },
    })
    const usedTokens = recent._sum.estimatedTokens ?? 0

    if (usedTokens + estimatedTokens <= TOKEN_LIMIT_PER_MINUTE) {
      await prisma.groqCallLog.create({ data: { estimatedTokens } })
      // Occasionally clear out old rows so this table doesn't grow forever.
      if (Math.random() < 0.05) {
        await prisma.groqCallLog
          .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - WINDOW_MS * 2) } } })
          .catch(() => {})
      }
      return
    }

    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      throw new Error('GROQ_CAPACITY_BUSY')
    }

    await sleep(POLL_INTERVAL_MS)
  }
}
