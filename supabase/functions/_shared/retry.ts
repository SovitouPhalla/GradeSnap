/** Calls fn, and retries exactly once on failure before giving up. */
export async function withRetryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (firstError) {
    try {
      return await fn()
    } catch {
      throw firstError
    }
  }
}
