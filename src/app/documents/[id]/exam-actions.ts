'use server'

import Groq from 'groq-sdk'
import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const prisma = new PrismaClient()

const MODEL = 'openai/gpt-oss-120b'

// Same rate-limit reasoning as the regular generation action: Groq's free
// tier allows 8,000 tokens per minute, so keep the combined prompt well
// under that.
const NOTES_CHARS = 10_000
const STYLE_SAMPLE_CHARS = 3_000

const MIN_QUESTIONS = 3
const MAX_QUESTIONS = 12

type ExamQuestion = { number: number; text: string; marks: number }
type ExamPaper = { title: string; questions: ExamQuestion[] }

class UserFacingError extends Error {}

function getGroq() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')
  return new Groq({ apiKey, timeout: 30_000, maxRetries: 1 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

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

function cleanExamPaper(raw: unknown): ExamPaper | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const title = isNonEmptyString(obj.title) ? obj.title.trim() : 'Practice Exam'

  const questions = (Array.isArray(obj.questions) ? obj.questions : [])
    .map((q, i) => {
      if (!q || typeof q !== 'object') return null
      const { text, marks } = q as { text?: unknown; marks?: unknown }
      if (!isNonEmptyString(text)) return null
      const cleanMarks = Number.isFinite(Number(marks)) && Number(marks) > 0 ? Math.round(Number(marks)) : 10
      return { number: i + 1, text: text.trim(), marks: cleanMarks }
    })
    .filter((q): q is ExamQuestion => q !== null)
    .slice(0, MAX_QUESTIONS)

  if (questions.length < MIN_QUESTIONS) return null

  return { title, questions }
}

function buildPrompt(notes: string, styleSample: string | null): string {
  const styleBlock = styleSample
    ? `Here is a real past exam paper for this module, to use ONLY as a style guide — match its tone, question phrasing, structure, and roughly how marks are distributed. Do NOT reuse its actual questions or content.

PAST PAPER (style reference only):
${styleSample}

`
    : ''

  return `You are an exam-setter writing a practice exam for a student, based on their own study notes below.
${styleBlock}Using the student's notes, write a full exam-style question paper that:
- Covers a broad, representative spread of the material in the notes
- Uses realistic exam phrasing (e.g. "Explain...", "Discuss...", "Calculate...", "Compare and contrast...")
- Assigns a sensible number of marks to each question
${styleSample ? '- Matches the style, structure and difficulty of the past paper shown above' : '- Uses a standard, professional exam style, since no past paper was provided'}

Respond ONLY with valid JSON in this exact shape, with no markdown fences and nothing else:
{
  "title": "...",
  "questions": [{"text": "...", "marks": 10}]
}

STUDENT'S NOTES:
${notes}`
}

async function generateExam(notes: string, styleSample: string | null): Promise<ExamPaper> {
  const groq = getGroq()

  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: buildPrompt(notes, styleSample) }],
    })

    const responseText = completion.choices[0]?.message?.content ?? ''
    const exam = cleanExamPaper(extractJson(responseText))
    if (exam) return exam

    console.error(
      `Exam generation output failed validation (attempt ${attempt}). Start of response:`,
      responseText.slice(0, 300)
    )
  }

  throw new UserFacingError(
    'The AI returned an unexpected response. Please try generating again.'
  )
}

async function createExamPaper(documentId: string, userId: string): Promise<string | null> {
  try {
    const student = await prisma.student.findUnique({
      where: { authUserId: userId },
      include: { modules: { select: { id: true } } },
    })

    const document = await prisma.uploadedDocument.findUnique({
      where: { id: documentId },
    })

    if (!document || !student?.modules.some((m) => m.id === document.moduleId)) {
      return 'That document could not be found.'
    }
    if (document.kind === 'past_paper') {
      return 'This document is marked as a past paper, not a notes document. Open a notes document instead.'
    }
    if (!document.extractedText || document.extractedText.trim().length < 20) {
      return 'This document has no readable text to generate an exam from.'
    }

    // Look for a past paper uploaded to the same module, to use as a style guide.
    // This is optional — the exam is still generated without one.
    const pastPaper = await prisma.uploadedDocument.findFirst({
      where: { moduleId: document.moduleId, kind: 'past_paper' },
      orderBy: { createdAt: 'desc' },
    })

    const notes = document.extractedText.slice(0, NOTES_CHARS)
    const styleSample = pastPaper?.extractedText
      ? pastPaper.extractedText.slice(0, STYLE_SAMPLE_CHARS)
      : null

    const exam = await generateExam(notes, styleSample)

    await prisma.$transaction([
      prisma.generatedContent.deleteMany({ where: { documentId, type: 'exam' } }),
      prisma.generatedContent.create({
        data: { type: 'exam', content: JSON.stringify(exam), documentId },
      }),
    ])

    return null
  } catch (err) {
    console.error('Exam generation failed:', err)

    if (err instanceof UserFacingError) return err.message

    const status = (err as { status?: number })?.status
    if (status === 429) {
      return 'The AI service is busy right now. Please wait a minute and try again.'
    }
    if (status === 401 || status === 403 || status === 404) {
      return 'The AI service is not set up correctly. Please try again later.'
    }
    return 'Something went wrong while generating the exam. Please try again.'
  }
}

export async function generateExamPaper(documentId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const errorMessage = await createExamPaper(documentId, user.id)

  if (errorMessage) {
    redirect(`/documents/${documentId}?error=${encodeURIComponent(errorMessage)}`)
  }

  revalidatePath(`/documents/${documentId}`)
  redirect(`/documents/${documentId}`)
}
