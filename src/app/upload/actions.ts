'use server'

import { createClient } from '@/lib/supabase/server'
import { PrismaClient } from '@prisma/client'
import { redirect } from 'next/navigation'
import { PDFDocument } from 'pdf-lib'

const prisma = new PrismaClient()

async function ocrChunk(base64Pdf: string): Promise<string> {
  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: {
      apikey: process.env.OCR_SPACE_API_KEY!,
    },
    body: new URLSearchParams({
      base64Image: `data:application/pdf;base64,${base64Pdf}`,
      language: 'eng',
      isOverlayRequired: 'false',
      filetype: 'PDF',
    }),
  })

  const rawText = await response.text()

  let result
  try {
    result = JSON.parse(rawText)
  } catch {
    throw new Error(`OCR API did not return JSON. Status: ${response.status}. Response: ${rawText.slice(0, 200)}`)
  }

  if (!result?.ParsedResults?.length) {
    return '(No text could be extracted from this section)'
  }

  return result.ParsedResults.map((page: { ParsedText: string }) => page.ParsedText).join('\n\n')
}

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const moduleId = formData.get('moduleId') as string
  const file = formData.get('file') as File

  if (!file || file.size === 0) {
    throw new Error('No file provided')
  }

  // 1. Upload the original file to Supabase Storage
  const fileExt = file.name.split('.').pop()
  const filePath = `${user.id}/${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file)

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`)
  }

  const { data: publicUrlData } = supabase.storage
    .from('documents')
    .getPublicUrl(filePath)

  const fileUrl = publicUrlData.publicUrl

  // 2. Run OCR — chunk into groups of 3 pages if it's a PDF with more than 3 pages
  const fileBuffer = await file.arrayBuffer()
  let extractedText: string

  const isPdf = file.type === 'application/pdf' || fileExt?.toLowerCase() === 'pdf'

  if (isPdf) {
    const sourcePdf = await PDFDocument.load(fileBuffer)
    const totalPages = sourcePdf.getPageCount()
    const chunkSize = 3
    const chunkTexts: string[] = []

    for (let start = 0; start < totalPages; start += chunkSize) {
      const end = Math.min(start + chunkSize, totalPages)
      const chunkDoc = await PDFDocument.create()
      const pageIndices = Array.from({ length: end - start }, (_, i) => start + i)
      const copiedPages = await chunkDoc.copyPages(sourcePdf, pageIndices)
      copiedPages.forEach((p) => chunkDoc.addPage(p))

      const chunkBytes = await chunkDoc.save()
      const chunkBase64 = Buffer.from(chunkBytes).toString('base64')

      const chunkText = await ocrChunk(chunkBase64)
      chunkTexts.push(`--- Pages ${start + 1}-${end} ---\n\n${chunkText}`)
    }

    extractedText = chunkTexts.join('\n\n')
  } else {
    // Non-PDF (image) files go through OCR directly via URL, same as before
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: process.env.OCR_SPACE_API_KEY!,
      },
      body: new URLSearchParams({
        url: fileUrl,
        language: 'eng',
        isOverlayRequired: 'false',
      }),
    })

    const rawText = await response.text()

    let result
    try {
      result = JSON.parse(rawText)
    } catch {
      throw new Error(`OCR API did not return JSON. Status: ${response.status}. Response: ${rawText.slice(0, 200)}`)
    }

    extractedText =
      result?.ParsedResults?.length > 0
        ? result.ParsedResults.map((page: { ParsedText: string }) => page.ParsedText).join('\n\n')
        : '(No text could be extracted)'
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

  redirect('/dashboard')
}