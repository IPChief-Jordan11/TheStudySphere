import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { buildExamPdf } from '@/lib/pdf'

const prisma = new PrismaClient()

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

  const examRaw = document.generatedContent.find((c) => c.type === 'exam')?.content
  if (!examRaw) {
    return NextResponse.json({ error: 'Generate an exam paper for this document first.' }, { status: 400 })
  }

  let exam: { title: string; questions: { number: number; text: string; marks: number }[] }
  try {
    exam = JSON.parse(examRaw)
  } catch {
    return NextResponse.json({ error: 'The saved exam paper is corrupted. Please regenerate it.' }, { status: 500 })
  }

  const pdfBytes = await buildExamPdf(exam.title, exam.questions)

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${exam.title.replace(/[^a-z0-9.\- ]/gi, '_')}.pdf"`,
    },
  })
}
