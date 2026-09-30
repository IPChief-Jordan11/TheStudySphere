import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { PREMIUM_DAYS } from '@/lib/paynow'

const prisma = new PrismaClient()

// Paynow POSTs the final payment status here as form-encoded data, including
// a hash we should verify — but verifying it needs the exact same hashing
// Paynow's SDK uses internally, which isn't exposed for a raw incoming
// webhook. So as a safety net, we treat this as a hint only: it tells us
// which payment to re-check, and we always confirm the real status directly
// with Paynow's own poll URL before granting anything, rather than trusting
// the webhook body's "status" field on its own.
export async function POST(req: NextRequest) {
  try {
    const body = await req.formData()
    const reference = String(body.get('reference') ?? '')
    const pollUrl = String(body.get('pollurl') ?? '')

    if (!reference && !pollUrl) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 })
    }

    const payment = await prisma.payment.findFirst({
      where: reference ? { reference } : { pollUrl },
    })
    if (!payment || payment.status === 'paid') {
      return NextResponse.json({ ok: true })
    }

    const { Paynow } = await import('paynow')
    const paynow = new Paynow(process.env.PAYNOW_INTEGRATION_ID, process.env.PAYNOW_INTEGRATION_KEY)
    const status = await paynow.pollTransaction(payment.pollUrl)

    if (status.paid()) {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.payment.findUnique({ where: { id: payment.id } })
        if (!fresh || fresh.status === 'paid') return

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'paid', paidAt: new Date() },
        })

        const student = await tx.student.findUnique({ where: { id: payment.studentId } })
        const base =
          student?.premiumUntil && student.premiumUntil > new Date() ? student.premiumUntil : new Date()
        const premiumUntil = new Date(base)
        premiumUntil.setDate(premiumUntil.getDate() + PREMIUM_DAYS)

        await tx.student.update({ where: { id: payment.studentId }, data: { premiumUntil } })
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Paynow webhook failed:', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
