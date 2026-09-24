/** Calls fn, and retries exactly once on failure before giving up. */
export async function withRetryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (firstError) {
    // Transient errors (e.g. Gemini 503 "high demand") often clear within a
    // couple seconds, so give it a moment before the retry.
    await new Promise((resolve) => setTimeout(resolve, 2000))
    try {
      return await fn()
    } catch {
      throw firstError
    }
  }
}
