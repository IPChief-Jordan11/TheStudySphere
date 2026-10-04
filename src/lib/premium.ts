export const FREE_DAILY_GENERATIONS = 3

// Midnight UTC today. Used as the start of the rolling daily window for free
// accounts — note this resets at UTC midnight, not the student's local time.
export function startOfTodayUTC(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
