/**
 * Basic client-side throttling/queueing for the Gemini-backed grading call,
 * so a teacher scanning a stack of papers doesn't burst past the free-tier
 * rate limits. This is intentionally simple (per-browser localStorage
 * counter + a minimum spacing between requests) — it's not a substitute for
 * server-side rate limiting, but it's enough to keep a single-teacher pilot
 * well under the free tier.
 *
 * Gemini free-tier limits change over time — verify the current per-model
 * RPM/RPD caps at https://ai.google.dev/gemini-api/docs/rate-limits before
 * relying on these defaults, and adjust VITE_GEMINI_DAILY_LIMIT /
 * VITE_GEMINI_MIN_INTERVAL_MS accordingly.
 */

const DAILY_LIMIT = Number(import.meta.env.VITE_GEMINI_DAILY_LIMIT ?? 1400)
const MIN_INTERVAL_MS = Number(import.meta.env.VITE_GEMINI_MIN_INTERVAL_MS ?? 4500)
const STORAGE_KEY = 'gradesnap:gemini-usage'

interface UsageState {
  day: string
  count: number
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function readUsage(): UsageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { day: today(), count: 0 }
    const parsed = JSON.parse(raw) as UsageState
    return parsed.day === today() ? parsed : { day: today(), count: 0 }
  } catch {
    return { day: today(), count: 0 }
  }
}

function writeUsage(state: UsageState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage unavailable (private browsing etc.) — throttling degrades to spacing-only
  }
}

export class GeminiRateLimitError extends Error {}

let lastRequestAt = 0
let queue: Promise<void> = Promise.resolve()

/** Serializes calls, enforces a minimum spacing between them, and refuses new
 * calls once today's conservative usage cap is reached. */
export function throttledGeminiCall<T>(fn: () => Promise<T>): Promise<T> {
  const usage = readUsage()
  if (usage.count >= DAILY_LIMIT) {
    return Promise.reject(
      new GeminiRateLimitError(
        `You've reached today's AI grading limit (${DAILY_LIMIT} scans) for this device. Try again tomorrow, or enter this grade manually.`,
      ),
    )
  }

  const run = queue.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt))
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastRequestAt = Date.now()
    writeUsage({ day: usage.day, count: usage.count + 1 })
    return fn()
  })
  // Keep the queue alive even if this call fails, so later calls still run in order.
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
