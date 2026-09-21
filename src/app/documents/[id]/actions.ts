'use server'

import Groq from 'groq-sdk'
import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const prisma = new PrismaClient()

const MODEL = 'openai/gpt-oss-120b'

// Groq's free tier limits how many tokens one request/minute can use, so very long
// documents are cut off here. Raise this if your Groq limits allow more.
const MAX_INPUT_CHARS = 24_000

// The prompt asks for 10 of each; accept a few fewer, but not a broken response.
const MIN_ITEMS = 5
const MAX_ITEMS = 10

type Flashcard = { question: string; answer: string }
type QuizQuestion = { question: string; options: string[]; correctIndex: number }
type Materials = { summary: string; flashcards: Flashcard[]; quiz: QuizQuestion[] }

// Errors whose message is safe and useful to show to the student.
class UserFacingError extends Error {}

function getGroq() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set')
  }
  return new Groq({ apiKey, timeout: 30_000, maxRetries: 1 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Tolerates ```json fences or stray text around the JSON object.
function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

// Returns clean, correctly-shaped materials, or null if the model's output is unusable.
function cleanMaterials(raw: unknown): Materials | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const summary = obj.summary
  if (!isNonEmptyString(summary)) return null

  const flashcards = (Array.isArray(obj.flashcards) ? obj.flashcards : [])
    .filter(
      (c): c is Flashcard =>
        !!c &&
        typeof c === 'object' &&
        isNonEmptyString((c as Flashcard).question) &&
        isNonEmptyString((c as Flashcard).answer)
    )
    .slice(0, MAX_ITEMS)

  const quiz = (Array.isArray(obj.quiz) ? obj.quiz : [])
    .filter((q): q is QuizQuestion => {
      if (!q || typeof q !== 'object') return false
      const { question, options, correctIndex } = q as QuizQuestion
      return (
        isNonEmptyString(question) &&
        Array.isArray(options) &&
        options.length === 4 &&
        options.every(isNonEmptyString) &&
        Number.isInteger(correctIndex) &&
        correctIndex >= 0 &&
        correctIndex < 4
      )
    })
    .slice(0, MAX_ITEMS)

  if (flashcards.length < MIN_ITEMS || quiz.length < MIN_ITEMS) return null

  return { summary: summary.trim(), flashcards, quiz }
}

function buildPrompt(text: string): string {
  return `You are helping a student study from their notes. Based on the following text, generate:
1. A concise summary (3-5 sentences)
2. Ten flashcards (question and answer pairs), covering as much of the material as possible
3. Ten multiple-choice quiz questions (each with exactly 4 options and correctIndex set to the position 0-3 of the correct option), covering as much of the material as possible
Respond ONLY with valid JSON in this exact shape, with no markdown fences and nothing else:
{
  "summary": "...",
  "flashcards": [{"question": "...", "answer": "..."}],
  "quiz": [{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0}]
}

Text:
${text}`
}

// Asks Groq for materials; if the output is malformed, tries once more before giving up.
async function generateMaterials(text: string): Promise<Materials> {
  const groq = getGroq()

  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: buildPrompt(text) }],
    })

    const responseText = completion.choices[0]?.message?.content ?? ''
    const materials = cleanMaterials(extractJson(responseText))
    if (materials) return materials

    console.error(
      `Groq output failed validation (attempt ${attempt}). Start of response:`,
      responseText.slice(0, 300)
    )
  }

  throw new UserFacingError(
    'The AI returned an unexpected response. Please try generating again.'
  )
}

// Does the real work. Returns an error message for the student, or null on success.
async function createMaterials(documentId: string, userId: string): Promise<string | null> {
  try {
    const student = await prisma.student.findUnique({
      where: { authUserId: userId },
      include: { modules: { select: { id: true } } },
    })

    const document = await prisma.uploadedDocument.findUnique({
      where: { id: documentId },
    })

    // The document must exist AND belong to one of this user's modules.
    if (!document || !student?.modules.some((m) => m.id === document.moduleId)) {
      return 'That document could not be found.'
    }

    if (!document.extractedText || document.extractedText.trim().length < 20) {
      return 'This document has no readable text to study from.'
    }

    const text = document.extractedText.slice(0, MAX_INPUT_CHARS)
    if (text.length < document.extractedText.length) {
      console.log(
        `Document ${documentId} truncated from ${document.extractedText.length} to ${text.length} chars for generation`
      )
    }

    const materials = await generateMaterials(text)

    // Replace any earlier results in one step, so retries never create duplicates
    // and a failure never leaves half-saved content behind.
    await prisma.$transaction([
      prisma.generatedContent.deleteMany({ where: { documentId } }),
      prisma.generatedContent.createMany({
        data: [
          { type: 'summary', content: materials.summary, documentId },
          { type: 'flashcards', content: JSON.stringify(materials.flashcards), documentId },
          { type: 'quiz', content: JSON.stringify(materials.quiz), documentId },
        ],
      }),
    ])

    return null
  } catch (err) {
    console.error('Study material generation failed:', err)

    if (err instanceof UserFacingError) return err.message

    const status = (err as { status?: number })?.status
    if (status === 429) {
      return 'The AI service is busy right now. Please wait a minute and try again.'
    }
    if (status === 401 || status === 403 || status === 404) {
      return 'The AI service is not set up correctly. Please try again later.'
    }
    return 'Something went wrong while generating your study materials. Please try again.'
  }
}

export async function generateStudyMaterials(documentId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const errorMessage = await createMaterials(documentId, user.id)

  // redirect() works by throwing, so it must stay outside any try/catch.
  if (errorMessage) {
    redirect(`/documents/${documentId}?error=${encodeURIComponent(errorMessage)}`)
  }

  revalidatePath(`/documents/${documentId}`)
  // Redirecting to the clean URL also clears any old ?error= message.
  redirect(`/documents/${documentId}`)
}
