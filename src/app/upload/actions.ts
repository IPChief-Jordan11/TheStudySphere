'use server'

import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import { redirect } from 'next/navigation'
import { PDFDocument } from 'pdf-lib'

const prisma = new PrismaClient()

// Vercel rejects request bodies over ~4.5 MB, so stay safely under that.
const MAX_FILE_BYTES = 4 * 1024 * 1024
const OCR_TIMEOUT_MS = 60_000
const PAGES_PER_CHUNK = 3

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// Errors whose message is safe and useful to show to the student.
class UserFacingError extends Error {}

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

async function handleUpload(
  formData: FormData,
  userId: string,
  supabase: SupabaseClient
): Promise<{ error?: string }> {
  const moduleId = formData.get('moduleId')
  const file = formData.get('file')

  if (typeof moduleId !== 'string' || !moduleId) {
    return { error: 'Please choose a module.' }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Please choose a file to upload.' }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: 'That file is over 4 MB. Please upload a smaller file for now.' }
  }

  // moduleId comes from the browser, so confirm it belongs to this user.
  const owner = await prisma.student.findUnique({
    where: { authUserId: userId },
    select: { modules: { select: { id: true } } },
  })
  if (!owner?.modules.some((m) => m.id === moduleId)) {
    return { error: 'That module could not be found.' }
  }

  const fileExt = (file.name.split('.').pop() ?? '').toLowerCase()
  const isPdf = file.type === 'application/pdf' || fileExt === 'pdf'
  const filePath = `${userId}/${Date.now()}.${fileExt}`

  // 1. Upload the original file to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file)

  if (uploadError) {
    console.error('Storage upload failed:', uploadError)
    return { error: 'Could not save your file. Please try again.' }
  }

  try {
    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)
    const fileUrl = publicUrlData.publicUrl

    // 2. Run OCR (PDFs are split into 3-page chunks, images are sent as one request)
    const fileBuffer = await file.arrayBuffer()
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
      const chunkTexts: string[] = []

      for (let start = 0; start < totalPages; start += PAGES_PER_CHUNK) {
        const end = Math.min(start + PAGES_PER_CHUNK, totalPages)
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

        realChars += chunkText.length
        chunkTexts.push(
          `--- Pages ${start + 1}-${end} ---\n\n${
            chunkText || '(No text could be extracted from this section)'
          }`
        )
      }

      extractedText = chunkTexts.join('\n\n')
    } else {
      const mime = file.type || 'image/jpeg'
      const text = await ocrWithRetry(Buffer.from(fileBuffer).toString('base64'), mime)
      realChars = text.length
      extractedText = text
    }

    if (realChars < 20) {
      throw new UserFacingError(
        "We couldn't read any text from this file. Try a clearer scan or a text-based PDF."
      )
    }

    // 3. Save the document record in the database
    await prisma.uploadedDocument.create({
      data: {
        fileName: file.name,
        fileUrl,
        extractedText,
        moduleId,
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

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const result = await handleUpload(formData, user.id, supabase)

  // redirect() works by throwing, so it must stay outside any try/catch.
  if (result.error) {
    redirect(`/upload?error=${encodeURIComponent(result.error)}`)
  }

  redirect('/dashboard')
}
