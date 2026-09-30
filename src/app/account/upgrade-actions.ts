'use server'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getPaynow, PREMIUM_PRICE_USD, PREMIUM_DAYS } from '@/lib/paynow'

const prisma = new PrismaClient()

type StartResult =
  | { ok: true; method: 'card'; redirectUrl: string; reference: string }
  | { ok: true; method: 'ecocash'; instructions: string; reference: string }
  | { error: string }

function getBaseUrl(): string {
  // Prefer the real deployed URL Vercel provides; fall back to localhost for
  // local testing (the webhook won't reach localhost, but card redirects and
  // the manual "check status" button still work).
  const vercelUrl = process.env.VERCEL_URL
  return vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000'
}

async function getStudentOrRedirect() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const student = await prisma.student.findUnique({ where: { authUserId: user.id } })
  if (!student) redirect('/onboarding')
  return student
}

export async function startCardPayment(): Promise<StartResult> {
  if (!process.env.PAYNOW_INTEGRATION_ID) {
    return { error: 'Payments are not set up yet. Please try again later.' }
  }
  const student = await getStudentOrRedirect()

  const reference = `studysphere-${student.id}-${Date.now()}`
  const paynow = getPaynow(getBaseUrl())
  const payment = paynow.createPayment(reference, student.email)
  payment.add('StudySphere Premium (1 month)', PREMIUM_PRICE_USD)

  try {
    const response = await paynow.send(payment)
    if (!response.success) {
      return { error: 'Paynow could not start this payment. Please try again.' }
    }

    await prisma.payment.create({
      data: {
        studentId: student.id,
        reference,
        amount: PREMIUM_PRICE_USD,
        method: 'card',
        status: 'sent',
        pollUrl: response.pollUrl,
      },
    })

    return { ok: true, method: 'card', redirectUrl: response.redirectUrl, reference }
  } catch (err) {
    console.error('Paynow card payment failed to start:', err)
    return { error: 'Something went wrong starting the payment. Please try again.' }
  }
}

export async function startEcocashPayment(phone: string): Promise<StartResult> {
  if (!process.env.PAYNOW_INTEGRATION_ID) {
    return { error: 'Payments are not set up yet. Please try again later.' }
  }
  const cleanPhone = phone.trim()
  if (!/^0\d{9}$/.test(cleanPhone)) {
    return { error: 'Please enter your number as 07XXXXXXXX.' }
  }

  const student = await getStudentOrRedirect()

  const reference = `studysphere-${student.id}-${Date.now()}`
  const paynow = getPaynow(getBaseUrl())
  const payment = paynow.createPayment(reference, student.email)
  payment.add('StudySphere Premium (1 month)', PREMIUM_PRICE_USD)

  try {
    const response = await paynow.sendMobile(payment, cleanPhone, 'ecocash')
    if (!response.success) {
      return { error: response.error || 'Paynow could not start this payment. Please try again.' }
    }

    await prisma.payment.create({
      data: {
        studentId: student.id,
        reference,
        amount: PREMIUM_PRICE_USD,
        method: 'ecocash',
        status: 'sent',
        pollUrl: response.pollUrl,
      },
    })

    return { ok: true, method: 'ecocash', instructions: response.instructions, reference }
  } catch (err) {
    console.error('Paynow EcoCash payment failed to start:', err)
    return { error: 'Something went wrong starting the payment. Please try again.' }
  }
}

// Grants premium once, based on the payment's logged amount — used by both
// the webhook and the manual "check status" button, so neither can grant
// premium twice for the same payment.
async function markPaidAndGrantPremium(paymentId: string, studentId: string) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.status === 'paid') return

    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'paid', paidAt: new Date() },
    })

    const student = await tx.student.findUnique({ where: { id: studentId } })
    const base = student?.premiumUntil && student.premiumUntil > new Date() ? student.premiumUntil : new Date()
    const premiumUntil = new Date(base)
    premiumUntil.setDate(premiumUntil.getDate() + PREMIUM_DAYS)

    await tx.student.update({ where: { id: studentId }, data: { premiumUntil } })
  })
}

// Called from the "I've paid — check status" button. Useful for EcoCash
// (where there's no redirect back to the app) and for local testing, since
// Paynow's automatic webhook can't reach localhost.
export async function checkPaymentStatus(reference: string): Promise<{ paid: boolean; error?: string }> {
  const student = await getStudentOrRedirect()

  const payment = await prisma.payment.findUnique({ where: { reference } })
  if (!payment || payment.studentId !== student.id) {
    return { paid: false, error: 'Payment not found.' }
  }
  if (payment.status === 'paid') {
    return { paid: true }
  }

  const paynow = getPaynow(getBaseUrl())
  try {
    const status = await paynow.pollTransaction(payment.pollUrl)
    if (status.paid()) {
      await markPaidAndGrantPremium(payment.id, student.id)
      revalidatePath('/account')
      return { paid: true }
    }
    return { paid: false }
  } catch (err) {
    console.error('Checking Paynow status failed:', err)
    return { paid: false, error: 'Could not check payment status. Please try again in a moment.' }
  }
}
