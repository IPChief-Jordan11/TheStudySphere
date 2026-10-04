import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'

const PAGE_WIDTH = 595.28 // A4
const PAGE_HEIGHT = 841.89
const MARGIN = 50
const LINE_HEIGHT = 16

type Cursor = { doc: PDFDocument; page: PDFPage; y: number; font: PDFFont; bold: PDFFont }

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const trial = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = trial
    }
  }
  if (current) lines.push(current)
  return lines
}

async function newCursor(doc: PDFDocument): Promise<Cursor> {
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  return { doc, page, y: PAGE_HEIGHT - MARGIN, font, bold }
}

function ensureSpace(cursor: Cursor, neededHeight: number): Cursor {
  if (cursor.y - neededHeight < MARGIN) {
    const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    return { ...cursor, page, y: PAGE_HEIGHT - MARGIN }
  }
  return cursor
}

function drawText(cursor: Cursor, text: string, size: number, bold = false): Cursor {
  const font = bold ? cursor.bold : cursor.font
  const maxWidth = PAGE_WIDTH - MARGIN * 2
  const lines = wrapLine(text, font, size, maxWidth)

  let current = cursor
  for (const line of lines) {
    current = ensureSpace(current, LINE_HEIGHT)
    current.page.drawText(line, { x: MARGIN, y: current.y, size, font, color: rgb(0.1, 0.1, 0.1) })
    current = { ...current, y: current.y - LINE_HEIGHT }
  }
  return current
}

function drawSpacer(cursor: Cursor, height: number): Cursor {
  return ensureSpace({ ...cursor, y: cursor.y - height }, 0)
}

type TopicSummary = { topicTitle: string; summary: string }
type Flashcard = { question: string; answer: string; topic?: string }
type QuizQuestion = { question: string; options: string[]; correctIndex: number; topic?: string }

export async function buildNotesPdf(
  title: string,
  summaryTopics: TopicSummary[],
  flashcards: Flashcard[],
  quiz: QuizQuestion[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  let cursor = await newCursor(doc)

  cursor = drawText(cursor, title, 18, true)
  cursor = drawSpacer(cursor, 10)

  cursor = drawText(cursor, 'Summary', 14, true)
  cursor = drawSpacer(cursor, 4)
  for (const t of summaryTopics) {
    if (t.topicTitle) cursor = drawText(cursor, t.topicTitle, 11, true)
    cursor = drawText(cursor, t.summary, 11)
    cursor = drawSpacer(cursor, 8)
  }

  cursor = drawSpacer(cursor, 10)
  cursor = drawText(cursor, 'Flashcards', 14, true)
  cursor = drawSpacer(cursor, 4)
  flashcards.forEach((f, i) => {
    cursor = drawText(cursor, `${i + 1}. ${f.question}`, 11, true)
    cursor = drawText(cursor, `   ${f.answer}`, 11)
    cursor = drawSpacer(cursor, 6)
  })

  cursor = drawSpacer(cursor, 10)
  cursor = drawText(cursor, 'Quiz', 14, true)
  cursor = drawSpacer(cursor, 4)
  quiz.forEach((q, i) => {
    cursor = drawText(cursor, `${i + 1}. ${q.question}`, 11, true)
    q.options.forEach((opt, j) => {
      const marker = j === q.correctIndex ? '*' : ' '
      cursor = drawText(cursor, `   ${marker} ${opt}`, 11)
    })
    cursor = drawSpacer(cursor, 6)
  })
  cursor = drawSpacer(cursor, 10)
  cursor = drawText(cursor, '(* marks the correct answer)', 9)

  return doc.save()
}

type ExamQuestion = { number: number; text: string; marks: number }

export async function buildExamPdf(title: string, questions: ExamQuestion[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  let cursor = await newCursor(doc)

  cursor = drawText(cursor, title, 18, true)
  cursor = drawSpacer(cursor, 14)

  for (const q of questions) {
    cursor = drawText(cursor, `${q.number}. ${q.text}  [${q.marks} marks]`, 12)
    cursor = drawSpacer(cursor, 10)
  }

  return doc.save()
}
