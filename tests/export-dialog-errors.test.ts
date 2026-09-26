// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { RateLimitError, describeListError } from '../src/utils/rateLimit'

/**
 * `fetchAllConversations` resolves with whatever it collected and reports the
 * failure through `onError`, so a throttled list load used to reach the dialog
 * as an empty list — `0 / 0`, indistinguishable from an account with no
 * conversations. These pin the message the dialog now shows instead.
 */
describe('describeListError', () => {
    it('quotes the wait the server actually asked for', () => {
        const message = describeListError(new RateLimitError('45'))
        expect(message).toContain('429')
        expect(message).toContain('45s')
        expect(message).toContain('asked to wait')
    })

    it('does not present the internal fallback as a server promise', () => {
        const error = new RateLimitError(null)
        expect(error.retryAfterFromServer).toBe(false)
        expect(error.retryAfterMs).toBe(30_000)

        const message = describeListError(error)
        expect(message).toContain('429')
        expect(message).toContain('no Retry-After')
        // The 30s fallback governs our own retry pacing, not what we tell a person.
        expect(message).not.toContain('30s')
    })

    it('passes other errors through', () => {
        expect(describeListError(new Error('Forbidden'))).toBe('Forbidden')
    })

    it('never renders an empty message', () => {
        const blank = new Error('placeholder')
        blank.message = ''
        expect(describeListError(blank)).toBe('Failed to load conversations')
        expect(describeListError(undefined)).toBe('Failed to load conversations')
        expect(describeListError('boom')).toBe('Failed to load conversations')
    })
})
