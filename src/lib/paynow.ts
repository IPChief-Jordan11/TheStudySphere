import { Paynow } from 'paynow'

// One shared client, configured from environment variables. Result URL is
// where Paynow POSTs the final payment status (must be a public HTTPS URL,
// so it only works once deployed, not on localhost). Return URL is where the
// browser comes back to after a card payment.
export function getPaynow(baseUrl: string) {
  const paynow = new Paynow(
    process.env.PAYNOW_INTEGRATION_ID,
    process.env.PAYNOW_INTEGRATION_KEY
  )
  paynow.resultUrl = `${baseUrl}/api/paynow/webhook`
  paynow.returnUrl = `${baseUrl}/account?payment=pending`
  return paynow
}

export const PREMIUM_PRICE_USD = 5
export const PREMIUM_DAYS = 30
