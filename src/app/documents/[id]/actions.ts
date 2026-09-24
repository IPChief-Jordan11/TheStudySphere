'use server'

import Groq from 'groq-sdk'
import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const prisma = new PrismaClient()

const MODEL = 'openai/gpt-oss-120b'

// Groq's free tier limits requests to 8,000 tokens per minute, so each section
// must stay well under that, and sections are generated one at a time with a
// pause in between rather than all at once.
const SECTION_CHARS = 13_000
// A document only gets split into multiple sections once it's clearly longer
// than one section can hold on its own.
const SPLIT_THRESHOLD_CHARS = 16_000
// Caps how many sections (and therefore how many Groq calls / how long
// generation takes) a single document can trigger.
const MAX_SECTIONS = 6
const DELAY_BETWEEN_SECTIONS_MS = 15_000

// The prompt asks for up to 10 of each; accept a few fewer, but not a broken response.
const MIN_ITEMS = 3
const MAX_ITEMS = 10

type Flashcard = { question: string; answer: string; topic?: string }
type QuizQuestion = { question: string; options: string[]; correctIndex: number; topic?: string }
type SectionMaterials = {
  topicTitle: string
  summary: string
  flashcards: Flashcard[]
  quiz: QuizQuestion[]
}

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

// Splits a long document into sections of roughly SECTION_CHARS each, capped
// to MAX_SECTIONS. Anything beyond that cap is left out, the same trade-off
// as the old single-chunk truncation, just covering far more of the document.
function splitIntoSections(text: string): string[] {
  const sections: string[] = []
  for (let start = 0; start < text.length && sections.length < MAX_SECTIONS; start += SECTION_CHARS) {
    sections.push(text.slice(start, start + SECTION_CHARS))
  }
  return sections
}

// Returns clean, correctly-shaped materials for one section, or null if the
// model's output is unusable. `fallbackTitle` is used if the model doesn't
// give a usable topic title of its own.
function cleanSectionMaterials(raw: unknown, fallbackTitle: string): SectionMaterials | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const summary = obj.summary
  if (!isNonEmptyString(summary)) return null

  const topicTitle = isNonEmptyString(obj.topicTitle) ? obj.topicTitle.trim() : fallbackTitle

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

  return { topicTitle, summary: summary.trim(), flashcards, quiz }
}

function buildPrompt(text: string, multiSection: boolean): string {
  const titleLine = multiSection
    ? 'A short topic title (2-6 words) describing what this specific section covers'
    : 'A short topic title (2-6 words) describing the overall document'

  return `You are helping a student study from their notes. Based on the following text, generate:
1. ${titleLine}
2. A concise summary (3-5 sentences)
3. Up to ten flashcards (question and answer pairs), covering as much of this text as possible
4. Up to ten multiple-choice quiz questions (each with exactly 4 options and correctIndex set to the position 0-3 of the correct option), covering as much of this text as possible
Respond ONLY with valid JSON in this exact shape, with no markdown fences and nothing else:
{
  "topicTitle": "...",
  "summary": "...",
  "flashcards": [{"question": "...", "answer": "..."}],
  "quiz": [{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0}]
}

Text:
${text}`
}

// Asks Groq for one section's materials; if the output is malformed, tries
// once more before giving up on this section.
async function generateSectionMaterials(
  text: string,
  fallbackTitle: string,
  multiSection: boolean
): Promise<SectionMaterials> {
  const groq = getGroq()

  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: buildPrompt(text, multiSection) }],
    })

    const responseText = completion.choices[0]?.message?.content ?? ''
    const materials = cleanSectionMaterials(extractJson(responseText), fallbackTitle)
    if (materials) return materials

    console.error(
      `Groq output failed validation for "${fallbackTitle}" (attempt ${attempt}). Start of response:`,
      responseText.slice(0, 300)
    )
  }

  throw new UserFacingError(
    'The AI returned an unexpected response. Please try generating again.'
  )
}

// Generates materials for every section, one at a time with a pause between
// calls, since Groq's free tier limits total tokens per minute across
// requests, not just per request.
async function generateAllSections(sections: string[]): Promise<SectionMaterials[]> {
  const multiSection = sections.length > 1
  const results: SectionMaterials[] = []

  for (let i = 0; i < sections.length; i++) {
    if (i > 0) await sleep(DELAY_BETWEEN_SECTIONS_MS)

    const fallbackTitle = multiSection ? `Part ${i + 1}` : 'Overview'
    results.push(await generateSectionMaterials(sections[i], fallbackTitle, multiSection))
  }

  return results
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

    const fullText = document.extractedText
    const sections =
      fullText.length > SPLIT_THRESHOLD_CHARS
        ? splitIntoSections(fullText)
        : [fullText.slice(0, SECTION_CHARS)]

    if (sections.length > 1) {
      console.log(
        `Document ${documentId} split into ${sections.length} topic sections for generation`
      )
    } else if (sections[0].length < fullText.length) {
      console.log(
        `Document ${documentId} truncated from ${fullText.length} to ${sections[0].length} chars for generation`
      )
    }

    const sectionResults = await generateAllSections(sections)

    // Store one row per content type. For a single-section document the
    // summary is kept as a plain string, the same shape used before this
    // change, so old client code and old saved documents both still work.
    // For a multi-section document, summary becomes an array of per-topic
    // summaries, and flashcards/quiz are combined into one list, each item
    // tagged with which topic it came from.
    const summaryContent =
      sectionResults.length > 1
        ? JSON.stringify(sectionResults.map((s) => ({ topicTitle: s.topicTitle, summary: s.summary })))
        : sectionResults[0].summary

    const flashcards = sectionResults.flatMap((s) =>
      sectionResults.length > 1
        ? s.flashcards.map((c) => ({ ...c, topic: s.topicTitle }))
        : s.flashcards
    )
    const quiz = sectionResults.flatMap((s) =>
      sectionResults.length > 1
        ? s.quiz.map((q) => ({ ...q, topic: s.topicTitle }))
        : s.quiz
    )

    // Replace any earlier results in one step, so retries never create duplicates
    // and a failure never leaves half-saved content behind.
    await prisma.$transaction([
      prisma.generatedContent.deleteMany({ where: { documentId } }),
      prisma.generatedContent.createMany({
        data: [
          { type: 'summary', content: summaryContent, documentId },
          { type: 'flashcards', content: JSON.stringify(flashcards), documentId },
          { type: 'quiz', content: JSON.stringify(quiz), documentId },
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
