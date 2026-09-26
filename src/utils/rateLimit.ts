/**
 * Rate-limit reporting, kept free of userscript-only imports so the messages the
 * UI shows can be regression-tested.
 */

/**
 * Thrown when the API responds with 429 Too Many Requests.
 * Carries the wait time from the `Retry-After` header (or a safe default).
 */
export class RateLimitError extends Error {
    /** Milliseconds to wait before retrying */
    readonly retryAfterMs: number
    constructor(retryAfterHeader: string | null) {
        super('Too Many Requests (429)')
        this.name = 'RateLimitError'
        const secs = retryAfterHeader != null ? Number.parseInt(retryAfterHeader, 10) : Number.NaN
        // Default to 30 s if the header is missing or unparseable
        this.retryAfterMs = Number.isFinite(secs) && secs > 0 ? secs * 1000 : 30_000
    }
}

/**
 * A list load that fails is worth naming precisely: a 429 is temporary and worth
 * retrying, anything else usually is not. `fetchAllConversations` resolves with
 * whatever it collected and reports the failure through its `onError` callback,
 * so without this the dialog shows `0 / 0` — indistinguishable from an account
 * with no conversations.
 */
export function describeListError(error: unknown): string {
    if (error instanceof RateLimitError) {
        const seconds = Math.ceil(error.retryAfterMs / 1000)
        return `ChatGPT is rate limiting the conversation list (HTTP 429). Retry in about ${seconds}s.`
    }
    if (error instanceof Error && error.message) return error.message
    return 'Failed to load conversations'
}
