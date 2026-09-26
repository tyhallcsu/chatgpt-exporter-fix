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
    it('names a rate limit and how long to wait', () => {
        const message = describeListError(new RateLimitError('45'))
        expect(message).toContain('429')
        expect(message).toContain('45s')
    })

    it('falls back to the default wait when the server sends no Retry-After', () => {
        const message = describeListError(new RateLimitError(null))
        expect(message).toContain('429')
        expect(message).toContain('30s')
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
