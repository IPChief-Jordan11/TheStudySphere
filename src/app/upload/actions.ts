'use server'

import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import { PDFDocument } from 'pdf-lib'

const prisma = new PrismaClient()

const OCR_TIMEOUT_MS = 60_000
const PAGES_PER_CHUNK = 3
// OCR.space's free tier limits requests per minute, so chunks run in small
// batches instead of all at once.
const OCR_CONCURRENCY = 3

type SupabaseClient = Awaited<ReturnType<typeof createClient>>
type FinalizeResult = { error?: string }
type DocumentKind = 'notes' | 'past_paper'

// Errors whose message is safe and useful to show to the student.
class UserFacingError extends Error {}

// Runs `worker` over `items` with at most `limit` running at the same time,
// and returns results in the same order as `items`.
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function runNext(): Promise<void> {
    const index = nextIndex++
    if (index >= items.length) return
    results[index] = await worker(items[index], index)
    await runNext()
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext))
  return results
}

async function ocrBase64(base64: string, mime: string): Promise<string> {
  const params = new URLSearchParams({
    base64Image: `data:${mime};base64,${base64}`,
    language: 'eng',
    isOverlayRequired: 'false',
  })
  if (mime === 'application/pdf') {
    params.set('filetype', 'PDF')
  }

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: {
      apikey: process.env.OCR_SPACE_API_KEY!,
    },
    body: params,
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  })

  const rawText = await response.text()

  let result
  try {
    result = JSON.parse(rawText)
  } catch {
    throw new Error(
      `OCR API did not return JSON. Status: ${response.status}. Response: ${rawText.slice(0, 200)}`
    )
  }

  // OCR.space reports failures (bad key, rate limit, file too large) inside a normal
  // JSON response, so check for them explicitly instead of treating them as "no text".
  if (result?.IsErroredOnProcessing) {
    const message = Array.isArray(result.ErrorMessage)
      ? result.ErrorMessage.join(' ')
      : String(result.ErrorMessage ?? 'unknown error')
    throw new Error(`OCR error: ${message}`)
  }

  return (result?.ParsedResults ?? [])
    .map((page: { ParsedText: string }) => page.ParsedText)
    .join('\n\n')
    .trim()
}

// One retry covers most temporary network or rate-limit hiccups.
async function ocrWithRetry(base64: string, mime: string): Promise<string> {
  try {
    return await ocrBase64(base64, mime)
  } catch (err) {
    console.error('OCR attempt 1 failed, retrying once:', err)
    return await ocrBase64(base64, mime)
  }
}

function guessMime(fileName: string): { isPdf: boolean; mime: string } {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf') return { isPdf: true, mime: 'application/pdf' }
  if (ext === 'png') return { isPdf: false, mime: 'image/png' }
  if (ext === 'jpg' || ext === 'jpeg') return { isPdf: false, mime: 'image/jpeg' }
  return { isPdf: false, mime: 'image/jpeg' }
}

async function processAndSave(
  filePath: string,
  fileName: string,
  moduleId: string,
  kind: DocumentKind,
  supabase: SupabaseClient
): Promise<FinalizeResult> {
  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from('documents')
    .download(filePath)

  if (downloadError || !fileBlob) {
    console.error('Downloading uploaded file from Storage failed:', downloadError)
    return { error: 'Could not read your uploaded file. Please try again.' }
  }

  const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(filePath)
  const fileUrl = publicUrlData.publicUrl
  const { isPdf } = guessMime(fileName)

  try {
    const fileBuffer = await fileBlob.arrayBuffer()
    let extractedText: string
    let realChars = 0

    if (isPdf) {
      let sourcePdf: PDFDocument
      try {
        sourcePdf = await PDFDocument.load(fileBuffer)
      } catch (err) {
        console.error('PDF load failed:', err)
        throw new UserFacingError(
          'This PDF could not be opened. It may be password-protected or damaged.'
        )
      }

      const totalPages = sourcePdf.getPageCount()
      const chunkRanges: Array<{ start: number; end: number }> = []
      for (let start = 0; start < totalPages; start += PAGES_PER_CHUNK) {
        chunkRanges.push({ start, end: Math.min(start + PAGES_PER_CHUNK, totalPages) })
      }

      const chunkTexts = await runWithConcurrency(chunkRanges, OCR_CONCURRENCY, async ({ start, end }) => {
        const chunkDoc = await PDFDocument.create()
        const pageIndices = Array.from({ length: end - start }, (_, i) => start + i)
        const copiedPages = await chunkDoc.copyPages(sourcePdf, pageIndices)
        copiedPages.forEach((p) => chunkDoc.addPage(p))

        const chunkBytes = await chunkDoc.save()
        const chunkBase64 = Buffer.from(chunkBytes).toString('base64')

        const started = Date.now()
        const chunkText = await ocrWithRetry(chunkBase64, 'application/pdf')
        console.log(
          `OCR pages ${start + 1}-${end} of ${totalPages} took ${Date.now() - started}ms`
        )

        return `--- Pages ${start + 1}-${end} ---\n\n${
          chunkText || '(No text could be extracted from this section)'
        }`
      })

      realChars = chunkTexts.reduce((sum, t) => sum + t.length, 0)
      extractedText = chunkTexts.join('\n\n')
    } else {
      const { mime } = guessMime(fileName)
      const text = await ocrWithRetry(Buffer.from(fileBuffer).toString('base64'), mime)
      realChars = text.length
      extractedText = text
    }

    if (realChars < 20) {
      throw new UserFacingError(
        "We couldn't read any text from this file. Try a clearer scan or a text-based PDF."
      )
    }

    await prisma.uploadedDocument.create({
      data: {
        fileName,
        fileUrl,
        extractedText,
        moduleId,
        kind,
      },
    })

    return {}
  } catch (err) {
    console.error('Upload processing failed:', err)
    // Don't leave an orphaned file in storage when processing fails.
    await supabase.storage.from('documents').remove([filePath])
    return {
      error:
        err instanceof UserFacingError
          ? err.message
          : 'Something went wrong while reading your document. Please try again.',
    }
  }
}

// Called by the browser after it has already uploaded the file straight to
// Supabase Storage. This action only needs the file's path, not its bytes,
// so it never touches Vercel's request body size limit.
export async function finalizeUpload(
  moduleId: string,
  filePath: string,
  fileName: string,
  kind: DocumentKind = 'notes'
): Promise<FinalizeResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Please log in again.' }
  }
  if (!moduleId || !filePath || !fileName) {
    return { error: 'Missing upload details. Please try again.' }
  }
  // The path the browser uploaded to must belong to this user, so nobody can
  // ask the server to process a file from someone else's folder.
  if (!filePath.startsWith(`${user.id}/`)) {
    return { error: 'That upload could not be verified. Please try again.' }
  }

  const owner = await prisma.student.findUnique({
    where: { authUserId: user.id },
    select: { modules: { select: { id: true } } },
  })
  if (!owner?.modules.some((m) => m.id === moduleId)) {
    return { error: 'That module could not be found.' }
  }

  return processAndSave(filePath, fileName, moduleId, kind, supabase)
}
