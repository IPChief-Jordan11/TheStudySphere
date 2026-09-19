'use server'

import Groq from 'groq-sdk'
import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export async function generateStudyMaterials(documentId: string) {
  const document = await prisma.uploadedDocument.findUnique({
    where: { id: documentId },
  })

  if (!document || !document.extractedText) {
    throw new Error('No extracted text found for this document')
  }

  const completion = await groq.chat.completions.create({
  model: 'openai/gpt-oss-120b',
    messages: [
      {
        role: 'user',
        content: `You are helping a student study from their notes. Based on the following text, generate:
1. A concise summary (3-5 sentences)
2. Ten flashcards (question and answer pairs), covering as much of the material as possible
3. Ten multiple-choice quiz questions (each with 4 options and the correct answer marked), covering as much of the material as possible
Respond ONLY with valid JSON in this exact shape, nothing else:
{
  "summary": "...",
  "flashcards": [{"question": "...", "answer": "..."}],
  "quiz": [{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0}]
}

Text:
${document.extractedText}`,
      },
    ],
  })

  const responseText = completion.choices[0]?.message?.content ?? '{}'

  let parsed
  try {
    parsed = JSON.parse(responseText)
  } catch {
    throw new Error('Groq did not return valid JSON: ' + responseText.slice(0, 200))
  }

  await prisma.generatedContent.create({
    data: {
      type: 'summary',
      content: parsed.summary,
      documentId,
    },
  })

  await prisma.generatedContent.create({
    data: {
      type: 'flashcards',
      content: JSON.stringify(parsed.flashcards),
      documentId,
    },
  })

  await prisma.generatedContent.create({
    data: {
      type: 'quiz',
      content: JSON.stringify(parsed.quiz),
      documentId,
    },
  })

  revalidatePath(`/documents/${documentId}`)
}