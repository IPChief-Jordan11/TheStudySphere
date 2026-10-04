import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { buildNotesPdf } from '@/lib/pdf'

const prisma = new PrismaClient()

function safeParse<T>(raw: string | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function parseSummary(raw: string | undefined): { topicTitle: string; summary: string }[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // Older documents store summary as a plain string.
  }
  return [{ topicTitle: '', summary: raw }]
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 })

  const student = await prisma.student.findUnique({
    where: { authUserId: user.id },
    include: { modules: { select: { id: true } } },
  })
  const isPremium = Boolean(student?.premiumUntil && student.premiumUntil > new Date())
  if (!isPremium) {
    return NextResponse.json(
      { error: 'Downloadable PDFs are a Premium feature. Upgrade from your Account page.' },
      { status: 403 }
    )
  }

  const document = await prisma.uploadedDocument.findUnique({
    where: { id },
    include: { generatedContent: true },
  })
  if (!document || !student?.modules.some((m) => m.id === document.moduleId)) {
    return NextResponse.json({ error: 'That document could not be found.' }, { status: 404 })
  }

  const summaryTopics = parseSummary(document.generatedContent.find((c) => c.type === 'summary')?.content)
  const flashcards = safeParse<{ question: string; answer: string }[]>(
    document.generatedContent.find((c) => c.type === 'flashcards')?.content
  ) ?? []
  const quiz = safeParse<{ question: string; options: string[]; correctIndex: number }[]>(
    document.generatedContent.find((c) => c.type === 'quiz')?.content
  ) ?? []

  if (summaryTopics.length === 0) {
    return NextResponse.json({ error: 'Generate study materials for this document first.' }, { status: 400 })
  }

  const pdfBytes = await buildNotesPdf(document.fileName, summaryTopics, flashcards, quiz)

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${document.fileName.replace(/[^a-z0-9.\- ]/gi, '_')} - StudySphere Notes.pdf"`,
    },
  })
}
